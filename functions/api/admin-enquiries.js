const ADMIN_COOKIE_NAME = "ADMIN_SESSION_V2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";

  for (const part of cookies.split(";")) {
    const trimmed = part.trim();

    if (trimmed.startsWith(name + "=")) {
      return trimmed.substring(name.length + 1);
    }
  }

  return null;
}

function base64urlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const binary = atob(value);

  const bytes = Uint8Array.from(
    binary,
    c => c.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}

async function createSignature(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return btoa(
    String.fromCharCode(
      ...new Uint8Array(signature)
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function isAuthenticated(request, secret) {
  const cookie = getCookie(
    request,
    ADMIN_COOKIE_NAME
  );

  if (!cookie) return false;

  const parts = cookie.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;

  try {
    const expected = await createSignature(
      payload,
      secret
    );

    if (signature !== expected) {
      return false;
    }

    const session = JSON.parse(
      base64urlDecode(payload)
    );

    return Boolean(
      session.exp &&
      Date.now() < session.exp
    );
  } catch {
    return false;
  }
}

async function requireAdmin(context) {
  const secret = context.env.ADMIN_PASSWORD;

  if (!secret) {
    return {
      ok: false,
      response: json(
        {
          success: false,
          message: "Server configuration error."
        },
        500
      )
    };
  }

  const authenticated = await isAuthenticated(
    context.request,
    secret
  );

  if (!authenticated) {
    return {
      ok: false,
      response: json(
        {
          success: false,
          message: "Unauthorized."
        },
        401
      )
    };
  }

  return {
    ok: true
  };
}

function clean(value, max = 5000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/* =====================================================
   ADMIN ENQUIRIES API

   GET    /api/admin-enquiries
   PUT    /api/admin-enquiries?id=123
   DELETE /api/admin-enquiries?id=123
   ===================================================== */

export async function onRequest(context) {
  const auth = await requireAdmin(context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const url = new URL(context.request.url);

    const id = Number(
      url.searchParams.get("id") || 0
    );

    /* =========================
       GET ENQUIRIES
       ========================= */

    if (context.request.method === "GET") {
      const status = clean(
        url.searchParams.get("status"),
        40
      );

      const search = clean(
        url.searchParams.get("search"),
        200
      );

      let sql = `
        SELECT
          e.id,
          e.client_id,
          e.product_id,
          e.name,
          e.email,
          e.phone,
          e.subject,
          e.message,
          e.source,
          e.status,
          e.admin_notes,
          e.created_at,
          e.updated_at,
          p.title AS product_title,
          p.slug AS product_slug
        FROM enquiries e
        LEFT JOIN products p
          ON p.id = e.product_id
        WHERE 1=1
      `;

      const binds = [];

      if (status) {
        sql += ` AND e.status = ?`;
        binds.push(status);
      }

      if (search) {
        sql += `
          AND (
            e.name LIKE ?
            OR e.email LIKE ?
            OR e.phone LIKE ?
            OR e.subject LIKE ?
            OR e.message LIKE ?
            OR p.title LIKE ?
          )
        `;

        const q = `%${search}%`;

        binds.push(
          q,
          q,
          q,
          q,
          q,
          q
        );
      }

      sql += `
        ORDER BY e.created_at DESC
      `;

      const result = await context.env.DB
        .prepare(sql)
        .bind(...binds)
        .all();

      return json({
        success: true,
        enquiries: result.results || []
      });
    }

    /* =========================
       UPDATE ENQUIRY
       ========================= */

    if (context.request.method === "PUT") {
      if (!id) {
        return json(
          {
            success: false,
            message: "Enquiry ID is required."
          },
          400
        );
      }

      const body =
        await context.request.json();

      const allowedStatuses = [
        "new",
        "contacted",
        "replied",
        "closed"
      ];

      const status = clean(
        body.status,
        40
      );

      const adminNotes = clean(
        body.admin_notes,
        5000
      );

      if (!allowedStatuses.includes(status)) {
        return json(
          {
            success: false,
            message: "Invalid enquiry status."
          },
          400
        );
      }

      const now =
        new Date().toISOString();

      const result =
        await context.env.DB
          .prepare(`
            UPDATE enquiries
            SET
              status = ?,
              admin_notes = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .bind(
            status,
            adminNotes || null,
            now,
            id
          )
          .run();

      if (
        !result.success ||
        !result.meta?.changes
      ) {
        return json(
          {
            success: false,
            message:
              "Enquiry not found or update failed."
          },
          404
        );
      }

      return json({
        success: true,
        message:
          "Enquiry updated successfully."
      });
    }

    /* =========================
       DELETE ENQUIRY
       ========================= */

    if (
      context.request.method === "DELETE"
    ) {
      if (!id) {
        return json(
          {
            success: false,
            message:
              "Enquiry ID is required."
          },
          400
        );
      }

      const result =
        await context.env.DB
          .prepare(`
            DELETE FROM enquiries
            WHERE id = ?
          `)
          .bind(id)
          .run();

      if (
        !result.success ||
        !result.meta?.changes
      ) {
        return json(
          {
            success: false,
            message:
              "Enquiry not found."
          },
          404
        );
      }

      return json({
        success: true,
        message:
          "Enquiry deleted successfully."
      });
    }

    return json(
      {
        success: false,
        message: "Method not allowed."
      },
      405
    );

  } catch (error) {
    console.error(
      "Admin enquiries API error:",
      error
    );

    return json(
      {
        success: false,
        message:
          "Unable to process enquiry request."
      },
      500
    );
  }
}
