import { NextResponse } from 'next/server';
import { getTursoClient, ensureTursoReady } from '@/lib/store/db';

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    
    // Get last 5 orders
    const ordersRes = await client.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5");
    
    // Get last 15 messages to see if user actually made an order
    const msgsRes = await client.execute("SELECT conversation_id, role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 15");
    
    return NextResponse.json({ ok: true, orders: ordersRes.rows, messages: msgsRes.rows });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
