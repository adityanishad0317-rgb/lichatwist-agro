function json(data, status = 200) {

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
    request.headers.get("Cookie") || "";

  const match =
    cookies.match(
      new RegExp(
        `${name}=([^;]+)`
      )
    );

  return match
    ? match[1]
    : null;

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
      c =>
        c.charCodeAt(0)
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
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

}


async function isAuthenticated(
  request,
  secret
) {

  const cookie =
    getCookie(
      request,
      "ADMIN_SESSION_V2"
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
   ALLOWED THEMES
========================================= */

const ALLOWED_THEMES = [

  "classic",

  "ocean",

  "emerald",

  "purple",

  "sunset",

  "slate",

  "earth"

];


/* =========================================
   GET CURRENT THEME
========================================= */

export async function onRequestGet(
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


    const authenticated =
      await isAuthenticated(
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


    const result =
      await context.env.DB.prepare(`
        SELECT
          theme_key,
          updated_at
        FROM site_theme_settings
        WHERE id = 1
      `)
      .first();


    return json({
      success:
        true,

      theme:
        result?.theme_key ||
        "classic",

      updated_at:
        result?.updated_at ||
        null
    });


  } catch {

    return json(
      {
        success:
          false,

        message:
          "Unable to load theme settings."
      },
      500
    );

  }

}


/* =========================================
   SAVE THEME
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


    const authenticated =
      await isAuthenticated(
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


    const theme =
      String(
        body.theme || ""
      )
      .trim()
      .toLowerCase();


    if (
      !ALLOWED_THEMES.includes(
        theme
      )
    ) {

      return json(
        {
          success:
            false,

          message:
            "Invalid theme selected."
        },
        400
      );

    }


    await context.env.DB.prepare(`
      INSERT INTO site_theme_settings (
        id,
        theme_key,
        updated_at
      )
      VALUES (
        1,
        ?,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(id)
      DO UPDATE SET

        theme_key =
          excluded.theme_key,

        updated_at =
          CURRENT_TIMESTAMP
    `)
    .bind(theme)
    .run();


    return json({
      success:
        true,

      theme:
        theme,

      message:
        "Website theme updated successfully."
    });


  } catch {

    return json(
      {
        success:
          false,

        message:
          "Unable to save website theme."
      },
      500
    );

  }

}
