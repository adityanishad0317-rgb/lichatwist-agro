
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


function getValue(body, ...keys) {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null) return body[key];
  }
  return "";
}

function safeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (!auth.ok) return auth.response;

  try {
    const result = await context.env.DB.prepare(`
      SELECT
        p.id,
        p.category_id,
        p.title,
        p.slug,
        p.short_description,
        p.description,
        p.specifications,
        p.origin,
        p.packaging,
        p.minimum_order_quantity,
        p.availability,
        p.featured,
        p.published,
        p.main_image_url,
        p.created_at,
        p.updated_at,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.featured DESC, p.id DESC
    `).all();

    return json({
      success: true,
      products: result.results || []
    });
  } catch (error) {
    console.error("Client products GET error:", error);
    return json({
      success: false,
      message: "Unable to load products."
    }, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireClient(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await context.request.json();

    const categoryId = Number(
      getValue(body, "categoryId", "category_id")
    );
    const title = String(getValue(body, "title")).trim();
    const slug = safeSlug(getValue(body, "slug") || title);

    if (!categoryId || !title || !slug) {
      return json({
        success: false,
        message: "Category, title and slug are required."
      }, 400);
    }

    const category = await context.env.DB.prepare(`
      SELECT id FROM categories WHERE id = ? LIMIT 1
    `).bind(categoryId).first();

    if (!category) {
      return json({
        success: false,
        message: "Selected category not found."
      }, 400);
    }

    const shortDescription = String(
      getValue(body, "shortDescription", "short_description")
    ).trim();

    const description = String(
      getValue(body, "description")
    ).trim();

    const specifications = String(
      getValue(body, "specifications")
    ).trim();

    const origin = String(
      getValue(body, "origin")
    ).trim();

    const packaging = String(
      getValue(body, "packaging")
    ).trim();

    const minimumOrderQuantity = String(
      getValue(body, "minimumOrderQuantity", "minimum_order_quantity")
    ).trim();

    const allowedAvailability = [
      "available",
      "limited",
      "out_of_stock"
    ];

    const availabilityRaw = String(
      getValue(body, "availability") || "available"
    ).trim();

    const availability = allowedAvailability.includes(availabilityRaw)
      ? availabilityRaw
      : "available";

    const featured = Number(getValue(body, "featured")) ? 1 : 0;

    const published = body.published === undefined
      ? 1
      : (Number(body.published) ? 1 : 0);

    const mainImageUrl = String(
      getValue(body, "mainImageUrl", "main_image_url")
    ).trim();

    const now = new Date().toISOString();

    const result = await context.env.DB.prepare(`
      INSERT INTO products (
        category_id,
        title,
        slug,
        short_description,
        description,
        specifications,
        origin,
        packaging,
        minimum_order_quantity,
        availability,
        featured,
        published,
        main_image_url,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      categoryId,
      title,
      slug,
      shortDescription,
      description,
      specifications,
      origin,
      packaging,
      minimumOrderQuantity,
      availability,
      featured,
      published,
      mainImageUrl,
      now,
      now
    ).run();

    return json({
      success: true,
      message: "Product created successfully.",
      id: result.meta?.last_row_id || null
    });
  } catch (error) {
    console.error("Client products POST error:", error);
    return json({
      success: false,
      message: "Unable to create product."
    }, 500);
  }
}

export async function onRequestPut(context) {
  const auth = await requireClient(context);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = Number(url.searchParams.get("id"));

    if (!id) {
      return json({
        success: false,
        message: "Product ID is required."
      }, 400);
    }

    const body = await context.request.json();

    const categoryId = Number(
      getValue(body, "categoryId", "category_id")
    );
    const title = String(getValue(body, "title")).trim();
    const slug = safeSlug(getValue(body, "slug") || title);

    if (!categoryId || !title || !slug) {
      return json({
        success: false,
        message: "Category, title and slug are required."
      }, 400);
    }

    const shortDescription = String(
      getValue(body, "shortDescription", "short_description")
    ).trim();

    const description = String(
      getValue(body, "description")
    ).trim();

    const specifications = String(
      getValue(body, "specifications")
    ).trim();

    const origin = String(
      getValue(body, "origin")
    ).trim();

    const packaging = String(
      getValue(body, "packaging")
    ).trim();

    const minimumOrderQuantity = String(
      getValue(body, "minimumOrderQuantity", "minimum_order_quantity")
    ).trim();

    const allowedAvailability = [
      "available",
      "limited",
      "out_of_stock"
    ];

    const availabilityRaw = String(
      getValue(body, "availability") || "available"
    ).trim();

    const availability = allowedAvailability.includes(availabilityRaw)
      ? availabilityRaw
      : "available";

    const featured = Number(getValue(body, "featured")) ? 1 : 0;

    const published = body.published === undefined
      ? 1
      : (Number(body.published) ? 1 : 0);

    const mainImageUrl = String(
      getValue(body, "mainImageUrl", "main_image_url")
    ).trim();

    const now = new Date().toISOString();

    const result = await context.env.DB.prepare(`
      UPDATE products
      SET
        category_id = ?,
        title = ?,
        slug = ?,
        short_description = ?,
        description = ?,
        specifications = ?,
        origin = ?,
        packaging = ?,
        minimum_order_quantity = ?,
        availability = ?,
        featured = ?,
        published = ?,
        main_image_url = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      categoryId,
      title,
      slug,
      shortDescription,
      description,
      specifications,
      origin,
      packaging,
      minimumOrderQuantity,
      availability,
      featured,
      published,
      mainImageUrl,
      now,
      id
    ).run();

    if (!result.meta?.changes) {
      return json({
        success: false,
        message: "Product not found."
      }, 404);
    }

    return json({
      success: true,
      message: "Product updated successfully."
    });
  } catch (error) {
    console.error("Client products PUT error:", error);
    return json({
      success: false,
      message: "Unable to update product."
    }, 500);
  }
}

export async function onRequestDelete(context) {
  const auth = await requireClient(context);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = Number(url.searchParams.get("id"));

    if (!id) {
      return json({
        success: false,
        message: "Product ID is required."
      }, 400);
    }

    const result = await context.env.DB.prepare(`
      DELETE FROM products WHERE id = ?
    `).bind(id).run();

    if (!result.meta?.changes) {
      return json({
        success: false,
        message: "Product not found."
      }, 404);
    }

    return json({
      success: true,
      message: "Product deleted successfully."
    });
  } catch (error) {
    console.error("Client products DELETE error:", error);
    return json({
      success: false,
      message: "Unable to delete product."
    }, 500);
  }
}
