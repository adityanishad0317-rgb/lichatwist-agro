const COOKIE_NAME = "ADMIN_SESSION_V2";

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

  const match =
    cookies.match(
      new RegExp(`${name}=([^;]+)`)
    );

  return match
    ? match[1]
    : null;
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

async function verifyOwnerSession(
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

    if (
      signature !== expected
    ) {
      return false;
    }

    const session =
      JSON.parse(
        base64urlDecode(payload)
      );

    return Boolean(
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

function bytesToBase64(bytes) {

  return btoa(
    String.fromCharCode(
      ...bytes
    )
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


/* =========================================
   TEMPORARY PASSWORD
========================================= */

function generateTemporaryPassword() {

  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnopqrstuvwxyz" +
    "23456789";

  const random =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  let password = "";

  for (
    let i = 0;
    i < random.length;
    i++
  ) {

    password +=
      characters[
        random[i] % characters.length
      ];

  }

  return password;
}


/* =========================================
   CREATE CLIENT
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
     * ONLY AN AUTHENTICATED OWNER
     * CAN CREATE A CLIENT.
     */

    const authenticated =
      await verifyOwnerSession(
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


    /*
     * READ REQUEST
     */

    const body =
      await context.request.json();

    const name =
      String(
        body.name || ""
      ).trim();

    const email =
      String(
        body.email || ""
      )
        .trim()
        .toLowerCase();


    /*
     * VALIDATION
     */

    if (!name) {

      return json(
        {
          success: false,
          message:
            "Client name is required."
        },
        400
      );

    }

    if (name.length > 100) {

      return json(
        {
          success: false,
          message:
            "Client name is too long."
        },
        400
      );

    }


    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailPattern.test(email)
    ) {

      return json(
        {
          success: false,
          message:
            "A valid client email is required."
        },
        400
      );

    }


    /*
     * CHECK WHETHER CLIENT
     * ALREADY EXISTS.
     */

    const existing =
      await context.env.DB.prepare(`
        SELECT id
        FROM client_accounts
        WHERE email = ?
        LIMIT 1
      `)
        .bind(email)
        .first();

    if (existing) {

      return json(
        {
          success: false,
          message:
            "A client account with this email already exists."
        },
        409
      );

    }


    /*
     * GENERATE A RANDOM
     * ONE-TIME TEMPORARY PASSWORD.
     */

    const temporaryPassword =
      generateTemporaryPassword();


    /*
     * GENERATE RANDOM SALT.
     */

    const salt =
      crypto.getRandomValues(
        new Uint8Array(16)
      );


    /*
     * HASH TEMPORARY PASSWORD.
     */

    const passwordHash =
      await hashPassword(
        temporaryPassword,
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
     * CREATE CLIENT ACCOUNT.
     *
     * The temporary password is NOT
     * stored in D1.
     */

    const result =
      await context.env.DB.prepare(`
        INSERT INTO client_accounts (
          name,
          email,
          password_hash,
          password_salt,
          password_iterations,
          status,
          must_change_password,
          session_version,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, 'active', 1, 1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `)
        .bind(
          name,
          email,
          hashBase64,
          saltBase64,
          PBKDF2_ITERATIONS
        )
        .run();


    if (!result.success) {

      return json(
        {
          success: false,
          message:
            "Unable to create client account."
        },
        500
      );

    }


    /*
     * IMPORTANT:
     *
     * The temporary password is returned
     * ONLY in this response.
     *
     * It is never stored in the database.
     */

    return json({
      success: true,
      message:
        "Client account created successfully.",
      client: {
        name,
        email
      },
      temporaryPassword,
      mustChangePassword: true
    });

  } catch (error) {

    return json(
      {
        success: false,
        message:
          "Unable to create client account."
      },
      500
    );

  }
}
