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

async function verifyClientSession(request, secret, db) {
  const cookie = getCookie(
    request,
    CLIENT_COOKIE_NAME
  );

  if (!cookie) return null;

  const parts = cookie.split(".");

  if (parts.length !== 2) return null;

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
    `)
      .bind(clientId)
      .first();

    if (!client) return null;

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

export async function onRequestGet(context) {
  const auth = await requireClient(context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await context.env.DB.prepare(`
      SELECT
        e.id,
        e.product_id,
        e.name,
        e.email,
        e.phone,
        e.subject,
        e.message,
        e.source,
        e.status,
        e.created_at,
        e.updated_at,
        p.title AS product_title,
        p.slug AS product_slug
      FROM enquiries e
      LEFT JOIN products p
        ON p.id = e.product_id
      ORDER BY e.created_at DESC
    `)
      .all();

    return json({
      success: true,
      enquiries: result.results || []
    });

  } catch (error) {
    console.error(
      "Client enquiries GET error:",
      error
    );

    return json({
      success: false,
      message: "Unable to load enquiries."
    }, 500);
  }
}
