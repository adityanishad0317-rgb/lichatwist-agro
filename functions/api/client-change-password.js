const CLIENT_COOKIE_NAME = "CLIENT_SESSION_V1";

const PBKDF2_ITERATIONS = 100000;

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

  const parts =
    cookies.split(";");

  for (const part of parts) {

    const trimmed =
      part.trim();

    if (
      trimmed.startsWith(name + "=")
    ) {

      return trimmed.substring(
        name.length + 1
      );

    }

  }

  return null;
}


function base64urlDecode(value) {

  value =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (value.length % 4) {
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


function bytesToBase64(bytes) {

  return btoa(
    String.fromCharCode(
      ...bytes
    )
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


async function verifyClientSession(
  request,
  secret
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

  if (parts.length !== 2) {
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
        base64urlDecode(payload)
      );


    if (
      !session.exp ||
      Date.now() >= session.exp
    ) {
      return null;
    }


    if (
      session.role !== "client"
    ) {
      return null;
    }


    if (!session.sub) {
      return null;
    }


    return session;

  } catch {

    return null;

  }
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
        salt,
        iterations,
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
   CLIENT PASSWORD CHANGE
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
     * Verify CLIENT_SESSION_V1.
     */

    const session =
      await verifyClientSession(
        context.request,
        secret
      );


    if (!session) {

      return json(
        {
          success: false,
          message:
            "Unauthorized."
        },
        401
      );

    }


    const clientId =
      Number(session.sub);


    /*
     * Read request.
     */

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


    if (
      newPassword.length < 8
    ) {

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
     * Get the current client.
     */

    const client =
      await context.env.DB.prepare(`
        SELECT
          id,
          password_hash,
          password_salt,
          password_iterations,
          status,
          session_version
        FROM client_accounts
        WHERE id = ?
        LIMIT 1
      `)
        .bind(clientId)
        .first();


    if (!client) {

      return json(
        {
          success: false,
          message:
            "Client account not found."
        },
        404
      );

    }


    if (
      client.status !== "active"
    ) {

      return json(
        {
          success: false,
          message:
            "Client account is inactive."
        },
        403
      );

    }


    /*
     * Verify the current password.
     */

    const currentPasswordCorrect =
      await verifyPassword(
        currentPassword,
        client.password_hash,
        client.password_salt,
        Number(
          client.password_iterations
        )
      );


    if (
      !currentPasswordCorrect
    ) {

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
     * Generate fresh salt.
     */

    const salt =
      crypto.getRandomValues(
        new Uint8Array(16)
      );


    /*
     * Hash new password.
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
     * Increment session_version.
     *
     * This prepares the account for
     * session invalidation.
     */

    const newSessionVersion =
      Number(
        client.session_version || 1
      ) + 1;


    await context.env.DB.prepare(`
      UPDATE client_accounts
      SET
        password_hash = ?,
        password_salt = ?,
        password_iterations = ?,
        must_change_password = 0,
        session_version = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        hashBase64,
        saltBase64,
        PBKDF2_ITERATIONS,
        newSessionVersion,
        clientId
      )
      .run();


    return json({
      success: true,
      message:
        "Client password changed successfully."
    });


  } catch (error) {

    return json(
      {
        success: false,
        message:
          "Unable to change client password."
      },
      500
    );

  }
}
