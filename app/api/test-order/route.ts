import { NextResponse } from 'next/server';
import { handleSalesMessage } from '@/lib/agent/sales-agent';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await handleSalesMessage(
      "whatsapp:+573027961009",
      "Hola",
      "Jhonathan"
    );
    return NextResponse.json({ ok: true, res });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack });
  }
}
