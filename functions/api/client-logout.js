const CLIENT_COOKIE_NAME =
  "CLIENT_SESSION_V1";


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


export async function onRequestPost(
  context
) {

  try {

    const secret =
      context.env.ADMIN_PASSWORD;


    if (!secret) {

      return Response.json(

        {
          success:
            false,

          message:
            "Server configuration error."
        },

        {
          status:
            500
        }

      );

    }


    /*
     * =====================================
     * READ CLIENT SESSION
     * =====================================
     */

    const cookie =
      getCookie(

        context.request,

        CLIENT_COOKIE_NAME

      );


    /*
     * =====================================
     * INVALIDATE SESSION VERSION
     * =====================================
     *
     * If the client session is valid,
     * increase its database session version.
     *
     * This means the old session cannot
     * be reused after logout.
     */

    if (cookie) {

      const parts =
        cookie.split(".");


      if (
        parts.length === 2
      ) {

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
            signature ===
            expected
          ) {

            const session =
              JSON.parse(
                base64urlDecode(
                  payload
                )
              );


            const clientId =
              Number(
                session.sub
              );


            if (
              Number.isInteger(
                clientId
              ) &&
              clientId > 0
            ) {

              await context.env.DB
                .prepare(`
                  UPDATE client_accounts
                  SET
                    session_version =
                      COALESCE(
                        session_version,
                        1
                      ) + 1
                  WHERE id = ?
                `)
                .bind(
                  clientId
                )
                .run();

            }

          }

        } catch {

          /*
           * Even if the existing cookie
           * cannot be decoded, we still
           * clear it below.
           */

        }

      }

    }


    /*
     * =====================================
     * DELETE CLIENT COOKIE
     * =====================================
     */

    const expiredCookie =
      `${CLIENT_COOKIE_NAME}=` +
      `; Path=/; HttpOnly; Secure; ` +
      `SameSite=Strict; Max-Age=0; ` +
      `Expires=Thu, 01 Jan 1970 00:00:00 GMT`;


    /*
     * =====================================
     * SUCCESS
     * =====================================
     */

    return Response.json(

      {
        success:
          true,

        message:
          "Client signed out successfully."
      },

      {
        status:
          200,

        headers: {

          "Set-Cookie":
            expiredCookie,

          "Cache-Control":
            "no-store"

        }

      }

    );


  } catch {

    return Response.json(

      {
        success:
          false,

        message:
          "Unable to sign out."
      },

      {
        status:
          500
      }

    );

  }

}
