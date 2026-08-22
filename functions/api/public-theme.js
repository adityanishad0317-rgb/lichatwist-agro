export async function onRequestGet(
  context
) {

  try {

    const result =
      await context.env.DB.prepare(`
        SELECT
          theme_key,
          updated_at
        FROM site_theme_settings
        WHERE id = 1
      `)
      .first();


    return new Response(
      JSON.stringify({
        success:
          true,

        theme:
          result?.theme_key ||
          "classic",

        updated_at:
          result?.updated_at ||
          null
      }),
      {
        status:
          200,

        headers: {
          "Content-Type":
            "application/json",

          "Cache-Control":
            "no-store"
        }
      }
    );


  } catch {

    return new Response(
      JSON.stringify({
        success:
          false,

        theme:
          "classic"
      }),
      {
        status:
          500,

        headers: {
          "Content-Type":
            "application/json",

          "Cache-Control":
            "no-store"
        }
      }
    );

  }

}
