function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function clean(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const name = clean(body.name, 120);
    const email = clean(body.email, 254).toLowerCase();
    const phone = clean(body.phone, 40);
    const subject = clean(body.subject, 200);
    const message = clean(body.message, 5000);

    const clientId =
      Number.isInteger(Number(body.client_id)) && Number(body.client_id) > 0
        ? Number(body.client_id)
        : null;

    const productId =
      Number.isInteger(Number(body.product_id)) && Number(body.product_id) > 0
        ? Number(body.product_id)
        : null;

    const source = ["website", "product", "client", "admin"].includes(
      body.source
    )
      ? body.source
      : "website";

    if (!name || !email || !subject || !message) {
      return json(
        {
          success: false,
          message: "Name, email, subject and message are required."
        },
        400
      );
    }

    const now = new Date().toISOString();

    const result = await context.env.DB.prepare(`
      INSERT INTO enquiries (
        client_id,
        product_id,
        name,
        email,
        phone,
        subject,
        message,
        source,
        status,
        admin_notes,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?)
    `)
      .bind(
        clientId,
        productId,
        name,
        email,
        phone || null,
        subject,
        message,
        source,
        now,
        now
      )
      .run();

    return json({
      success: true,
      message: "Enquiry submitted successfully.",
      id: result.meta?.last_row_id || null
    });
  } catch (error) {
    console.error("Public enquiry POST error:", error);

    return json(
      {
        success: false,
        message: "Unable to submit enquiry."
      },
      500
    );
  }
}
