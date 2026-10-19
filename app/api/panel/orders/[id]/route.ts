import { NextRequest, NextResponse } from "next/server";
import {
  deleteOrder,
  updateOrderStatus,
  appendMessage,
  markOrderAccountingPaymentSynced,
  type OrderStatus,
} from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";
import { requirePanelAuth } from "@/lib/auth/session";
import { recordPaymentInContabilidad } from "@/lib/contabilidad";
import { notifyDeliveryDriver } from "@/lib/delivery-driver";

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
      "ready",
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

    let warning: string | undefined;
    let paymentSynced = false;

    // FASE 8: El envío de la ficha al domiciliario se activa exclusivamente
    // cuando el pedido esté listo para despacho (transición a "ready").
    // Al pasar posteriormente a "delivering", no se vuelve a disparar automáticamente.
    if (status === "ready") {
      await notifyDeliveryDriver(updated).catch((err) => {
        console.warn("[orders patch] error notificando al domiciliario al pasar a ready:", err);
      });
    }

    if (status === "delivered") {
      const pm = (updated.paymentMethod || "").toLowerCase();
      const isCash =
        pm.includes("efectivo") ||
        pm.includes("contra entrega") ||
        pm.includes("contraentrega");

      if (isCash) {
        if (updated.driverPaymentConfirmed) {
          if (!updated.accountingPaymentSynced) {
            const syncRes = await recordPaymentInContabilidad({
              orderId: updated.id,
              invoiceId: updated.invoiceId,
              invoiceNumber: updated.invoiceNumber,
              amount: updated.total,
              confirmedBy: updated.driverPaymentPhone || "domiciliario",
            });
            if (syncRes.ok) {
              paymentSynced = await markOrderAccountingPaymentSynced(updated.id);
              if (!paymentSynced) {
                warning = "Contabilidad registró el pago, pero BOTW no pudo guardar el estado de sincronización. Se puede reintentar sin duplicar el pago.";
              }
            } else {
              warning = `Pedido entregado con cobro del domiciliario confirmado, pero falló la sincronización con Contabilidad: ${syncRes.error || "error de red"}. Se conservó la confirmación para reintentar.`;
            }
          } else {
            paymentSynced = true;
          }
        } else {
          warning = "Pedido entregado; cobro pendiente de confirmación del domiciliario.";
        }
      }
    }

    if (notifyCustomer !== false && updated.conversationId) {
      let notifyText = "";
      const clientName = updated.customerName || "estimado cliente";
      const address = updated.deliveryAddress || "tu dirección";

      if (status === "preparing") {
        notifyText = `🥟 *¡Hola ${clientName}!* Tus buñuelos se están dorando y preparando en este momento en cocina calienticos y crujientes... 👨‍🍳🔥`;
      } else if (status === "ready") {
        notifyText = `📦 *¡Hola ${clientName}!* Tu pedido ya está empacado y listo para despacho en nuestro punto. En breve el domiciliario saldrá hacia tu dirección. 🥟✨`;
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

    return NextResponse.json({ ok: true, order: updated, warning, paymentSynced });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
