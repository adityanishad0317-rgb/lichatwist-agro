export async function onRequestGet(context) {
  try {

    const result = await context.env.DB.prepare(`
      SELECT
  business_name,
  updated_at,
        phone,
        email,
        address,
        about,
        whatsapp,

        hero_title,
        hero_subtitle,
        hero_description,
        approach_title,
        approach_description,

        about_heading,
        about_description,
        mission,
        vision,
        values_text,

        agriculture_title,
        agriculture_description,
        agriculture_image,

        construction_title,
        construction_description,
        construction_image,

        transport_title,
        transport_description,
        transport_image,

        agro_company_name,
agro_company_description,
agro_company_image,

construction_company_name,
construction_company_description,
construction_company_image,

transport_company_name,
transport_company_description,
transport_company_image,

projects_heading,
projects_description,

project1_category,
project1_title,
project1_description,
project1_image,

project2_category,
project2_title,
project2_description,
project2_image,

project3_category,
project3_title,
project3_description,
project3_image
FROM site_content
      WHERE id = 1
    `).first();


    return new Response(
      JSON.stringify({
        success: true,
        content: result || {}
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );


  } catch (error) {

    return new Response(
      JSON.stringify({
        success: false,
        message: "Unable to load website content."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  }
}
