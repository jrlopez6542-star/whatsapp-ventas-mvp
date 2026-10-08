const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL.replace(/["\r\n]/g, '').trim(),
  authToken: process.env.TURSO_AUTH_TOKEN.replace(/["\r\n]/g, '').trim()
});

async function run() {
  try {
    const res = await client.execute({
      sql: `INSERT INTO orders (id, conversation_id, customer_name, delivery_address, payment_method, items_summary, status, total, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'test-uuid-3',
        'whatsapp:+123456789',
        null,
        null,
        null,
        null,
        'confirmed',
        18000,
        Date.now(),
      ],
    });
    console.log("Success:", res);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
