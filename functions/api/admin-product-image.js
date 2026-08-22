const COOKIE_NAME = "ADMIN_SESSION_V2";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function base64urlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function createSignature(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";

  for (const part of cookies.split(";")) {
    const trimmed = part.trim();

    if (trimmed.startsWith(name + "=")) {
      return trimmed.substring(name.length + 1);
    }
  }

  return null;
}

async function verifySession(request, secret) {
  const cookie = getCookie(request, COOKIE_NAME);

  if (!cookie) return false;

  const parts = cookie.split(".");

  if (parts.length !== 2) return false;

  const [payload, signature] = parts;

  try {
    const expected = await createSignature(payload, secret);

    if (signature !== expected) return false;

    const session = JSON.parse(base64urlDecode(payload));

    return !!(session.exp && Date.now() < session.exp);
  } catch {
    return false;
  }
}

function json(data, status = 200) {
  return Response.json(data, { status });
}

function safeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 80);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunkSize)
    );
  }

  return btoa(binary);
}

export async function onRequestPost(context) {
  try {
    const secret = context.env.ADMIN_PASSWORD;

    if (!secret) {
      return json({
        success: false,
        message: "Server configuration error."
      }, 500);
    }

    if (!(await verifySession(context.request, secret))) {
      return json({
        success: false,
        message: "Unauthorized."
      }, 401);
    }

    const githubToken = context.env.GITHUB_TOKEN;
    const githubOwner = context.env.GITHUB_OWNER;
    const githubRepo = context.env.GITHUB_REPO;

    if (!githubToken || !githubOwner || !githubRepo) {
      return json({
        success: false,
        message: "GitHub image storage is not configured."
      }, 500);
    }

    const formData = await context.request.formData();

    const image = formData.get("image");
    const productId = String(
      formData.get("productId") || ""
    ).trim();

    const productSlug = safeSlug(
      formData.get("productSlug")
    );

    if (!(image instanceof File)) {
      return json({
        success: false,
        message: "Please select an image."
      }, 400);
    }

    if (!productId || !productSlug) {
      return json({
        success: false,
        message: "Product ID and product slug are required."
      }, 400);
    }

    const extension = ALLOWED_TYPES[image.type];

    if (!extension) {
      return json({
        success: false,
        message: "Only JPG, PNG and WebP images are allowed."
      }, 400);
    }

    if (image.size > MAX_FILE_SIZE) {
      return json({
        success: false,
        message: "Image must be smaller than 5 MB."
      }, 400);
    }

    const fileName = `${productSlug}-${productId}.${extension}`;
    const path = `images/products/${fileName}`;

    const buffer = await image.arrayBuffer();
    const content = arrayBufferToBase64(buffer);

    const githubUrl =
      `https://api.github.com/repos/` +
      `${githubOwner}/${githubRepo}` +
      `/contents/${path}`;

    const headers = {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "LichaTwist-Product-Image-Manager"
    };

    const existingResponse = await fetch(
      githubUrl,
      {
        method: "GET",
        headers
      }
    );

    let sha;

    if (existingResponse.ok) {
      const existing = await existingResponse.json();
      sha = existing.sha;
    } else if (existingResponse.status !== 404) {
      return json({
        success: false,
        message: "Unable to check existing product image."
      }, 500);
    }

    const uploadResponse = await fetch(
      githubUrl,
      {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Update product image: ${productSlug}`,
          content,
          branch: "main",
          ...(sha ? { sha } : {})
        })
      }
    );

    const result = await uploadResponse.json();

    if (!uploadResponse.ok) {
      return json({
        success: false,
        message: "GitHub product image upload failed: " + (result.message || "Unknown GitHub error."),
        details: {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          github: result
        }
      }, 500);
    }

    const imagePath = `/${path}`;

    return json({
      success: true,
      message: "Product image uploaded successfully.",
      path: imagePath,
      file: path
    });

  } catch (error) {
    console.error(
      "Admin product image upload error:",
      error
    );

    return json({
      success: false,
      message: "Unable to upload product image."
    }, 500);
  }
}
