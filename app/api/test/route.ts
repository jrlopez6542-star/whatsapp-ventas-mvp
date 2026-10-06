import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/store/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const c = getTursoClient();
    const res = await c.execute("SELECT * FROM messages ORDER BY rowid DESC LIMIT 5");
    return NextResponse.json({ ok: true, rows: res.rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
