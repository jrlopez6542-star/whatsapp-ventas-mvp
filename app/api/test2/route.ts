import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/store/db';

export async function GET(req: Request) {
  try {
    const client = getTursoClient();
    await client.execute("DELETE FROM products");
    return NextResponse.json({ ok: true, msg: "All old products deleted. Will re-seed." });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
