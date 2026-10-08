import { createOrder } from './lib/store/index';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// We must strip quotes for local development
if (process.env.TURSO_DATABASE_URL) {
  process.env.TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL.replace(/["\r\n]/g, '').trim();
}
if (process.env.TURSO_AUTH_TOKEN) {
  process.env.TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN.replace(/["\r\n]/g, '').trim();
}

async function run() {
  try {
    const order = await createOrder(
      "test-conv",
      [{ sku: "C4S", quantity: 1, unitPrice: 18000 }],
      18000,
      {
        customerName: "Jhonathan",
        deliveryAddress: "CRA 3a",
        paymentMethod: "Efectivo",
        itemsSummary: "1x CAJA x4 Surtida"
      }
    );
    console.log("Success:", order);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
