const COOKIE_NAME = "ADMIN_SESSION_V2";

export async function onRequestGet(context) {

  const response = new Response(
    JSON.stringify({
      success: true,
      message: "Logged out successfully."
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  // Delete the current session cookie.
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );

  // Also remove possible older cookies created with
  // different paths.
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );

  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );

  return response;
}
