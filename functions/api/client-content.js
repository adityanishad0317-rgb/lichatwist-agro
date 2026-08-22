const CLIENT_COOKIE_NAME = "CLIENT_SESSION_V1";


function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store"
      }
    }
  );

}


function getCookie(
  request,
  name
) {

  const cookies =
    request.headers.get(
      "Cookie"
    ) || "";


  const parts =
    cookies.split(";");


  for (
    const part of parts
  ) {

    const trimmed =
      part.trim();


    if (
      trimmed.startsWith(
        name + "="
      )
    ) {

      return trimmed.substring(
        name.length + 1
      );

    }

  }


  return null;

}


function base64urlDecode(
  value
) {

  value =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");


  while (
    value.length % 4
  ) {

    value += "=";

  }


  const binary =
    atob(value);


  const bytes =
    Uint8Array.from(
      binary,
      c => c.charCodeAt(0)
    );


  return new TextDecoder()
    .decode(bytes);

}


async function createSignature(
  data,
  secret
) {

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder()
        .encode(secret),

      {
        name: "HMAC",
        hash: "SHA-256"
      },

      false,

      ["sign"]
    );


  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder()
        .encode(data)
    );


  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        signature
      )
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

}


async function verifyClientSession(
  request,
  secret,
  db
) {

  const cookie =
    getCookie(
      request,
      CLIENT_COOKIE_NAME
    );


  if (!cookie) {

    return null;

  }


  const parts =
    cookie.split(".");


  if (
    parts.length !== 2
  ) {

    return null;

  }


  const [
    payload,
    signature
  ] = parts;


  try {

    const expected =
      await createSignature(
        payload,
        secret
      );


    if (
      signature !== expected
    ) {

      return null;

    }


    const session =
      JSON.parse(
        base64urlDecode(
          payload
        )
      );


    if (
      session.role !==
      "client"
    ) {

      return null;

    }


    if (
      !session.exp ||
      Date.now() >= session.exp
    ) {

      return null;

    }


    const clientId =
      Number(
        session.sub
      );


    if (
      !Number.isInteger(
        clientId
      ) ||
      clientId <= 0
    ) {

      return null;

    }


    const client =
      await db.prepare(`
        SELECT
          id,
          status,
          session_version
        FROM client_accounts
        WHERE id = ?
        LIMIT 1
      `)
        .bind(
          clientId
        )
        .first();


    if (!client) {

      return null;

    }


    if (
      client.status !==
      "active"
    ) {

      return null;

    }


    const databaseVersion =
      Number(
        client.session_version ||
        1
      );


    const sessionVersion =
      Number(
        session.version ||
        0
      );


    if (
      sessionVersion !==
      databaseVersion
    ) {

      return null;

    }


    return {
      id: clientId,
      session: session
    };

  } catch {

    return null;

  }

}


/* =========================================
   GET CURRENT WEBSITE CONTENT
========================================= */

async function getWebsiteContent(
  db
) {

  const row =
  await db.prepare(`
    SELECT *
    FROM site_content
    WHERE id = 1
    LIMIT 1
  `)
    .first();

  if (!row) {

    return {};

  }


return row || {};
}


/* =========================================
   MAIN REQUEST
========================================= */

export async function onRequest(
  context
) {

  try {

    const secret =
      context.env.ADMIN_PASSWORD;


    if (!secret) {

      return json(
        {
          success: false,
          message:
            "Server configuration error."
        },

        500
      );

    }


    const authenticated =
      await verifyClientSession(
        context.request,
        secret,
        context.env.DB
      );


    if (!authenticated) {

      return json(
        {
          success: false,
          message:
            "Unauthorized."
        },

        401
      );

    }


    /*
     * -------------------------------------
     * GET
     * -------------------------------------
     */

    if (
      context.request.method ===
      "GET"
    ) {

      const content =
        await getWebsiteContent(
          context.env.DB
        );


      return json({

        success: true,

        content: content

      });

    }


    /*
     * -------------------------------------
     * POST
     * -------------------------------------
     */

   /* =========================================
   CLIENT-SAFE CONTENT FIELDS
========================================= */

const CLIENT_CONTENT_FIELDS = [

  "business_name",
  "phone",
  "email",
  "address",
  "about",
  "whatsapp",

  "hero_title",
  "hero_subtitle",
  "hero_description",

  "approach_title",
  "approach_description",

  "about_heading",
  "about_description",

  "mission",
  "vision",
  "values_text",

  "agriculture_title",
  "agriculture_description",
  "agriculture_image",

  "construction_title",
  "construction_description",
  "construction_image",

  "transport_title",
  "transport_description",
  "transport_image",

  "agro_company_name",
  "agro_company_description",
  "agro_company_image",

  "construction_company_name",
  "construction_company_description",
  "construction_company_image",

  "transport_company_name",
  "transport_company_description",
  "transport_company_image",

  "projects_heading",
  "projects_description",

  "project1_category",
  "project1_title",
  "project1_description",
  "project1_image",

  "project2_category",
  "project2_title",
  "project2_description",
  "project2_image",

  "project3_category",
  "project3_title",
  "project3_description",
  "project3_image"

];


/* =========================================
   POST CLIENT CONTENT
========================================= */

if (
  context.request.method ===
  "POST"
) {

  const body =
    await context.request.json();


  if (
    !body ||
    typeof body.content !==
    "object" ||
    body.content === null ||
    Array.isArray(body.content)
  ) {

    return json(
      {
        success: false,
        message:
          "Invalid content data."
      },
      400
    );

  }


  /*
   * Read the existing database row.
   */

  const existing =
    await context.env.DB.prepare(`
      SELECT *
      FROM site_content
      WHERE id = 1
      LIMIT 1
    `)
      .first();


  if (!existing) {

    return json(
      {
        success: false,
        message:
          "Website content record not found."
      },
      404
    );

  }


  /*
   * Build a SAFE update object.
   *
   * Only fields explicitly listed in
   * CLIENT_CONTENT_FIELDS are accepted.
   *
   * Security fields such as:
   *
   * id
   * updated_at
   * authentication data
   * client accounts
   * admin data
   *
   * can never be updated through this API.
   */

  const updates = {};


  for (
    const field of
    CLIENT_CONTENT_FIELDS
  ) {

    if (
      Object.prototype.hasOwnProperty.call(
        body.content,
        field
      )
    ) {

      const value =
        body.content[field];


      /*
       * Website content fields are
       * stored as text.
       *
       * Convert incoming values to
       * strings and prevent null,
       * objects or arrays from being
       * written into the database.
       */

      if (
        value === null ||
        value === undefined
      ) {

        updates[field] = "";

      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {

        updates[field] =
          String(value);

      }

    }

  }


  /*
   * Never perform an empty UPDATE.
   */

  const fields =
    Object.keys(updates);


  if (
    fields.length === 0
  ) {

    return json(
      {
        success: false,
        message:
          "No permitted content fields were supplied."
      },
      400
    );

  }


  /*
   * Build the SQL UPDATE statement
   * only from our hard-coded allow-list.
   *
   * The field names cannot come from
   * the client request.
   */

  const assignments =
    fields
      .map(
        field =>
          `"${field}" = ?`
      )
      .join(", ");


  const values =
    fields.map(
      field =>
        updates[field]
    );


  /*
   * Always control updated_at on
   * the server.
   */

  const sql = `
    UPDATE site_content
    SET
      ${assignments},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `;


  await context.env.DB.prepare(
    sql
  )
    .bind(...values)
    .run();


  return json({

    success: true,

    message:
      "Client content saved successfully.",

    updatedFields:
      fields,

    clientId:
      authenticated.id

  });

}

    return json(
      {
        success: false,
        message:
          "Method not allowed."
      },

      405
    );


  } catch (error) {

    return json(
      {
        success: false,
        message:
          "Unable to process client content request."
      },

      500
    );

  }

}
