const CLIENT_COOKIE_NAME = "CLIENT_SESSION_V1";

const MAX_FILE_SIZE =
  5 * 1024 * 1024;


/*
 * =========================================
 * ALLOWED IMAGE SLOTS
 * =========================================
 */

const ALLOWED_FILES = {

  hero:
    "hero.jpg",

  about:
    "office.jpg",

  agriculture:
    "agriculture.jpg",

  construction:
    "construction.jpg",

  transport:
    "transport.jpg",

  agroCompany:
    "agro-company.jpg",

  constructionCompany:
    "construction-company.jpg",

  transportCompany:
    "transport-company.jpg",

  project1:
    "project1.jpg",

  project2:
    "project2.jpg",

  project3:
    "project3.jpg"

};


/*
 * =========================================
 * ALLOWED FILE TYPES
 * =========================================
 */

const ALLOWED_TYPES = {

  "image/jpeg":
    "jpg",

  "image/png":
    "png",

  "image/webp":
    "webp"

};


/*
 * =========================================
 * DATABASE IMAGE FIELDS
 * =========================================
 *
 * Only these fields may be changed.
 */

const DATABASE_FIELDS = {

  agriculture:
    "agriculture_image",

  construction:
    "construction_image",

  transport:
    "transport_image",

  agroCompany:
    "agro_company_image",

  constructionCompany:
    "construction_company_image",

  transportCompany:
    "transport_company_image",

  project1:
    "project1_image",

  project2:
    "project2_image",

  project3:
    "project3_image"

};


/*
 * =========================================
 * BASE64 URL DECODE
 * =========================================
 */

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
      c => c.charCodeAt(0)
    );


  return new TextDecoder()
    .decode(bytes);

}


/*
 * =========================================
 * CREATE HMAC SIGNATURE
 * =========================================
 */

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

      ["sign"]

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
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

}


/*
 * =========================================
 * GET COOKIE
 * =========================================
 */

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


/*
 * =========================================
 * VERIFY CLIENT SESSION
 * =========================================
 */

async function verifyClientSession(
  request,
  secret,
  db
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


  if (
    parts.length !== 2
  ) {

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
        base64urlDecode(
          payload
        )
      );


    /*
     * Must be a client session.
     */

    if (
      session.role !==
      "client"
    ) {

      return null;

    }


    /*
     * Check expiration.
     */

    if (
      !session.exp ||
      Date.now() >=
        session.exp
    ) {

      return null;

    }


    const clientId =
      Number(
        session.sub
      );


    if (
      !Number.isInteger(
        clientId
      ) ||
      clientId <= 0
    ) {

      return null;

    }


    /*
     * Check that the client
     * still exists and is active.
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
        .bind(
          clientId
        )
        .first();


    if (!client) {

      return null;

    }


    if (
      client.status !==
      "active"
    ) {

      return null;

    }


    /*
     * Check session version.
     *
     * This allows future account/session
     * invalidation without changing the
     * existing Owner authentication.
     */

    const databaseVersion =
      Number(
        client.session_version ||
        1
      );


    const sessionVersion =
      Number(
        session.version ||
        0
      );


    if (
      sessionVersion !==
      databaseVersion
    ) {

      return null;

    }


    return {

      id:
        clientId,

      session:
        session

    };

  } catch {

    return null;

  }

}


/*
 * =========================================
 * ARRAY BUFFER → BASE64
 * =========================================
 */

function arrayBufferToBase64(
  buffer
) {

  const bytes =
    new Uint8Array(
      buffer
    );


  let binary =
    "";


  const chunkSize =
    0x8000;


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


  return btoa(
    binary
  );

}


/*
 * =========================================
 * MAIN UPLOAD ENDPOINT
 * =========================================
 */

export async function onRequestPost(
  context
) {

  try {

    /*
     * -------------------------------------
     * SERVER SECRET
     * -------------------------------------
     */

    const secret =
      context.env.ADMIN_PASSWORD;


    if (!secret) {

      return Response.json(

        {
          success:
            false,

          message:
            "Server configuration error."
        },

        {
          status:
            500
        }

      );

    }


    /*
     * -------------------------------------
     * CLIENT AUTHENTICATION
     * -------------------------------------
     */

    const authenticated =
      await verifyClientSession(

        context.request,

        secret,

        context.env.DB

      );


    if (!authenticated) {

      return Response.json(

        {
          success:
            false,

          message:
            "Unauthorized."
        },

        {
          status:
            401
        }

      );

    }


    /*
     * -------------------------------------
     * GITHUB CONFIGURATION
     * -------------------------------------
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
          success:
            false,

          message:
            "Image upload is not configured yet."
        },

        {
          status:
            500
        }

      );

    }


    /*
     * -------------------------------------
     * READ MULTIPART FORM
     * -------------------------------------
     */

    const formData =
      await context.request
        .formData();


    const image =
      formData.get(
        "image"
      );


    const imageType =
      String(
        formData.get(
          "imageType"
        ) || ""
      );


    /*
     * -------------------------------------
     * CHECK IMAGE
     * -------------------------------------
     */

    if (
      !(image instanceof File)
    ) {

      return Response.json(

        {
          success:
            false,

          message:
            "No image was selected."
        },

        {
          status:
            400
        }

      );

    }


    /*
     * -------------------------------------
     * CHECK IMAGE SLOT
     * -------------------------------------
     */

    if (
      !ALLOWED_FILES[
        imageType
      ]
    ) {

      return Response.json(

        {
          success:
            false,

          message:
            "Invalid image type."
        },

        {
          status:
            400
        }

      );

    }


    /*
     * -------------------------------------
     * CHECK MIME TYPE
     * -------------------------------------
     */

    if (
      !ALLOWED_TYPES[
        image.type
      ]
    ) {

      return Response.json(

        {
          success:
            false,

          message:
            "Only JPG, PNG and WebP images are allowed."
        },

        {
          status:
            400
        }

      );

    }


    /*
     * -------------------------------------
     * CHECK FILE SIZE
     * -------------------------------------
     */

    if (
      image.size >
      MAX_FILE_SIZE
    ) {

      return Response.json(

        {
          success:
            false,

          message:
            "Image must be smaller than 5 MB."
        },

        {
          status:
            400
        }

      );

    }


    /*
     * -------------------------------------
     * TARGET PATH
     * -------------------------------------
     */

    const fileName =
      ALLOWED_FILES[
        imageType
      ];


    const path =
      `images/${fileName}`;


    /*
     * -------------------------------------
     * CONVERT IMAGE
     * -------------------------------------
     */

    const buffer =
      await image.arrayBuffer();


    const content =
      arrayBufferToBase64(
        buffer
      );


    /*
     * -------------------------------------
     * GITHUB CONTENT API
     * -------------------------------------
     */

    const githubUrl =
      `https://api.github.com/repos/` +
      `${githubOwner}/${githubRepo}` +
      `/contents/${path}`;


    /*
     * -------------------------------------
     * FIND EXISTING FILE
     * -------------------------------------
     */

    const existingResponse =
      await fetch(

        githubUrl,

        {
          method:
            "GET",

          headers: {

            "Authorization":
              `Bearer ${githubToken}`,

            "Accept":
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28",

            "User-Agent":
              "LichaTwist-Client-Image-Manager"

          }

        }

      );


    let sha;


    if (
      existingResponse.ok
    ) {

      const existing =
        await existingResponse
          .json();


      sha =
        existing.sha;

    } else if (
      existingResponse.status !==
      404
    ) {

      return Response.json(

        {
          success:
            false,

          message:
            "Unable to check the existing image."
        },

        {
          status:
            500
        }

      );

    }


    /*
     * -------------------------------------
     * CREATE / REPLACE IMAGE
     * -------------------------------------
     */

    const uploadResponse =
      await fetch(

        githubUrl,

        {

          method:
            "PUT",

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
              "LichaTwist-Client-Image-Manager"

          },


          body:
            JSON.stringify({

              message:
                `Client update ${imageType} image`,

              content:
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
      await uploadResponse
        .json();


    if (
      !uploadResponse.ok
    ) {

      return Response.json(

        {
          success:
            false,

          message:
            "GitHub image upload failed.",

          details:
            result.message ||
            "Unknown GitHub error."
        },

        {
          status:
            500
        }

      );

    }


    /*
     * -------------------------------------
     * UPDATE D1 IMAGE PATH
     * -------------------------------------
     *
     * Only predefined database
     * fields are allowed.
     *
     * Hero/about are intentionally
     * NOT written to D1 because their
     * current database fields are not
     * present in the existing upload
     * mapping.
     */

    const databaseField =
      DATABASE_FIELDS[
        imageType
      ];


    if (
      databaseField
    ) {

      await context.env.DB.prepare(
        `
          UPDATE site_content
          SET
            ${databaseField} = ?,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = 1
        `
      )
        .bind(
          path
        )
        .run();

    }


    /*
     * -------------------------------------
     * SUCCESS
     * -------------------------------------
     */

    return Response.json(

      {
        success:
          true,

        message:
          "Image uploaded successfully.",

        path:
          path,

        imageType:
          imageType,

        clientId:
          authenticated.id

      },

      {
        status:
          200
      }

    );


  } catch (error) {

    return Response.json(

      {
        success:
          false,

        message:
          "Image upload failed."
      },

      {
        status:
          500
      }

    );

  }

}
