const COOKIE_NAME = "ADMIN_SESSION_V2";

const PBKDF2_ITERATIONS = 100000;


/* =========================================
   JSON RESPONSE
========================================= */

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


/* =========================================
   COOKIE
========================================= */

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


/* =========================================
   BASE64
========================================= */

function bytesToBase64(
  bytes
) {

  return btoa(
    String.fromCharCode(
      ...bytes
    )
  );

}


/* =========================================
   SIGNATURE
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
   VERIFY ADMIN SESSION
========================================= */

async function verifySession(
  request,
  secret
) {

  const cookie =
    getCookie(
      request,
      COOKIE_NAME
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


    let value =
      payload
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


    const decoded =
      Uint8Array.from(
        binary,
        c =>
          c.charCodeAt(0)
      );


    const session =
      JSON.parse(
        new TextDecoder()
          .decode(decoded)
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
   PBKDF2
========================================= */

async function hashRecoveryKey(
  recoveryKey,
  salt
) {

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        recoveryKey
      ),
      "PBKDF2",
      false,
      ["deriveBits"]
    );


  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name:
          "PBKDF2",

        salt:
          salt,

        iterations:
          PBKDF2_ITERATIONS,

        hash:
          "SHA-256"
      },
      key,
      256
    );


  return new Uint8Array(
    derivedBits
  );

}


/* =========================================
   GET RECOVERY KEY HINT
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
      await verifySession(
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


    const record =
      await context.env.DB.prepare(`
        SELECT
          recovery_key_hash,
          recovery_key_hint
        FROM admin_auth
        WHERE id = 1
      `)
      .first();


    return json({
      success:
        true,

      configured:
        Boolean(
          record &&
          record.recovery_key_hash
        ),

      hint:
        record?.recovery_key_hint ||
        ""
    });


  } catch {

    return json(
      {
        success:
          false,

        message:
          "Unable to load recovery settings."
      },
      500
    );

  }

}


/* =========================================
   CREATE / UPDATE RECOVERY KEY
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
     * Only an authenticated owner
     * can change the recovery key.
     */

    const authenticated =
      await verifySession(
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


    const currentPassword =
      String(
        body.currentPassword ||
        ""
      );


    const recoveryKey =
      String(
        body.recoveryKey ||
        ""
      ).trim();


    const recoveryKeyHint =
      String(
        body.recoveryKeyHint ||
        ""
      ).trim();


    if (!currentPassword) {

      return json(
        {
          success:
            false,

          message:
            "Current admin password is required."
        },
        400
      );

    }


    if (
      recoveryKey.length < 8
    ) {

      return json(
        {
          success:
            false,

          message:
            "Recovery key must be at least 8 characters."
        },
        400
      );

    }


    if (
      recoveryKeyHint.length < 3
    ) {

      return json(
        {
          success:
            false,

          message:
            "Recovery key hint is required."
        },
        400
      );

    }


    if (
      recoveryKeyHint.length > 200
    ) {

      return json(
        {
          success:
            false,

          message:
            "Recovery key hint is too long."
        },
        400
      );

    }


    /*
     * Verify the owner's CURRENT password.
     *
     * This prevents someone who somehow
     * reaches the admin page from silently
     * replacing the recovery mechanism.
     */

    const existing =
      await context.env.DB.prepare(`
        SELECT
          password_hash,
          password_salt,
          password_iterations
        FROM admin_auth
        WHERE id = 1
      `)
      .first();


    let passwordCorrect =
      false;


    if (
      existing &&
      existing.password_hash &&
      existing.password_salt &&
      existing.password_iterations
    ) {

      const passwordKey =
        await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(
            currentPassword
          ),
          "PBKDF2",
          false,
          ["deriveBits"]
        );


      const salt =
        Uint8Array.from(
          atob(
            existing.password_salt
          ),
          c =>
            c.charCodeAt(0)
        );


      const derivedBits =
        await crypto.subtle.deriveBits(
          {
            name:
              "PBKDF2",

            salt:
              salt,

            iterations:
              Number(
                existing.password_iterations
              ),

            hash:
              "SHA-256"
          },
          passwordKey,
          256
        );


      const actual =
        new Uint8Array(
          derivedBits
        );


      const expectedBinary =
        atob(
          existing.password_hash
        );


      const expected =
        Uint8Array.from(
          expectedBinary,
          c =>
            c.charCodeAt(0)
        );


      if (
        actual.length ===
        expected.length
      ) {

        let difference =
          0;


        for (
          let i = 0;
          i < actual.length;
          i++
        ) {

          difference |=
            actual[i] ^
            expected[i];

        }


        passwordCorrect =
          difference === 0;

      }

    } else {

      /*
       * First-password fallback.
       */

      passwordCorrect =
        currentPassword ===
        secret;

    }


    if (!passwordCorrect) {

      return json(
        {
          success:
            false,

          message:
            "Current admin password is incorrect."
        },
        401
      );

    }


    /*
     * Never store the recovery key itself.
     * Store only a salted PBKDF2 hash.
     */

    const salt =
      crypto.getRandomValues(
        new Uint8Array(16)
      );


    const hash =
      await hashRecoveryKey(
        recoveryKey,
        salt
      );


    const hashBase64 =
      bytesToBase64(
        hash
      );


    const saltBase64 =
      bytesToBase64(
        salt
      );


    await context.env.DB.prepare(`
  UPDATE admin_auth
  SET
    recovery_key_hash = ?,
    recovery_key_salt = ?,
    recovery_key_iterations = ?,
    recovery_key_hint = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`)
.bind(
  hashBase64,
  saltBase64,
  PBKDF2_ITERATIONS,
  recoveryKeyHint
)
.run();

    return json({
      success:
        true,

      message:
        "Owner recovery key and hint updated successfully."
    });


  } catch (error) {

    return json(
      {
        success:
          false,

        message:
          "Unable to update owner recovery settings."
      },
      500
    );

  }

}
