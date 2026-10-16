import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrgSettings } from "@/lib/store";
import { formatDeliveryDriverMessage, notifyDeliveryDriver } from "@/lib/delivery-driver";
import { requirePanelAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePanelAuth(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: auth.error || "No autorizado" },
      { status: 401 }
    );
  }

  const { id } = await params;
  try {
    const orders = await getOrders();
    const order = orders.find((o) => o.id === id);
    if (!order) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    const settings = await getOrgSettings();
    const message = formatDeliveryDriverMessage(order, settings);
    const driverPhone = settings.deliveryDriverPhone?.trim() || "";

    const cleanDriverDigits = driverPhone.replace(/\D/g, "");
    const waLink = cleanDriverDigits
      ? `https://wa.me/${cleanDriverDigits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    if (!driverPhone) {
      return NextResponse.json({
        ok: false,
        noPhoneConfigured: true,
        message,
        waLink,
        error: "No hay número de domiciliario configurado en Ajustes.",
      });
    }

    const sendRes = await notifyDeliveryDriver(order, message, { force: true });
    if (!sendRes.ok) {
      return NextResponse.json({
        ok: false,
        error: sendRes.error,
        sentTo: driverPhone,
        message,
        waLink,
      });
    }

    return NextResponse.json({
      ok: true,
      sentTo: driverPhone,
      message,
      waLink,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
