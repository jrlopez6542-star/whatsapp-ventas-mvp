import { NextRequest, NextResponse } from "next/server";
import { deleteOrder, updateOrderStatus, appendMessage, type OrderStatus } from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";
import { requirePanelAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: "Acceso denegado. Solo administradores pueden eliminar pedidos." },
      { status: 403 }
    );
  }

  const { id } = await params;
  await deleteOrder(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
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
    const body = await request.json();
    const { status, notifyCustomer } = body;

    const validStatuses: OrderStatus[] = [
      "pending",
      "confirmed",
      "preparing",
      "delivering",
      "delivered",
      "cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json({ ok: false, error: "Estado no válido" }, { status: 400 });
    }

    const updated = await updateOrderStatus(id, status);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Pedido no encontrado" }, { status: 404 });
    }

    if (notifyCustomer !== false && updated.conversationId) {
      let notifyText = "";
      const clientName = updated.customerName || "estimado cliente";
      const address = updated.deliveryAddress || "tu dirección";

      if (status === "preparing") {
        notifyText = `🥟 *¡Hola ${clientName}!* Tus buñuelos se están dorando y preparando en este momento en cocina calienticos y crujientes... 👨‍🍳🔥`;
      } else if (status === "delivering") {
        notifyText = `🛵 *¡Tu pedido va en camino!* El domiciliario ya salió hacia ${address}. Atento a la puerta o al celular para recibir tus buñuelos calientes. 🔥📦`;
      } else if (status === "delivered") {
        notifyText = `🎉 *¡Pedido entregado!* Buen provecho, esperamos que los disfrutes un montón. ¡Muchas gracias por tu compra en BUÑUELANDIA! 🥟❤️`;
      } else if (status === "cancelled") {
        notifyText = `⚠️ *Actualización:* Tu pedido ha sido cancelado. Si tienes alguna duda o deseas reprogramarlo, escríbenos por este chat.`;
      }

      if (notifyText) {
        await sendOutboundWhatsApp(updated.conversationId, notifyText).catch((err) => {
          console.warn("[orders patch] error sending notification:", err);
        });
        await appendMessage(updated.conversationId, "assistant", notifyText).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, order: updated });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
