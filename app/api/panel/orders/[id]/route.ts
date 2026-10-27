import { NextRequest, NextResponse } from "next/server";
import {
  deleteOrder,
  getOrders,
  getOrderStatusSnapshot,
  updateOrderStatus,
  appendMessage,
  markOrderDriverPaymentConfirmed,
  markOrderAccountingPaymentSynced,
  getOrderInvoiceSnapshot,
  type Order,
  type OrderStatus,
} from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";
import { requirePanelAuth } from "@/lib/auth/session";
import { notifyDeliveryDriver } from "@/lib/delivery-driver";
import { recordPaymentInContabilidad } from "@/lib/contabilidad";

export const dynamic = "force-dynamic";

type AccountingPaymentSync = { synced: boolean; warning?: string };
const accountingPaymentSyncsInFlight = new Map<string, Promise<AccountingPaymentSync>>();

async function synchronizeConfirmedCashPayment(
  order: Order,
  confirmedBy?: string
): Promise<AccountingPaymentSync> {
  if (order.accountingPaymentSynced === 1 || order.accountingPaymentSynced === true) {
    return { synced: true };
  }
  if (!order.driverPaymentConfirmed) {
    return { synced: false, warning: "El pago no está confirmado localmente; la sincronización contable queda pendiente." };
  }

  let request = accountingPaymentSyncsInFlight.get(order.id);
  if (!request) {
    request = (async () => {
      const invoice = await getOrderInvoiceSnapshot(order.id);
      const invoiceId = invoice?.invoiceId || order.invoiceId;
      const invoiceNumber = invoice?.invoiceNumber || order.invoiceNumber;
      const amount = Number(order.driverPaymentAmount);
      const confirmedAt = order.driverPaymentConfirmedAt;
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        return { synced: false, warning: "Falta un importe válido del cobro confirmado; la sincronización contable queda pendiente." };
      }
      if (!confirmedAt || confirmedAt <= 0) {
        return { synced: false, warning: "Falta la fecha persistida de confirmación; la sincronización contable queda pendiente." };
      }
      if (!invoiceId && !invoiceNumber) {
        return { synced: false, warning: "El pedido no tiene invoiceId ni número de factura guardados; la sincronización contable queda pendiente." };
      }

      const result = await recordPaymentInContabilidad({
        orderId: order.id,
        invoiceId,
        invoiceNumber,
        amount,
        paymentMethod: order.paymentMethod,
        confirmedBy,
        confirmedAt,
      });

      const identityMatches = Boolean(
        result.orderId === order.id &&
        result.invoiceId && result.invoiceNumber &&
        (!invoiceId || result.invoiceId === invoiceId) &&
        (!invoiceNumber || result.invoiceNumber === invoiceNumber)
      );
      // The payment amount is validated independently from the invoice total.
      const amountMatches = typeof result.amount === "number" &&
        Number.isFinite(result.amount) && Math.abs(result.amount - amount) <= 1;
      const responseIsConfirmed = result.ok && result.status === "paid" &&
        typeof result.alreadyPaid === "boolean" &&
        Boolean(result.paymentId?.trim()) && identityMatches && amountMatches;

      if (!responseIsConfirmed) {
        return {
          synced: false,
          warning: result.alreadyPaid === true
            ? "Contabilidad indica que el pedido ya tiene un pago, pero las referencias o el importe aplicado no coinciden. El pago local queda pendiente de conciliación."
            : result.error
            ? `Cobro confirmado en BOTW; Contabilidad no confirmó la sincronización (${result.error}). Queda pendiente para reintentar.`
            : "Cobro confirmado en BOTW; la respuesta de Contabilidad no coincide con el pedido, factura o importe esperado. Queda pendiente para reintentar.",
        };
      }

      const syncedAt = Date.now();
      const marked = await markOrderAccountingPaymentSynced(order.id, syncedAt);
      return marked
        ? { synced: true }
        : { synced: false, warning: "Contabilidad confirmó el cobro, pero BOTW no pudo guardar el marcador de sincronización. Queda pendiente para reintentar de forma idempotente." };
    })().finally(() => {
      if (accountingPaymentSyncsInFlight.get(order.id) === request) {
        accountingPaymentSyncsInFlight.delete(order.id);
      }
    });
    accountingPaymentSyncsInFlight.set(order.id, request);
  }
  return request;
}

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

    const updated = await updateOrderStatus(id, status, {
      rejectCancelled: status === "delivered",
      rejectDeliveredOrPaid: status === "cancelled",
      ...(status === "preparing"
        ? { allowedCurrentStatuses: ["pending", "confirmed"] }
        : {}),
    });
    if (!updated) {
      if (status === "preparing") {
        const currentOrder = await getOrderStatusSnapshot(id);
        if (!currentOrder) {
          return NextResponse.json({ ok: false, error: "Pedido no encontrado" }, { status: 404 });
        }
        return NextResponse.json(
          { ok: false, error: `No se puede pasar el pedido a preparación desde el estado actual "${currentOrder.status}".` },
          { status: 409 }
        );
      } else if (status === "delivered") {
        const currentOrder = (await getOrders()).find((order) => order.id === id);
        if (currentOrder?.status === "cancelled") {
          return NextResponse.json(
            { ok: false, error: "No se puede marcar como entregado ni confirmar el cobro de un pedido cancelado." },
            { status: 409 }
          );
        }
      } else if (status === "cancelled") {
        const currentOrder = (await getOrders()).find((order) => order.id === id);
        if (currentOrder && (currentOrder.status === "delivered" || currentOrder.driverPaymentConfirmed)) {
          return NextResponse.json(
            { ok: false, error: "No se puede cancelar un pedido ya entregado o con el cobro confirmado." },
            { status: 409 }
          );
        }
      }
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
        if (!updated.driverPaymentConfirmed) {
          const confirmed = await markOrderDriverPaymentConfirmed(updated.id, {
            amount: updated.total,
            phone: "panel-admin",
          }, { requiredStatus: "delivered" });
          if (confirmed?.driverPaymentConfirmed) {
            Object.assign(updated, confirmed);
          } else {
            const latestOrder = (await getOrders()).find((order) => order.id === id);
            if (latestOrder?.status === "delivered" && latestOrder.driverPaymentConfirmed) {
              Object.assign(updated, latestOrder);
            } else {
              warning = "Pedido entregado, pero BOTW no pudo registrar la confirmación del cobro.";
            }
          }
        }

        if (updated.driverPaymentConfirmed) {
          const sync = await synchronizeConfirmedCashPayment(
            updated,
            auth.user?.name || auth.user?.email || auth.user?.id
          ).catch((err) => ({
            synced: false,
            warning: `Cobro confirmado en BOTW; falló la sincronización con Contabilidad y queda pendiente para reintentar (${err instanceof Error ? err.name : "IntegrationError"}).`,
          }));
          paymentSynced = sync.synced;
          if (paymentSynced) {
            updated.accountingPaymentSynced = 1;
            updated.accountingPaymentSyncedAt = Date.now();
          } else if (sync.warning) {
            warning = sync.warning;
          }
        } else if (!warning) {
          warning = "Pedido entregado, pero BOTW no pudo registrar la confirmación del cobro.";
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
