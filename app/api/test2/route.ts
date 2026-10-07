import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/store/db';

export async function GET(req: Request) {
  try {
    const client = getTursoClient();
    const data = await client.execute("SELECT * FROM messages WHERE conversation_id = 'whatsapp:+573159686357' ORDER BY created_at ASC");
    return NextResponse.json({ ok: true, count: data.rows.length, data: data.rows });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
