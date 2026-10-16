import { NextRequest, NextResponse } from "next/server";
import { createOrder, deleteOrder } from "@/lib/store";
import { validateSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("panel_session")?.value;
  const isDev = process.env.NODE_ENV !== "production";
  const user = token ? await validateSession(token) : null;

  if (!isDev && !user) {
    return NextResponse.json(
      { ok: false, error: "No autorizado. Inicie sesión en el panel para ejecutar pruebas." },
      { status: 401 }
    );
  }

  try {
    const order = await createOrder(
      "test-conv",
      [{ sku: "C4S", quantity: 1, unitPrice: 18000 }],
      18000,
      {
        customerName: "Prueba Sistema",
        deliveryAddress: "CRA 3a (Prueba)",
        paymentMethod: "Efectivo",
        itemsSummary: "1x CAJA x4 Surtida",
      }
    );
    // Limpiar inmediatamente el pedido de prueba
    await deleteOrder(order.id).catch(() => {});
    return NextResponse.json({ ok: true, msg: "Simulación de pedido completada y limpiada", orderId: order.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Error al simular pedido" }, { status: 500 });
  }
}
