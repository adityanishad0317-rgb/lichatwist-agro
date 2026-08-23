const ADMIN_COOKIE_NAME =
  "ADMIN_SESSION_V2";

const PBKDF2_ITERATIONS =
  100000;


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


/* =========================================
   BASE64 URL DECODE
========================================= */

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


/* =========================================
   HMAC SIGNATURE
========================================= */

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

      [
        "sign"
      ]
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

async function verifyOwnerSession(
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


  const [
    payload,
    signature
  ] =
    parts;


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
     * A client session must
     * NEVER be accepted here.
     */

    if (
      session.role ===
      "client"
    ) {

      return false;

    }


    /*
     * Existing owner sessions
     * use ADMIN_SESSION_V2.
     */

    if (
      !session.exp ||
      Date.now() >=
        Number(session.exp)
    ) {

      return false;

    }


    return true;


  } catch {

    return false;

  }

}


/* =========================================
   PASSWORD HASHING
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


async function hashPassword(
  password,
  salt,
  iterations
) {

  const passwordKey =
    await crypto.subtle.importKey(
      "raw",

      new TextEncoder()
        .encode(password),

      "PBKDF2",

      false,

      [
        "deriveBits"
      ]
    );


  const derivedBits =
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

      passwordKey,

      256
    );


  return new Uint8Array(
    derivedBits
  );

}


/* =========================================
   SECURE TEMPORARY PASSWORD
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


  let password =
    "";


  for (
    let i = 0;
    i < random.length;
    i++
  ) {

    password +=
      characters[
        random[i] %
        characters.length
      ];

  }


  return password;

}


/* =========================================
   VALIDATE CLIENT ID
========================================= */

function getClientId(
  value
) {

  const id =
    Number(value);


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {

    return null;

  }


  return id;

}


/* =========================================
   GET CLIENT
========================================= */

async function getClient(
  db,
  id
) {

  return await db.prepare(`
    SELECT
      id,
      name,
      email,
      status,
      must_change_password,
      session_version,
      created_at,
      updated_at
    FROM client_accounts
    WHERE id = ?
    LIMIT 1
  `)
    .bind(id)
    .first();

}


/* =========================================
   LIST CLIENTS
========================================= */

async function listClients(
  db
) {

  const result =
    await db.prepare(`
      SELECT
        id,
        name,
        email,
        status,
        must_change_password,
        session_version,
        created_at,
        updated_at
      FROM client_accounts
      ORDER BY
        created_at DESC,
        id DESC
    `)
      .all();


  return (
    result.results ||
    []
  );

}


/* =========================================
   UPDATE CLIENT DETAILS
========================================= */

async function updateClient(
  db,
  body
) {

  const id =
    getClientId(
      body.id
    );


  if (!id) {

    return json(
      {
        success:
          false,

        message:
          "Invalid client ID."
      },
      400
    );

  }


  const name =
    String(
      body.name ||
      ""
    ).trim();


  const email =
    String(
      body.email ||
      ""
    )
      .trim()
      .toLowerCase();


  if (!name) {

    return json(
      {
        success:
          false,

        message:
          "Client name is required."
      },
      400
    );

  }


  if (
    name.length >
    100
  ) {

    return json(
      {
        success:
          false,

        message:
          "Client name is too long."
      },
      400
    );

  }


  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


  if (
    !emailPattern.test(
      email
    )
  ) {

    return json(
      {
        success:
          false,

        message:
          "A valid client email is required."
      },
      400
    );

  }


  const existing =
    await db.prepare(`
      SELECT
        id
      FROM client_accounts
      WHERE email = ?
        AND id != ?
      LIMIT 1
    `)
      .bind(
        email,
        id
      )
      .first();


  if (existing) {

    return json(
      {
        success:
          false,

        message:
          "Another client already uses this email."
      },
      409
    );

  }


  const result =
    await db.prepare(`
      UPDATE client_accounts
      SET
        name = ?,
        email = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        name,
        email,
        id
      )
      .run();


  if (
    !result.success
  ) {

    return json(
      {
        success:
          false,

        message:
          "Unable to update client."
      },
      500
    );

  }


  const client =
    await getClient(
      db,
      id
    );


  return json({
    success:
      true,

    message:
      "Client information updated successfully.",

    client:
      client
  });

}


/* =========================================
   ACTIVATE / DEACTIVATE
========================================= */

async function setClientStatus(
  db,
  body
) {

  const id =
    getClientId(
      body.id
    );


  if (!id) {

    return json(
      {
        success:
          false,

        message:
          "Invalid client ID."
      },
      400
    );

  }


  const status =
    String(
      body.status ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    status !==
      "active" &&
    status !==
      "inactive"
  ) {

    return json(
      {
        success:
          false,

        message:
          "Invalid client status."
      },
      400
    );

  }


  const client =
    await getClient(
      db,
      id
    );


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
   * Increment session_version
   * whenever status changes.
   *
   * This immediately invalidates
   * existing client sessions.
   */

  const result =
    await db.prepare(`
      UPDATE client_accounts
      SET
        status = ?,
        session_version =
          COALESCE(
            session_version,
            1
          ) + 1,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        status,
        id
      )
      .run();


  if (
    !result.success
  ) {

    return json(
      {
        success:
          false,

        message:
          "Unable to change client status."
      },
      500
    );

  }


  const updated =
    await getClient(
      db,
      id
    );


  return json({
    success:
      true,

    message:
      status ===
        "active"
        ? "Client account activated successfully."
        : "Client account deactivated successfully.",

    client:
      updated
  });

}


/* =========================================
   RESET CLIENT PASSWORD
========================================= */

async function resetClientPassword(
  db,
  body
) {

  const id =
    getClientId(
      body.id
    );


  if (!id) {

    return json(
      {
        success:
          false,

        message:
          "Invalid client ID."
      },
      400
    );

  }


  const client =
    await getClient(
      db,
      id
    );


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


  if (
    client.status !==
    "active"
  ) {

    return json(
      {
        success:
          false,

        message:
          "Activate the client account before resetting its password."
      },
      400
    );

  }


  /*
   * Generate a completely new
   * temporary password.
   */

  const temporaryPassword =
    generateTemporaryPassword();


  /*
   * Generate a new random salt.
   */

  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );


  /*
   * Hash the temporary password.
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
   * Update password.
   *
   * Increment session_version so
   * all existing client sessions
   * immediately become invalid.
   *
   * Force a new password on the
   * client's next login.
   */

  const result =
    await db.prepare(`
      UPDATE client_accounts
      SET
        password_hash = ?,
        password_salt = ?,
        password_iterations = ?,
        must_change_password = 1,
        session_version =
          COALESCE(
            session_version,
            1
          ) + 1,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        hashBase64,
        saltBase64,
        PBKDF2_ITERATIONS,
        id
      )
      .run();


  if (
    !result.success
  ) {

    return json(
      {
        success:
          false,

        message:
          "Unable to reset client password."
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
   * It is never stored in plain text.
   */

  return json({
    success:
      true,

    message:
      "Client password reset successfully. A new temporary password has been generated.",

    client: {
      id:
        client.id,

      name:
        client.name,

      email:
        client.email
    },

    temporaryPassword:
      temporaryPassword,

    mustChangePassword:
      true
  });

}


/* =========================================
   MAIN REQUEST HANDLER
========================================= */

export async function onRequest(
  context
) {

  try {

    const secret =
      context.env.ADMIN_PASSWORD;


    const db =
      context.env.DB;


    if (
      !secret ||
      !db
    ) {

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
     * OWNER ONLY
     */

    const authenticated =
      await verifyOwnerSession(
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


    const method =
      context.request.method;


    /* =====================================
       GET = LIST CLIENTS
    ===================================== */

    if (
      method ===
      "GET"
    ) {

      const clients =
        await listClients(
          db
        );


      return json({
        success:
          true,

        clients:
          clients
      });

    }


    /* =====================================
       POST = MANAGEMENT ACTION
    ===================================== */

    if (
      method ===
      "POST"
    ) {

      const body =
        await context.request.json();


      const action =
        String(
          body.action ||
          ""
        )
          .trim()
          .toLowerCase();


      if (
        action ===
        "update"
      ) {

        return await updateClient(
          db,
          body
        );

      }


      if (
        action ===
        "status"
      ) {

        return await setClientStatus(
          db,
          body
        );

      }


      if (
        action ===
        "reset-password"
      ) {

        return await resetClientPassword(
          db,
          body
        );

      }


      return json(
        {
          success:
            false,

          message:
            "Unknown client management action."
        },
        400
      );

    }


    return json(
      {
        success:
          false,

        message:
          "Method not allowed."
      },
      405
    );


  } catch (
    error
  ) {

    return json(
      {
        success:
          false,

        message:
          "Unable to process client management request."
      },
      500
    );

  }

}
