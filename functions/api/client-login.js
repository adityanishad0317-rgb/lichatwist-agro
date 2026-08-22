const CLIENT_COOKIE_NAME = "CLIENT_SESSION_V1";

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
  const binary = atob(value);

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
      base64ToBytes(storedSalt);

    const expectedHash =
      base64ToBytes(storedHash);

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

export async function onRequestPost(
  context
) {
  try {

    /*
     * =====================================
     * READ REQUEST
     * =====================================
     */

    const body =
      await context.request.json();

    const email =
      String(
        body.email || ""
      )
        .trim()
        .toLowerCase();

    const password =
      String(
        body.password || ""
      );

    if (!email || !password) {
      return Response.json(
        {
          success: false,
          message:
            "Email and password are required."
        },
        {
          status: 400
        }
      );
    }


    /*
     * =====================================
     * REQUIRED SERVER SECRET
     * =====================================
     *
     * We temporarily use the existing
     * ADMIN_PASSWORD only for signing the
     * new client session.
     *
     * We are NOT changing ADMIN_PASSWORD.
     */

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


    /*
     * =====================================
     * FIND CLIENT
     * =====================================
     */

    const client =
      await context.env.DB.prepare(`
        SELECT
          id,
          name,
          email,
          password_hash,
          password_salt,
          password_iterations,
          status,
          must_change_password,
          session_version
        FROM client_accounts
        WHERE email = ?
        LIMIT 1
      `)
        .bind(email)
        .first();


    /*
     * Do not reveal whether the email
     * exists.
     */

    if (
      !client ||
      client.status !== "active" ||
      !client.password_hash ||
      !client.password_salt ||
      !client.password_iterations
    ) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid email or password."
        },
        {
          status: 401
        }
      );
    }


    /*
     * =====================================
     * VERIFY PASSWORD
     * =====================================
     */

    const authenticated =
      await verifyPassword(
        password,
        client.password_hash,
        client.password_salt,
        Number(
          client.password_iterations
        )
      );

    if (!authenticated) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid email or password."
        },
        {
          status: 401
        }
      );
    }


    /*
     * =====================================
     * CREATE CLIENT SESSION
     * =====================================
     */

    const session = {
      sub: Number(client.id),
      role: "client",
      version:
        Number(client.session_version || 1),
      exp:
        Date.now() +
        6 * 60 * 60 * 1000
    };


    const payload =
      base64urlEncode(
        JSON.stringify(session)
      );


    const signature =
      await createSignature(
        payload,
        secret
      );


    const cookie =
      `${CLIENT_COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600`;


    /*
     * =====================================
     * SUCCESS
     * =====================================
     */

    return Response.json(
      {
        success: true,
        message:
          "Client login successful.",
        name:
          client.name,
        mustChangePassword:
          Number(
            client.must_change_password
          ) === 1
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
