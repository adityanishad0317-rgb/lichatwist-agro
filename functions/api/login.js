const COOKIE_NAME = "ADMIN_SESSION_V2";

const PBKDF2_ITERATIONS = 100000;


function base64urlEncode(value) {

  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

}


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


export async function onRequestPost(
  context
) {

  try {

    const body =
      await context.request.json();


    const password =
      String(
        body.password || ""
      );


    const secret =
      context.env.ADMIN_PASSWORD;


    if (!secret) {

      return Response.json(
        {
          success: false,
          message:
            "Server configuration error."
        },
        {
          status: 500
        }
      );

    }


    if (!password) {

      return Response.json(
        {
          success: false,
          message:
            "Invalid password."
        },
        {
          status: 401
        }
      );

    }


    /*
     * Check whether a changed admin
     * password already exists in D1.
     */

    const stored =
      await context.env.DB.prepare(`
        SELECT
          password_hash,
          password_salt,
          password_iterations
        FROM admin_auth
        WHERE id = 1
      `).first();


    let authenticated = false;


    /*
     * If a password has already been
     * changed, use the secure D1 hash.
     */

    if (
      stored &&
      stored.password_hash &&
      stored.password_salt &&
      stored.password_iterations
    ) {

      authenticated =
        await verifyPassword(
          password,
          stored.password_hash,
          stored.password_salt,
          Number(
            stored.password_iterations
          )
        );

    } else {

      /*
       * First login / before password
       * has ever been changed.
       *
       * Use the existing Cloudflare
       * ADMIN_PASSWORD.
       */

      authenticated =
        password === secret;

    }


    if (!authenticated) {

      return Response.json(
        {
          success: false,
          message:
            "Invalid password."
        },
        {
          status: 401
        }
      );

    }


    /*
     * Create the administrator session.
     */

    const session = {

      exp:
        Date.now() +
        6 * 60 * 60 * 1000

    };


    const payload =
      base64urlEncode(
        JSON.stringify(session)
      );


    /*
     * IMPORTANT:
     *
     * The session is still signed with
     * the permanent Cloudflare secret.
     *
     * Changing the admin password does
     * not break existing session signing.
     */

    const signature =
      await createSignature(
        payload,
        secret
      );


    const cookie =
      `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600`;


    return Response.json(
      {
        success: true,
        message:
          "Login successful."
      },
      {
        status: 200,
        headers: {
          "Set-Cookie": cookie
        }
      }
    );


  } catch (error) {

    return Response.json(
      {
        success: false,
        message:
          "Invalid request."
      },
      {
        status: 400
      }
    );

  }

  }
