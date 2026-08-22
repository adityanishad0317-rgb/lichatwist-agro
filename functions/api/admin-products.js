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
  const parts = cookies.split(";");

  for (const part of parts) {
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

function value(body, camelCase, snakeCase = camelCase) {
  return body[camelCase] ?? body[snakeCase] ?? "";
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

/* =====================================================
   GET
   Returns all products, including unpublished products,
   plus all categories for the admin editor.
===================================================== */

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const products = await context.env.DB.prepare(`
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
        p.created_by_role,
        p.created_by_id,
        p.created_at,
        p.updated_at,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      ORDER BY p.id DESC
    `).all();

    const categories = await context.env.DB.prepare(`
      SELECT
        id,
        name,
        slug,
        description,
        image_url,
        sort_order,
        active
      FROM categories
      ORDER BY sort_order ASC, id ASC
    `).all();

    return json({
      success: true,
      products: products.results || [],
      categories: categories.results || []
    });
  } catch (error) {
    console.error("Admin products GET error:", error);

    return json(
      {
        success: false,
        message: "Unable to load products."
      },
      500
    );
  }
}

/* =====================================================
   POST
   Create a new product.
===================================================== */

export async function onRequestPost(context) {
  const auth = await requireAdmin(context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await context.request.json();

    const categoryId = Number(
      value(body, "categoryId", "category_id")
    );

    const title = String(
      value(body, "title")
    ).trim();

    const slug = String(
      value(body, "slug")
    ).trim();

    const shortDescription = String(
      value(body, "shortDescription", "short_description")
    ).trim();

    const description = String(
      value(body, "description")
    ).trim();

    const specifications = String(
      value(body, "specifications")
    ).trim();

    const origin = String(
      value(body, "origin")
    ).trim();

    const packaging = String(
      value(body, "packaging")
    ).trim();

    const minimumOrderQuantity = String(
      value(
        body,
        "minimumOrderQuantity",
        "minimum_order_quantity"
      )
    ).trim();

    const availability = String(
      value(body, "availability")
    ).trim();

    const mainImageUrl = String(
      value(body, "mainImageUrl", "main_image_url")
    ).trim();

    const featured = Number(
      value(body, "featured")
    ) ? 1 : 0;

    const published =
      value(body, "published") === undefined
        ? 1
        : (Number(value(body, "published")) ? 1 : 0);

    if (!title) {
      return json(
        {
          success: false,
          message: "Product title is required."
        },
        400
      );
    }

    if (!categoryId) {
      return json(
        {
          success: false,
          message: "Product category is required."
        },
        400
      );
    }

    if (!slug) {
      return json(
        {
          success: false,
          message: "Product slug is required."
        },
        400
      );
    }

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
        created_by_role,
        created_by_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
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
        "admin",
        null,
        now,
        now
      )
      .run();

    return json({
      success: true,
      message: "Product created successfully.",
      id: result.meta?.last_row_id || null
    });
  } catch (error) {
    console.error("Admin products POST error:", error);

    return json(
      {
        success: false,
        message: "Unable to create product: " + (error?.message || "Unknown database error.")
      },
      500
    );
  }
}

/* =====================================================
   PUT
   Update an existing product.
===================================================== */

export async function onRequestPut(context) {
  const auth = await requireAdmin(context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await context.request.json();

    const id = Number(
      value(body, "id")
    );

    if (!id) {
      return json(
        {
          success: false,
          message: "Product ID is required."
        },
        400
      );
    }

    const categoryId = Number(
      value(body, "categoryId", "category_id")
    );

    const title = String(
      value(body, "title")
    ).trim();

    const slug = String(
      value(body, "slug")
    ).trim();

    if (!categoryId || !title || !slug) {
      return json(
        {
          success: false,
          message: "Category, title and slug are required."
        },
        400
      );
    }

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
    `)
      .bind(
        categoryId,
        title,
        slug,
        String(value(body, "shortDescription", "short_description")).trim(),
        String(value(body, "description")).trim(),
        String(value(body, "specifications")).trim(),
        String(value(body, "origin")).trim(),
        String(value(body, "packaging")).trim(),
        String(value(body, "minimumOrderQuantity", "minimum_order_quantity")).trim(),
        String(value(body, "availability")).trim(),
        Number(value(body, "featured")) ? 1 : 0,
        Number(value(body, "published")) ? 1 : 0,
        String(value(body, "mainImageUrl", "main_image_url")).trim(),
        now,
        id
      )
      .run();

    if (!result.meta?.changes) {
      return json(
        {
          success: false,
          message: "Product not found."
        },
        404
      );
    }

    return json({
      success: true,
      message: "Product updated successfully."
    });
  } catch (error) {
    console.error("Admin products PUT error:", error);

    return json(
      {
        success: false,
        message: "Unable to update product."
      },
      500
    );
  }
}

/* =====================================================
   DELETE
===================================================== */

export async function onRequestDelete(context) {
  const auth = await requireAdmin(context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const url = new URL(context.request.url);
    const id = Number(
      url.searchParams.get("id")
    );

    if (!id) {
      return json(
        {
          success: false,
          message: "Product ID is required."
        },
        400
      );
    }

    const result = await context.env.DB.prepare(`
      DELETE FROM products
      WHERE id = ?
    `)
      .bind(id)
      .run();

    if (!result.meta?.changes) {
      return json(
        {
          success: false,
          message: "Product not found."
        },
        404
      );
    }

    return json({
      success: true,
      message: "Product deleted successfully."
    });
  } catch (error) {
    console.error("Admin products DELETE error:", error);

    return json(
      {
        success: false,
        message: "Unable to delete product."
      },
      500
    );
  }
}
