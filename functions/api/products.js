export async function onRequestGet(context) {
  try {
    const result = await context.env.DB.prepare(`
      SELECT
        p.id,
        p.category_id,
        p.title,
        p.slug,
        p.short_description,
        p.description,
        p.specifications,
        p.origin,
        p.packaging,
        p.minimum_order_quantity,
        p.availability,
        p.featured,
        p.published,
        p.main_image_url,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.published = 1
      ORDER BY p.featured DESC, p.id DESC
    `).all();

    return new Response(
      JSON.stringify({
        success: true,
        products: result.results || []
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
    console.error("Products API error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Unable to load products."
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
