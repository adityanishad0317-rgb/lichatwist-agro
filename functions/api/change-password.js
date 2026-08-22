const COOKIE_NAME = "ADMIN_SESSION_V2";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}


function getCookie(request, name) {

  const cookies =
    request.headers.get("Cookie") || "";

  const match = cookies.match(
    new RegExp(`${name}=([^;]+)`)
  );

  return match
    ? match[1]
    : null;
}


function base64urlDecode(value) {

  value = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const binary = atob(value);

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
      new TextEncoder().encode(secret),
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

  if (parts.length !== 2) {
    return false;
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


/* =========================================
   PASSWORD HASHING
========================================= */

const PBKDF2_ITERATIONS = 100000;


function bytesToBase64(bytes) {

  return btoa(
    String.fromCharCode(...bytes)
  );

}


function base64ToBytes(value) {

  const binary =
    atob(value);

  return Uint8Array.from(
    binary,
    c => c.charCodeAt(0)
  );

}


async function hashPassword(
  password,
  salt,
  iterations
) {

  const passwordKey =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );


  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: iterations,
        hash: "SHA-256"
      },
      passwordKey,
      256
    );


  return new Uint8Array(
    derivedBits
  );

}


async function verifyPassword(
  password,
  storedHash,
  storedSalt,
  iterations
) {

  try {

    const salt =
      base64ToBytes(
        storedSalt
      );


    const expectedHash =
      base64ToBytes(
        storedHash
      );


    const actualHash =
      await hashPassword(
        password,
        salt,
        iterations
      );


    if (
      actualHash.length !==
      expectedHash.length
    ) {
      return false;
    }


    let difference = 0;


    for (
      let i = 0;
      i < actualHash.length;
      i++
    ) {

      difference |=
        actualHash[i] ^
        expectedHash[i];

    }


    return difference === 0;

  } catch {

    return false;

  }

}


/* =========================================
   CHANGE PASSWORD
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
          success: false,
          message:
            "Server configuration error."
        },
        500
      );

    }


    /*
     * Only an already authenticated
     * administrator can change the password.
     */

    const authenticated =
      await verifySession(
        context.request,
        secret
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


    const body =
      await context.request.json();


    const currentPassword =
      String(
        body.currentPassword || ""
      );


    const newPassword =
      String(
        body.newPassword || ""
      );


    if (!currentPassword) {

      return json(
        {
          success: false,
          message:
            "Current password is required."
        },
        400
      );

    }


    if (!newPassword) {

      return json(
        {
          success: false,
          message:
            "New password is required."
        },
        400
      );

    }


    if (newPassword.length < 8) {

      return json(
        {
          success: false,
          message:
            "New password must be at least 8 characters."
        },
        400
      );

    }


    if (
      currentPassword ===
      newPassword
    ) {

      return json(
        {
          success: false,
          message:
            "New password must be different from the current password."
        },
        400
      );

    }


    /*
     * Get the currently stored password.
     */

    const existing =
      await context.env.DB.prepare(`
        SELECT
          password_hash,
          password_salt,
          password_iterations
        FROM admin_auth
        WHERE id = 1
      `).first();


    let currentPasswordCorrect =
      false;


    /*
     * First password change:
     *
     * The original password is still
     * stored in Cloudflare as ADMIN_PASSWORD.
     *
     * After the first successful change,
     * the database hash is used instead.
     */

    if (
      existing &&
      existing.password_hash &&
      existing.password_salt &&
      existing.password_iterations
    ) {

      currentPasswordCorrect =
        await verifyPassword(
          currentPassword,
          existing.password_hash,
          existing.password_salt,
          Number(
            existing.password_iterations
          )
        );

    } else {

      currentPasswordCorrect =
        currentPassword === secret;

    }


    if (!currentPasswordCorrect) {

      return json(
        {
          success: false,
          message:
            "Current password is incorrect."
        },
        401
      );

    }


    /*
     * Generate a fresh random salt.
     */

    const salt =
      crypto.getRandomValues(
        new Uint8Array(16)
      );


    /*
     * Hash the new password.
     */

    const passwordHash =
      await hashPassword(
        newPassword,
        salt,
        PBKDF2_ITERATIONS
      );


    const hashBase64 =
      bytesToBase64(
        passwordHash
      );


    const saltBase64 =
      bytesToBase64(
        salt
      );


    /*
     * Save the new password hash.
     */

    await context.env.DB.prepare(`
      INSERT INTO admin_auth (
        id,
        password_hash,
        password_salt,
        password_iterations,
        updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)

      ON CONFLICT(id)
      DO UPDATE SET
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        password_iterations = excluded.password_iterations,
        updated_at = CURRENT_TIMESTAMP
    `)
      .bind(
        1,
        hashBase64,
        saltBase64,
        PBKDF2_ITERATIONS
      )
      .run();


    return json({
      success: true,
      message:
        "Admin password changed successfully."
    });


  } catch (error) {

    return json(
      {
        success: false,
        message:
          "Unable to change admin password."
      },
      500
    );

  }

    }
