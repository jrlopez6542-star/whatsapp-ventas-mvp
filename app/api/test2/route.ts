import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/store/db';

export async function GET(req: Request) {
  try {
    const client = getTursoClient();
    const res = await client.execute("PRAGMA table_info(orders)");
    const data = await client.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5");
    return NextResponse.json({ ok: true, columns: res.rows, data: data.rows });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
