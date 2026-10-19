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

    let allowForce = false;
    try {
      const urlObj = new URL(request.url);
      if (urlObj.searchParams.get("force") === "true") {
        allowForce = true;
      } else {
        const body = await request.clone().json().catch(() => ({}));
        if (body?.force === true) {
          allowForce = true;
        }
      }
    } catch {}

    // Evitar envíos prematuros si el pedido aún no está listo en cocina.
    // Los estados 'pending', 'confirmed' y 'preparing' se rechazan SIEMPRE con HTTP 400,
    // independientemente de si se envía force=true.
    const isPremature =
      order.status === "pending" ||
      order.status === "confirmed" ||
      order.status === "preparing";

    if (isPremature) {
      return NextResponse.json(
        {
          ok: false,
          premature: true,
          error: `El pedido está en estado '${order.status}'. Debe marcarse como 'Listo para despacho' (ready) antes de notificar al domiciliario.`,
        },
        { status: 400 }
      );
    }

    if (order.status === "cancelled") {
      return NextResponse.json(
        {
          ok: false,
          error: "No se puede notificar al domiciliario sobre un pedido cancelado.",
        },
        { status: 400 }
      );
    }

    const sendRes = await notifyDeliveryDriver(order, message, { force: allowForce });
    if (!sendRes.ok) {
      return NextResponse.json({
        ok: false,
        error: sendRes.error,
        sentTo: driverPhone,
        message,
        waLink,
      });
    }

    if (sendRes.skipped === "duplicate") {
      return NextResponse.json({
        ok: true,
        skipped: "duplicate",
        alreadyNotified: true,
        sentTo: driverPhone,
        message,
        waLink,
        notice: "La ficha ya había sido enviada previamente al domiciliario.",
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
