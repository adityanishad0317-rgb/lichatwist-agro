const ADMIN_COOKIE_NAME =
  "ADMIN_SESSION_V2";


/* =========================================
   JSON RESPONSE
========================================= */

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


/* =========================================
   COOKIE
========================================= */

function getCookie(
  request,
  name
) {

  const cookies =
    request.headers.get("Cookie") || "";

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


/* =========================================
   BASE64URL DECODE
========================================= */

function base64urlDecode(
  value
) {

  value =
    value
      .replace(
        /-/g,
        "+"
      )
      .replace(
        /_/g,
        "/"
      );


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
      c =>
        c.charCodeAt(0)
    );


  return new TextDecoder()
    .decode(bytes);

}


/* =========================================
   ADMIN SIGNATURE
========================================= */

async function createSignature(
  data,
  secret
) {

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        secret
      ),
      {
        name:
          "HMAC",

        hash:
          "SHA-256"
      },
      false,
      ["sign"]
    );


  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        data
      )
    );


  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        signature
      )
    )
  )
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/,
      ""
    );

}


/* =========================================
   VERIFY OWNER SESSION
========================================= */

async function verifyAdminSession(
  request,
  secret
) {

  const cookie =
    getCookie(
      request,
      ADMIN_COOKIE_NAME
    );


  if (!cookie) {

    return false;

  }


  const parts =
    cookie.split(".");


  if (
    parts.length !== 2
  ) {

    return false;

  }


  const payload =
    parts[0];

  const signature =
    parts[1];


  try {

    const expected =
      await createSignature(
        payload,
        secret
      );


    if (
      signature !==
      expected
    ) {

      return false;

    }


    const session =
      JSON.parse(
        base64urlDecode(
          payload
        )
      );


    /*
     * Client sessions must never
     * be accepted as owner sessions.
     */

    if (
      session.role === "client"
    ) {

      return false;

    }


    return Boolean(
      session.exp &&
      Date.now() <
        session.exp
    );


  } catch {

    return false;

  }

}


/* =========================================
   DELETE CLIENT
========================================= */

export async function onRequestPost(
  context
) {

  try {

    const secret =
      context.env.ADMIN_PASSWORD;


    if (!secret) {

      return json(
        {
          success:
            false,

          message:
            "Server configuration error."
        },
        500
      );

    }


    /*
     * Only an authenticated
     * Owner/Admin can delete clients.
     */

    const authenticated =
      await verifyAdminSession(
        context.request,
        secret
      );


    if (!authenticated) {

      return json(
        {
          success:
            false,

          message:
            "Unauthorized."
        },
        401
      );

    }


    const body =
      await context.request.json();


    const clientId =
      Number(
        body.id
      );


    if (
      !Number.isInteger(
        clientId
      ) ||
      clientId <= 0
    ) {

      return json(
        {
          success:
            false,

          message:
            "A valid client ID is required."
        },
        400
      );

    }


    /*
     * Confirm that the client exists
     * before deleting anything.
     */

    const client =
      await context.env.DB.prepare(`
        SELECT
          id,
          name,
          email
        FROM client_accounts
        WHERE id = ?
        LIMIT 1
      `)
      .bind(clientId)
      .first();


    if (!client) {

      return json(
        {
          success:
            false,

          message:
            "Client account not found."
        },
        404
      );

    }


    /*
     * First remove any password-reset
     * tokens belonging to this client.
     *
     * This is required because the current
     * database relationship does not use
     * ON DELETE CASCADE.
     */

    await context.env.DB.prepare(`
      DELETE FROM password_reset_tokens
      WHERE client_id = ?
    `)
    .bind(clientId)
    .run();


    /*
     * Now delete the client account.
     */

    const result =
      await context.env.DB.prepare(`
        DELETE FROM client_accounts
        WHERE id = ?
      `)
      .bind(clientId)
      .run();


    if (
      !result.success
    ) {

      return json(
        {
          success:
            false,

          message:
            "Unable to delete client account."
        },
        500
      );

    }


    return json({
      success:
        true,

      message:
        `Client "${client.name}" was permanently deleted.`
    });


  } catch {

    return json(
      {
        success:
          false,

        message:
          "Unable to delete client account."
      },
      500
    );

  }

}
