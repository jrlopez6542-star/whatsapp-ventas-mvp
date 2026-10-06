import { NextResponse } from "next/server";
import { getOrders } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const orders = await getOrders();
  return NextResponse.json({ ok: true, orders });
}

