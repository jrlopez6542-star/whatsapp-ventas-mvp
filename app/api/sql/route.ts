import { NextResponse } from 'next/server';
import { getTursoClient, ensureTursoReady } from '@/lib/store/db';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q) return NextResponse.json({ ok: false, error: "No query" });
    
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute(q);
    
    return NextResponse.json({ ok: true, rows: res.rows });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, stack: error.stack });
  }
}
