import { NextResponse } from 'next/server';
import { getOrders, getMemoryStore } from '@/lib/store';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const turso = await getOrders();
  const memory = getMemoryStore().getOrders();
  return NextResponse.json({ ok: true, turso, memory });
}
