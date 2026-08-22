const ADMIN_COOKIE_NAME = "ADMIN_SESSION_V2";
const CLIENT_COOKIE_NAME = "CLIENT_SESSION_V1";


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


function getCookie(
  request,
  name
) {

  const cookies =
    request.headers.get("Cookie") || "";


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
   VERIFY ADMIN SESSION
========================================= */

async function verifyAdminSession(
  cookie,
  secret
) {

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


    /*
     * Existing Owner sessions created
     * by /api/login do not contain a
     * role field.
     *
     * Therefore:
     *
     * missing role = existing Owner session
     *
     * role = client = NOT an Owner session
     */

    if (
      session.role === "client"
    ) {
      return false;
    }


    return Boolean(
      session.exp &&
      Date.now() < session.exp
    );


  } catch {

    return false;

  }
}


/* =========================================
   VERIFY CLIENT SESSION
========================================= */

async function verifyClientSession(
  cookie,
  secret,
  db
) {

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


    /*
     * Must be an actual Client session.
     */

    if (
      session.role !== "client"
    ) {
      return null;
    }


    /*
     * Session must not be expired.
     */

    if (
      !session.exp ||
      Date.now() >= session.exp
    ) {
      return null;
    }


    /*
     * Client ID must exist.
     */

    const clientId =
      Number(session.sub);


    if (
      !Number.isInteger(clientId) ||
      clientId <= 0
    ) {
      return null;
    }


    /*
     * Check the current account.
     *
     * This also lets us invalidate
     * sessions after password changes.
     */

    const client =
      await db.prepare(`
        SELECT
          id,
          status,
          session_version
        FROM client_accounts
        WHERE id = ?
        LIMIT 1
      `)
        .bind(clientId)
        .first();


    if (!client) {
      return null;
    }


    /*
     * Inactive client accounts cannot
     * access the dashboard.
     */

    if (
      client.status !== "active"
    ) {
      return null;
    }


    /*
     * The session version in the
     * signed cookie must match D1.
     */

    const databaseVersion =
      Number(
        client.session_version || 1
      );


    const sessionVersion =
      Number(
        session.version || 0
      );


    if (
      sessionVersion !==
      databaseVersion
    ) {
      return null;
    }


    return session;


  } catch {

    return null;

  }
}


/* =========================================
   OWNER LOGIN PAGE
========================================= */

function loginPage() {

  return new Response(`
<!DOCTYPE html>
<html lang="en">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>LichaTwist Login</title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {

      margin: 0;

      min-height: 100vh;

      font-family:
        Arial,
        sans-serif;

      background:
        linear-gradient(
          135deg,
          #edf2f6,
          #e4eaf0
        );

      display: flex;

      align-items: center;

      justify-content: center;

      padding: 20px;

      color: #16263a;
    }


    .login-box {

      width:
        min(100%, 420px);

      background:
        #ffffff;

      border:
        1px solid #d7e0e8;

      border-radius:
        18px;

      padding:
        28px;

      box-shadow:
        0 12px 35px
        rgba(16,36,62,.12);
    }


    .brand {

      text-align:
        center;

      color:
        #071a33;

      font-size:
        24px;

      font-weight:
        700;

      margin-bottom:
        6px;
    }


    .subtitle {

      text-align:
        center;

      color:
        #667589;

      font-size:
        14px;

      margin-bottom:
        24px;
    }


    .role-title {

      font-size:
        14px;

      font-weight:
        700;

      margin-bottom:
        10px;

      color:
        #10243e;
    }


    .role-buttons {

      display:
        grid;

      grid-template-columns:
        1fr 1fr;

      gap:
        10px;

      margin-bottom:
        22px;
    }


    .role-button {

      border:
        1px solid #cbd5e1;

      background:
        #f8fafc;

      color:
        #10243e;

      border-radius:
        10px;

      padding:
        12px;

      font-weight:
        700;

      cursor:
        pointer;
    }


    .role-button.active {

      background:
        #071a33;

      color:
        #ffffff;

      border-color:
        #071a33;
    }


    .field {

      margin-bottom:
        16px;
    }


    label {

      display:
        block;

      font-size:
        13px;

      font-weight:
        700;

      margin-bottom:
        7px;
    }


    input {

      width:
        100%;

      padding:
        12px 13px;

      border:
        1px solid #cbd5e1;

      border-radius:
        9px;

      font-size:
        15px;

      outline:
        none;
    }


    input:focus {

      border-color:
        #1769e0;

      box-shadow:
        0 0 0 3px
        rgba(23,105,224,.10);
    }


    .login-button {

      width:
        100%;

      border:
        0;

      border-radius:
        10px;

      padding:
        13px;

      background:
        #1769e0;

      color:
        #ffffff;

      font-size:
        15px;

      font-weight:
        700;

      cursor:
        pointer;
    }


    .login-button:disabled {

      opacity:
        .65;

      cursor:
        wait;
    }


    .helper {

      margin-top:
        16px;

      padding:
        12px;

      border-radius:
        9px;

      background:
        #f1f5f9;

      color:
        #536477;

      font-size:
        12px;

      line-height:
        1.5;

      text-align:
        center;
    }


    #message {

      margin-top:
        15px;

      padding:
        11px;

      border-radius:
        9px;

      font-size:
        13px;

      line-height:
        1.45;

      display:
        none;
    }


    .message-error {

      display:
        block !important;

      background:
        #fef2f2;

      color:
        #991b1b;
    }


    .message-info {

      display:
        block !important;

      background:
        #eff6ff;

      color:
        #1e40af;
    }


    @media (
      max-width: 480px
    ) {

      .login-box {

        padding:
          22px;
      }

      .role-buttons {

        grid-template-columns:
          1fr;
      }

    }

  </style>

</head>


<body>


  <div class="login-box">


    <div class="brand">
      LichaTwist
    </div>


    <div class="subtitle">
      Secure Administration & Client Login
    </div>


    <div class="role-title">
      Select how you want to sign in
    </div>


    <div class="role-buttons">


      <button
        type="button"
        id="ownerRoleButton"
        class="role-button active"
      >
        👑 Owner / Admin
      </button>


      <button
        type="button"
        id="clientRoleButton"
        class="role-button"
      >
        👤 Client
      </button>


    </div>


    <form id="loginForm">


      <div
        class="field"
        id="ownerPasswordField"
      >

        <label for="ownerPassword">
          Owner / Admin Password
        </label>

        <input
          id="ownerPassword"
          type="password"
          autocomplete="current-password"
          placeholder="Enter owner password"
        >

      </div>


      <div
        id="clientFields"
        style="display:none;"
      >


        <div class="field">

          <label for="clientEmail">
            Client Email
          </label>

          <input
            id="clientEmail"
            type="email"
            autocomplete="username"
            placeholder="Enter client email"
          >

        </div>


        <div class="field">

          <label for="clientPassword">
            Client Password
          </label>

          <input
            id="clientPassword"
            type="password"
            autocomplete="current-password"
            placeholder="Enter client password"
          >

        </div>


      </div>


      <button
        type="submit"
        class="login-button"
        id="loginButton"
      >
        Sign in as Owner / Admin
      </button>


      <div
        id="message"
      ></div>


    </form>


    <div
      class="helper"
      id="helperText"
    >
      Owner access opens the LichaTwist Admin Panel.
    </div>


    <div
      id="ownerRecovery"
      style="
        text-align:center;
        margin-top:14px;
      "
    >

      <a
        href="/admin-recovery.html"
        style="
          color:#1769e0;
          font-size:13px;
          text-decoration:none;
          font-weight:700;
        "
      >
        Forgot Owner Password?
      </a>

    </div>


  </div>


<script>

const ownerRoleButton =
  document.getElementById(
    "ownerRoleButton"
  );


const clientRoleButton =
  document.getElementById(
    "clientRoleButton"
  );


const ownerPasswordField =
  document.getElementById(
    "ownerPasswordField"
  );


const clientFields =
  document.getElementById(
    "clientFields"
  );


const ownerPassword =
  document.getElementById(
    "ownerPassword"
  );


const clientEmail =
  document.getElementById(
    "clientEmail"
  );


const clientPassword =
  document.getElementById(
    "clientPassword"
  );


const loginButton =
  document.getElementById(
    "loginButton"
  );


const message =
  document.getElementById(
    "message"
  );


const helperText =
  document.getElementById(
    "helperText"
  );


const ownerRecovery =
  document.getElementById(
    "ownerRecovery"
  );


let selectedRole =
  "owner";


function showMessage(
  text,
  type
) {

  message.className =
    type === "error"
      ? "message-error"
      : "message-info";

  message.textContent =
    text;

}


function selectOwner() {

  selectedRole =
    "owner";


  ownerRoleButton.classList.add(
    "active"
  );


  clientRoleButton.classList.remove(
    "active"
  );


  ownerPasswordField.style.display =
    "block";


  clientFields.style.display =
    "none";


  ownerPassword.required =
    true;


  clientEmail.required =
    false;


  clientPassword.required =
    false;


  loginButton.textContent =
    "Sign in as Owner / Admin";


  helperText.textContent =
    "Owner access opens the LichaTwist Admin Panel.";


  ownerRecovery.style.display =
    "block";


  message.className = "";

  message.textContent = "";

}


function selectClient() {

  selectedRole =
    "client";


  clientRoleButton.classList.add(
    "active"
  );


  ownerRoleButton.classList.remove(
    "active"
  );


  ownerPasswordField.style.display =
    "none";


  clientFields.style.display =
    "block";


  ownerPassword.required =
    false;


  clientEmail.required =
    true;


  clientPassword.required =
    true;


  loginButton.textContent =
    "Sign in as Client";


  helperText.textContent =
    "Client access opens your secure Client Dashboard.";


  ownerRecovery.style.display =
    "none";


  message.className = "";

  message.textContent = "";

}


ownerRoleButton.addEventListener(
  "click",
  selectOwner
);


clientRoleButton.addEventListener(
  "click",
  selectClient
);


document
  .getElementById("loginForm")
  .addEventListener(
    "submit",
    async function(event) {

      event.preventDefault();


      message.className = "";

      message.textContent = "";


      loginButton.disabled =
        true;


      loginButton.textContent =
        "Signing in...";


      try {


        if (
          selectedRole ===
          "owner"
        ) {


          const response =
            await fetch(
              "/api/login",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body:
                  JSON.stringify({
                    password:
                      ownerPassword.value
                  })
              }
            );


          const data =
            await response.json();


          if (
            !response.ok ||
            !data.success
          ) {

            throw new Error(
              data.message ||
              "Invalid owner password."
            );

          }


          window.location.href =
            "/admin.html";


          return;

        }


        const response =
          await fetch(
            "/api/client-login",
            {
              method:
                "POST",

              credentials:
                "include",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  email:
                    clientEmail.value,

                  password:
                    clientPassword.value
                })
            }
          );


        const data =
          await response.json();


        if (
          !response.ok ||
          !data.success
        ) {

          throw new Error(
            data.message ||
            "Invalid client email or password."
          );

        }


        window.location.href =
          "/client-dashboard.html";


      } catch (error) {


        showMessage(
          error.message ||
          "Unable to connect to login service.",
          "error"
        );


        loginButton.disabled =
          false;


        loginButton.textContent =
          selectedRole === "owner"
            ? "Sign in as Owner / Admin"
            : "Sign in as Client";

      }

    }
  );

</script>


</body>

</html>
  `, {

    status: 401,

    headers: {

      "Content-Type":
        "text/html; charset=UTF-8",

      "Cache-Control":
        "no-store"

    }

  });

}

/* =========================================
   MIDDLEWARE
========================================= */

export async function onRequest(
  context
) {

  const url =
    new URL(
      context.request.url
    );


  const secret =
    context.env.ADMIN_PASSWORD;


  /*
   * If the server secret is missing,
   * preserve the existing behavior for
   * protected routes.
   */

  if (!secret) {

    if (
      url.pathname === "/admin" ||
      url.pathname === "/admin.html" ||
      url.pathname === "/client-dashboard" ||
      url.pathname === "/client-dashboard.html"
    ) {

      return new Response(
        "Server configuration error.",
        {
          status: 500
        }
      );

    }


    return context.next();

  }


  /* =====================================
     OWNER / ADMIN PAGE
  ===================================== */

  if (
    url.pathname === "/admin" ||
    url.pathname === "/admin.html"
  ) {

    const cookie =
      getCookie(
        context.request,
        ADMIN_COOKIE_NAME
      );


    const authenticated =
      await verifyAdminSession(
        cookie,
        secret
      );


    if (!authenticated) {

      return loginPage();

    }


    return context.next();

  }


  /* =====================================
     CLIENT DASHBOARD
  ===================================== */

  if (
    url.pathname === "/client-dashboard" ||
    url.pathname === "/client-dashboard.html"
  ) {

    const cookie =
      getCookie(
        context.request,
        CLIENT_COOKIE_NAME
      );


    const session =
      await verifyClientSession(
        cookie,
        secret,
        context.env.DB
      );


    if (!session) {

      return Response.redirect(
        new URL(
          "/client-login.html",
          context.request.url
        ),
        302
      );

    }


    return context.next();

  }


  /*
   * Everything else behaves exactly
   * as before.
   */

  return context.next();

}
