import { NextResponse } from 'next/server';
import { getTursoClient, ensureTursoReady } from '@/lib/store/db';

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    
    // Try to insert an order manually to see if it fails
    try {
      await client.execute({
        sql: `INSERT INTO orders (id, conversation_id, customer_name, delivery_address, payment_method, items_summary, status, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'test-id-' + Date.now(),
          'whatsapp:test',
          'Test User',
          'Test Addr',
          'Cash',
          'Test Items',
          'pending',
          18000,
          Date.now()
        ]
      });
      return NextResponse.json({ ok: true, msg: "Insert worked" });
    } catch (insertErr: any) {
      return NextResponse.json({ ok: false, error: insertErr.message, stack: insertErr.stack });
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
