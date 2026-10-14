import { NextRequest, NextResponse } from "next/server";
import { getSystemLogs, clearSystemLogs } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(10, parseInt(limitParam, 10))) : 100;

    const logs = await getSystemLogs(limit);
    return NextResponse.json({ ok: true, logs });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearSystemLogs();
    return NextResponse.json({ ok: true, message: "Logs eliminados correctamente" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
