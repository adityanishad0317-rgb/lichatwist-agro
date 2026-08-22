function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";

  const match = cookies.match(
    new RegExp(`${name}=([^;]+)`)
  );

  return match ? match[1] : null;
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
    "ADMIN_SESSION_V2"
  );

  if (!cookie) return false;

  const parts = cookie.split(".");

  if (parts.length !== 2) return false;

  const [payload, signature] = parts;

  try {
    const expected =
      await createSignature(
        payload,
        secret
      );

    if (signature !== expected) {
      return false;
    }

    const session =
      JSON.parse(
        base64urlDecode(payload)
      );

    return (
      session.exp &&
      Date.now() < session.exp
    );

  } catch {
    return false;
  }
}

function value(body, camelCase, snakeCase) {
  return String(
    body[camelCase] ??
    body[snakeCase] ??
    ""
  );
}

export async function onRequestGet(context) {

  const secret =
    context.env.ADMIN_PASSWORD;

  if (!secret) {
    return json(
      {
        success: false,
        message: "Server configuration error."
      },
      500
    );
  }

  const authenticated =
    await isAuthenticated(
      context.request,
      secret
    );

  if (!authenticated) {
    return json(
      {
        success: false,
        message: "Unauthorized."
      },
      401
    );
  }

  const result =
    await context.env.DB.prepare(
      "SELECT * FROM site_content WHERE id = 1"
    ).first();

  return json({
    success: true,
    content: result || null
  });
}

export async function onRequestPost(context) {

  const secret =
    context.env.ADMIN_PASSWORD;

  if (!secret) {
    return json(
      {
        success: false,
        message: "Server configuration error."
      },
      500
    );
  }

  const authenticated =
    await isAuthenticated(
      context.request,
      secret
    );

  if (!authenticated) {
    return json(
      {
        success: false,
        message: "Unauthorized."
      },
      401
    );
  }

  try {

    const body =
      await context.request.json();

    await context.env.DB.prepare(`
      UPDATE site_content
      SET

        business_name = ?,
        phone = ?,
        email = ?,
        address = ?,
        about = ?,

        whatsapp = ?,

        hero_title = ?,
        hero_subtitle = ?,
        hero_description = ?,
        approach_title = ?,
        approach_description = ?,

        about_heading = ?,
        about_description = ?,
        mission = ?,
        vision = ?,
        values_text = ?,

        agriculture_title = ?,
        agriculture_description = ?,
        agriculture_image = ?,

        construction_title = ?,
        construction_description = ?,
        construction_image = ?,

        transport_title = ?,
        transport_description = ?,
        transport_image = ?,

      agro_company_name = ?,
agro_company_description = ?,
agro_company_image =
  COALESCE(NULLIF(?, ''), agro_company_image),

construction_company_name = ?,
construction_company_description = ?,
construction_company_image =
  COALESCE(NULLIF(?, ''), construction_company_image),

transport_company_name = ?,
transport_company_description = ?,
transport_company_image =
  COALESCE(NULLIF(?, ''), transport_company_image),

projects_heading = ?,
projects_description = ?,

project1_image =
  COALESCE(NULLIF(?, ''), project1_image),

project2_image =
  COALESCE(NULLIF(?, ''), project2_image),

project3_image =
  COALESCE(NULLIF(?, ''), project3_image),
project1_category = ?,
project1_title = ?,
project1_description = ?,

project2_category = ?,
project2_title = ?,
project2_description = ?,

project3_category = ?,
project3_title = ?,
project3_description = ?,

updated_at = CURRENT_TIMESTAMP      WHERE id = 1
    `)
      .bind(

        value(body, "businessName", "business_name"),
        value(body, "phone"),
        value(body, "email"),
        value(body, "address"),
        value(body, "about"),

        value(body, "whatsapp"),

        value(body, "heroTitle", "hero_title"),
        value(body, "heroSubtitle", "hero_subtitle"),
        value(body, "heroDescription", "hero_description"),
        value(body, "approachTitle", "approach_title"),
        value(body, "approachDescription", "approach_description"),

        value(body, "aboutHeading", "about_heading"),
        value(body, "aboutDescription", "about_description"),
        value(body, "mission"),
        value(body, "vision"),
        value(body, "valuesText", "values_text"),

        value(body, "agricultureTitle", "agriculture_title"),
        value(body, "agricultureDescription", "agriculture_description"),
        value(body, "agricultureImage", "agriculture_image"),

        value(body, "constructionTitle", "construction_title"),
        value(body, "constructionDescription", "construction_description"),
        value(body, "constructionImage", "construction_image"),

        value(body, "transportTitle", "transport_title"),
        value(body, "transportDescription", "transport_description"),
        value(body, "transportImage", "transport_image"),

       value(body, "agroCompanyName", "agro_company_name"),
value(body, "agroCompanyDescription", "agro_company_description"),
value(body, "agroCompanyImage", "agro_company_image"),

value(body, "constructionCompanyName", "construction_company_name"),
value(body, "constructionCompanyDescription", "construction_company_description"),
value(body, "constructionCompanyImage", "construction_company_image"),

value(body, "transportCompanyName", "transport_company_name"),
value(body, "transportCompanyDescription", "transport_company_description"),
value(body, "transportCompanyImage", "transport_company_image"),

       value(body, "projectsHeading", "projects_heading"),
value(body, "projectsDescription", "projects_description"),

value(body, "project1Image", "project1_image"),
value(body, "project2Image", "project2_image"),
value(body, "project3Image", "project3_image"),

value(body, "project1Category", "project1_category"),
value(body, "project1Title", "project1_title"),
value(body, "project1Description", "project1_description"),

value(body, "project2Category", "project2_category"),
value(body, "project2Title", "project2_title"),
value(body, "project2Description", "project2_description"),

value(body, "project3Category", "project3_category"),
value(body, "project3Title", "project3_title"),
value(body, "project3Description", "project3_description")
      )
      .run();

    return json({
      success: true,
      message: "Content saved successfully."
    });

  } catch (error) {

    return json(
      {
        success: false,
        message: "Unable to save content."
      },
      500
    );
  }
}
