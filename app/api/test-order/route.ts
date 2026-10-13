import { NextResponse } from 'next/server';
import { createOrder } from '@/lib/store';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const order = await createOrder(
      "test-conv",
      [{ sku: "C4S", quantity: 1, unitPrice: 18000 }],
      18000,
      {
        customerName: "Jhonathan",
        deliveryAddress: "CRA 3a",
        paymentMethod: "Efectivo",
        itemsSummary: "1x CAJA x4 Surtida"
      }
    );
    return NextResponse.json({ ok: true, order });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack });
  }
}
