const COOKIE_NAME = "ADMIN_SESSION_V2";

const ALLOWED_FILES = {
  // Global images
  hero: "hero.jpg",
  about: "office.jpg",
  agriculture: "agriculture.jpg",
  construction: "construction.jpg",
  transport: "transport.jpg",

  // Company images
  agroCompany: "agro-company.jpg",
  constructionCompany: "construction-company.jpg",
  transportCompany: "transport-company.jpg",

  // Project images
  project1: "project1.jpg",
  project2: "project2.jpg",
  project3: "project3.jpg"
};

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB


function base64urlDecode(value) {

  value = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const binary = atob(value);

  const bytes = Uint8Array.from(
    binary,
    c => c.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}


async function createSignature(data, secret) {

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

    if (
      signature !== expected
    ) {

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


function arrayBufferToBase64(
  buffer
) {

  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {

    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          i,
          i + chunkSize
        )
      );

  }

  return btoa(binary);
}


export async function onRequestPost(
  context
) {

  try {

    /*
     * =====================================
     * ADMIN AUTHENTICATION
     * =====================================
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


    const authenticated =
      await verifySession(
        context.request,
        secret
      );

    if (!authenticated) {

      return Response.json(
        {
          success: false,
          message:
            "Unauthorized."
        },
        {
          status: 401
        }
      );

    }


    /*
     * =====================================
     * GITHUB CONFIGURATION
     * =====================================
     */

    const githubToken =
      context.env.GITHUB_TOKEN;

    const githubOwner =
      context.env.GITHUB_OWNER;

    const githubRepo =
      context.env.GITHUB_REPO;

    if (
      !githubToken ||
      !githubOwner ||
      !githubRepo
    ) {

      return Response.json(
        {
          success: false,
          message:
            "Image upload is not configured yet."
        },
        {
          status: 500
        }
      );

    }


    /*
     * =====================================
     * READ UPLOAD
     * =====================================
     */

    const formData =
      await context.request.formData();

    const image =
      formData.get("image");

    const imageType =
      String(
        formData.get("imageType") || ""
      );


    if (
      !(image instanceof File)
    ) {

      return Response.json(
        {
          success: false,
          message:
            "No image was selected."
        },
        {
          status: 400
        }
      );

    }


    /*
     * =====================================
     * CHECK IMAGE TYPE
     * =====================================
     */

    if (
      !ALLOWED_FILES[imageType]
    ) {

      return Response.json(
        {
          success: false,
          message:
            "Invalid image type."
        },
        {
          status: 400
        }
      );

    }


    /*
     * =====================================
     * CHECK FILE FORMAT
     * =====================================
     */

    if (
      !ALLOWED_TYPES[image.type]
    ) {

      return Response.json(
        {
          success: false,
          message:
            "Only JPG, PNG and WebP images are allowed."
        },
        {
          status: 400
        }
      );

    }


    /*
     * =====================================
     * CHECK FILE SIZE
     * =====================================
     */

    if (
      image.size > MAX_FILE_SIZE
    ) {

      return Response.json(
        {
          success: false,
          message:
            "Image must be smaller than 5 MB."
        },
        {
          status: 400
        }
      );

    }


    /*
     * =====================================
     * TARGET FILE
     * =====================================
     */

    const fileName =
      ALLOWED_FILES[imageType];

    const path =
      `images/${fileName}`;


    /*
     * =====================================
     * CONVERT IMAGE TO BASE64
     * =====================================
     */

    const buffer =
      await image.arrayBuffer();

    const content =
      arrayBufferToBase64(buffer);


    /*
     * =====================================
     * FIND EXISTING GITHUB FILE
     * =====================================
     */

    const githubUrl =
      `https://api.github.com/repos/` +
      `${githubOwner}/${githubRepo}` +
      `/contents/${path}`;

    const existingResponse =
      await fetch(
        githubUrl,
        {
          method: "GET",

          headers: {
            "Authorization":
              `Bearer ${githubToken}`,

            "Accept":
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28",

            "User-Agent":
              "LichaTwist-Image-Manager"
          }
        }
      );


    let sha;


    if (
      existingResponse.ok
    ) {

      const existing =
        await existingResponse.json();

      sha =
        existing.sha;

    } else if (
      existingResponse.status !== 404
    ) {

      return Response.json(
        {
          success: false,
          message:
            "Unable to check the existing image."
        },
        {
          status: 500
        }
      );

    }


    /*
     * =====================================
     * CREATE OR REPLACE IMAGE
     * =====================================
     */

    const uploadResponse =
      await fetch(
        githubUrl,
        {
          method: "PUT",

          headers: {
            "Authorization":
              `Bearer ${githubToken}`,

            "Accept":
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28",

            "Content-Type":
              "application/json",

            "User-Agent":
              "LichaTwist-Image-Manager"
          },

          body:
            JSON.stringify({

              message:
                `Update ${imageType} image`,

              content,

              branch:
                "main",

              ...(sha
                ? { sha }
                : {})
            })
        }
      );


    const result =
      await uploadResponse.json();


    if (
      !uploadResponse.ok
    ) {

      return Response.json(
        {
          success: false,
          message:
            "GitHub image upload failed.",
          details:
            result.message ||
            "Unknown GitHub error."
        },
        {
          status: 500
        }
      );

    }


 /*
 * =====================================
 * SAVE SEPARATE IMAGE PATH TO D1
 * =====================================
 */

const databaseFields = {

  // Global images
  agriculture:
    "agriculture_image",

  construction:
    "construction_image",

  transport:
    "transport_image",


  // Company images
  agroCompany:
    "agro_company_image",

  constructionCompany:
    "construction_company_image",

  transportCompany:
    "transport_company_image",


  // Project images
  project1:
    "project1_image",

  project2:
    "project2_image",

  project3:
    "project3_image"

};

const databaseField =
  databaseFields[imageType];


if (databaseField) {

  await context.env.DB.prepare(
    `
      UPDATE site_content
      SET ${databaseField} = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `
  )
    .bind(path)
    .run();

}


/*
 * =====================================
 * SUCCESS
 * =====================================
 */

return Response.json(
  {
    success: true,
    message:
      "Image uploaded successfully.",
    path
  },
  {
    status: 200
  }
);
  } catch (error) {

    return Response.json(
      {
        success: false,
        message:
          "Image upload failed."
      },
      {
        status: 500
      }
    );

  }

  }
