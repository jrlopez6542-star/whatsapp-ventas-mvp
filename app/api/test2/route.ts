import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/store/db';

export async function GET(req: Request) {
  try {
    const client = getTursoClient();
    const data = await client.execute("SELECT * FROM messages ORDER BY created_at DESC LIMIT 5");
    return NextResponse.json({ ok: true, count: data.rows.length, data: data.rows });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
