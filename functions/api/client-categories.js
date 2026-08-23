
const CLIENT_COOKIE_NAME = "CLIENT_SESSION_V1";

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
    { name: "HMAC", hash: "SHA-256" },
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

async function verifyClientSession(request, secret, db) {
  const cookie = getCookie(
    request,
    CLIENT_COOKIE_NAME
  );

  if (!cookie) {
    return null;
  }

  const parts = cookie.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;

  try {
    const expected = await createSignature(
      payload,
      secret
    );

    if (signature !== expected) {
      return null;
    }

    const session = JSON.parse(
      base64urlDecode(payload)
    );

    if (session.role !== "client") {
      return null;
    }

    if (
      !session.exp ||
      Date.now() >= Number(session.exp)
    ) {
      return null;
    }

    const clientId = Number(session.sub);

    if (
      !Number.isInteger(clientId) ||
      clientId <= 0
    ) {
      return null;
    }

    const client = await db.prepare(`
      SELECT id, status, session_version
      FROM client_accounts
      WHERE id = ?
      LIMIT 1
    `).bind(clientId).first();

    if (!client) {
      return null;
    }

    if (client.status !== "active") {
      return null;
    }

    const databaseVersion =
      Number(client.session_version || 1);

    const sessionVersion =
      Number(session.version || 0);

    if (sessionVersion !== databaseVersion) {
      return null;
    }

    return {
      id: clientId,
      session
    };

  } catch {
    return null;
  }
}

async function requireClient(context) {
  const secret = context.env.ADMIN_PASSWORD;

  if (!secret) {
    return {
      ok: false,
      response: json({
        success: false,
        message: "Server configuration error."
      }, 500)
    };
  }

  const authenticated =
    await verifyClientSession(
      context.request,
      secret,
      context.env.DB
    );

  if (!authenticated) {
    return {
      ok: false,
      response: json({
        success: false,
        message: "Unauthorized."
      }, 401)
    };
  }

  return {
    ok: true,
    session: authenticated
  };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* =========================
   GET CATEGORIES
========================= */

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (!auth.ok) return auth.response;

  try {
    const result = await context.env.DB.prepare(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.sort_order,
        c.active,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p
        ON p.category_id = c.id
      GROUP BY
        c.id,
        c.name,
        c.slug,
        c.description,
        c.sort_order,
        c.active
      ORDER BY c.sort_order ASC, c.id ASC
    `).all();

    return json({
      success: true,
      categories: result.results || []
    });
  } catch (error) {
    console.error("Admin categories GET error:", error);

    return json({
      success: false,
      message: "Unable to load categories."
    }, 500);
  }
}

/* =========================
   CREATE / UPDATE
========================= */

export async function onRequestPost(context) {
  const auth = await requireClient(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await context.request.json();

    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const imageUrl = String(
      body.imageUrl ?? body.image_url ?? ""
    ).trim();

    const slug = slugify(body.slug || name);

    const sortOrder = Number(
      body.sortOrder ?? body.sort_order ?? 0
    ) || 0;

    const active =
      Number(body.active === undefined ? 1 : body.active)
        ? 1
        : 0;

    const id = Number(body.id || 0);

    if (!name) {
      return json({
        success: false,
        message: "Category name is required."
      }, 400);
    }

    if (!slug) {
      return json({
        success: false,
        message: "Category slug is required."
      }, 400);
    }

    if (id) {
      const result = await context.env.DB.prepare(`
        UPDATE categories
        SET
          name = ?,
          slug = ?,
          description = ?,
          image_url = ?,
          sort_order = ?,
          active = ?
        WHERE id = ?
      `).bind(
        name,
        slug,
        description,
        imageUrl,
        sortOrder,
        active,
        id
      ).run();

      if (!result.meta?.changes) {
        return json({
          success: false,
          message: "Category not found."
        }, 404);
      }

      return json({
        success: true,
        message: "Category updated successfully."
      });
    }

    const result = await context.env.DB.prepare(`
      INSERT INTO categories
        (name, slug, description, image_url, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      name,
      slug,
      description,
      imageUrl,
      sortOrder,
      active
    ).run();

    return json({
      success: true,
      message: "Category created successfully.",
      id: result.meta?.last_row_id || null
    });
  } catch (error) {
    console.error("Admin categories POST error:", error);

    return json({
      success: false,
      message: "Unable to save category."
    }, 500);
  }
}

/* =========================
   DELETE CATEGORY
========================= */

export async function onRequestDelete(context) {
  const auth = await requireClient(context);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = Number(url.searchParams.get("id"));

    if (!id) {
      return json({
        success: false,
        message: "Category ID is required."
      }, 400);
    }

    /* Verify category exists */
    const category = await context.env.DB.prepare(`
      SELECT id, name
      FROM categories
      WHERE id = ?
    `).bind(id).first();

    if (!category) {
      return json({
        success: false,
        message: "Category not found."
      }, 404);
    }

    /*
      Delete all products belonging to this category first.
      This allows the category to be deleted even when it
      contains products.
    */
    const productDelete = await context.env.DB.prepare(`
      DELETE FROM products
      WHERE category_id = ?
    `).bind(id).run();

    /* Now delete the category */
    const categoryDelete = await context.env.DB.prepare(`
      DELETE FROM categories
      WHERE id = ?
    `).bind(id).run();

    if (!categoryDelete.meta?.changes) {
      return json({
        success: false,
        message: "Category could not be deleted."
      }, 500);
    }

    return json({
      success: true,
      message: "Category and all products in it were deleted successfully.",
      deletedCategoryId: id,
      deletedCategoryName: category.name,
      deletedProducts: productDelete.meta?.changes || 0
    });

  } catch (error) {
    console.error("Admin categories DELETE error:", error);

    return json({
      success: false,
      message: "Unable to delete category."
    }, 500);
  }
}
