import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/store";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePanelAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "No autorizado" }, { status: 401 });
  }

  const orders = await getOrders();
  return NextResponse.json({ ok: true, orders });
}

