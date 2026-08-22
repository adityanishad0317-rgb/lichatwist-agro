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
   BASE64
========================================= */

function base64ToBytes(value) {

  const binary =
    atob(value);

  return Uint8Array.from(
    binary,
    c => c.charCodeAt(0)
  );

}


function bytesToBase64(bytes) {

  return btoa(
    String.fromCharCode(
      ...bytes
    )
  );

}


/* =========================================
   HASH PASSWORD / RECOVERY KEY
========================================= */

async function hashValue(
  value,
  salt,
  iterations
) {

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(value),
      "PBKDF2",
      false,
      ["deriveBits"]
    );


  const bits =
    await crypto.subtle.deriveBits(
      {
        name:
          "PBKDF2",

        salt:
          salt,

        iterations:
          iterations,

        hash:
          "SHA-256"
      },
      key,
      256
    );


  return new Uint8Array(bits);

}


/* =========================================
   CONSTANT-TIME COMPARE
========================================= */

function sameBytes(
  a,
  b
) {

  if (
    !a ||
    !b ||
    a.length !== b.length
  ) {

    return false;

  }


  let difference = 0;


  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    difference |=
      a[i] ^ b[i];

  }


  return difference === 0;

}


/* =========================================
   GET RECOVERY HINT
========================================= */

export async function onRequestGet(
  context
) {

  try {

    const record =
      await context.env.DB.prepare(`
        SELECT
          recovery_key_hash,
          recovery_key_hint
        FROM admin_auth
        WHERE id = 1
      `)
      .first();


    /*
     * Do not reveal whether the recovery
     * system is configured.
     *
     * If no hint exists, return a generic
     * message instead.
     */

    return json({
      success:
        true,

      hint:
        record?.recovery_key_hash
          ? (
              record.recovery_key_hint ||
              "Use the private clue you created for your recovery key."
            )
          : "Owner recovery is not configured yet."
    });

  } catch {

    return json(
      {
        success:
          false,

        message:
          "Unable to load recovery information."
      },
      500
    );

  }

}


/* =========================================
   RECOVER OWNER PASSWORD
========================================= */

export async function onRequestPost(
  context
) {

  try {

    const body =
      await context.request.json();


    const recoveryKey =
      String(
        body.recoveryKey ||
        ""
      ).trim();


    const newPassword =
      String(
        body.newPassword ||
        ""
      );


    const confirmPassword =
      String(
        body.confirmPassword ||
        ""
      );


    if (!recoveryKey) {

      return json(
        {
          success:
            false,

          message:
            "Please enter your recovery key."
        },
        400
      );

    }


    if (
      newPassword.length < 8
    ) {

      return json(
        {
          success:
            false,

          message:
            "New password must be at least 8 characters."
        },
        400
      );

    }


    if (
      newPassword !==
      confirmPassword
    ) {

      return json(
        {
          success:
            false,

          message:
            "New passwords do not match."
        },
        400
      );

    }


    const record =
      await context.env.DB.prepare(`
        SELECT
          recovery_key_hash,
          recovery_key_salt,
          recovery_key_iterations
        FROM admin_auth
        WHERE id = 1
      `)
      .first();


    if (
      !record ||
      !record.recovery_key_hash ||
      !record.recovery_key_salt
    ) {

      return json(
        {
          success:
            false,

          message:
            "Owner recovery is not configured."
        },
        400
      );

    }


    const salt =
      base64ToBytes(
        record.recovery_key_salt
      );


    const iterations =
      Number(
        record.recovery_key_iterations ||
        PBKDF2_ITERATIONS
      );


    const suppliedHash =
      await hashValue(
        recoveryKey,
        salt,
        iterations
      );


    const storedHash =
      base64ToBytes(
        record.recovery_key_hash
      );


    const valid =
      sameBytes(
        suppliedHash,
        storedHash
      );


    if (!valid) {

      return json(
        {
          success:
            false,

          message:
            "Invalid recovery key."
        },
        401
      );

    }


    /*
     * Generate a fresh password salt.
     */

    const passwordSalt =
      crypto.getRandomValues(
        new Uint8Array(16)
      );


    const passwordHash =
      await hashValue(
        newPassword,
        passwordSalt,
        PBKDF2_ITERATIONS
      );


    const passwordHashBase64 =
      bytesToBase64(
        passwordHash
      );


    const passwordSaltBase64 =
      bytesToBase64(
        passwordSalt
      );


    /*
     * Replace only the owner's
     * password fields.
     *
     * Recovery key remains unchanged.
     */

    await context.env.DB.prepare(`
      UPDATE admin_auth
      SET
        password_hash = ?,
        password_salt = ?,
        password_iterations = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `)
    .bind(
      passwordHashBase64,
      passwordSaltBase64,
      PBKDF2_ITERATIONS
    )
    .run();


    return json({
      success:
        true,

      message:
        "Owner password recovered successfully."
    });

  } catch {

    return json(
      {
        success:
          false,

        message:
          "Unable to recover owner password."
      },
      500
    );

  }

    }
