import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@libsql/client";
import { handleSalesMessage } from "../lib/agent/sales-agent";
import {
  createOrder,
  getOrderStatusSnapshot,
  markOrderDriverPaymentConfirmed,
  resetTursoReadyForTesting,
  setTursoClientForTesting,
  updateOrderStatus,
} from "../lib/store";

const OPEN_STATUSES = ["pending", "confirmed"] as const;

interface IsolatedSqliteContext {
  client: any;
  sqlite: any;
  setIntercept: (next?: (statement: any) => Promise<void>) => void;
}

async function withIsolatedSqlite(run: (context: IsolatedSqliteContext) => Promise<void>) {
  const sqlite = createClient({ url: "file::memory:" });
  let intercept: ((statement: any) => Promise<void>) | undefined;
  const client = {
    batch: sqlite.batch.bind(sqlite),
    execute: async (statement: any) => {
      await intercept?.(statement);
      return sqlite.execute(statement);
    },
  };

  setTursoClientForTesting(client);
  resetTursoReadyForTesting();
  try {
    await run({
      client,
      sqlite,
      setIntercept: (next?: (statement: any) => Promise<void>) => { intercept = next; },
    });
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    await sqlite.close();
  }
}

async function newPendingOrder(suffix: string) {
  return createOrder(`whatsapp:+57300999${suffix}`, [], 25000, {
    status: "pending",
    paymentMethod: "Efectivo contra entrega",
    invoiceNumber: `TEST-${suffix}`,
    invoiceId: `test-invoice-${suffix}`,
  });
}

test("sales cancellation uses the persisted conditional state and rereads a delivery/payment race", async () => {
  await withIsolatedSqlite(async ({ sqlite, setIntercept }) => {
    const conversationId = "whatsapp:+573009990001";
    const order = await createOrder(conversationId, [], 25000, {
      status: "pending",
      paymentMethod: "Efectivo contra entrega",
    });
    await sqlite.execute("ALTER TABLE messages ADD COLUMN at TEXT NOT NULL DEFAULT ''");
    let simulated = false;
    setIntercept(async (statement) => {
      const sql = typeof statement === "string" ? statement : statement?.sql;
      const args = typeof statement === "string" ? [] : statement?.args || [];
      if (!simulated && sql?.startsWith("UPDATE orders SET status = ? WHERE id = ? AND status IN")) {
        simulated = true;
        await sqlite.execute({
          sql: "UPDATE orders SET status = 'delivered', driver_payment_confirmed = 1 WHERE id = ?",
          args: [order.id],
        });
      }
    });

    const result = await handleSalesMessage(conversationId, "cancelar pedido");
    const current = await getOrderStatusSnapshot(order.id);
    assert.equal(simulated, true, "La prueba debe intercalar la entrega antes del compare-and-set de cancelación");
    assert.equal(current?.status, "delivered");
    assert.equal(current?.driverPaymentConfirmed, 1);
    assert.match(result.reply, /no es posible cancelar|no puede cancelar/i);
    assert.doesNotMatch(result.reply, /ha sido cancelado con éxito/i);
  });
});

test("a failed cancellation write is not reported as successful", async () => {
  await withIsolatedSqlite(async ({ sqlite, setIntercept }) => {
    const conversationId = "whatsapp:+573009990005";
    const order = await createOrder(conversationId, [], 25000, {
      status: "pending",
      paymentMethod: "Efectivo contra entrega",
    });
    await sqlite.execute("ALTER TABLE messages ADD COLUMN at TEXT NOT NULL DEFAULT ''");
    setIntercept(async (statement) => {
      const sql = typeof statement === "string" ? statement : statement?.sql;
      if (sql?.startsWith("UPDATE orders SET status = ? WHERE id = ? AND status IN")) {
        throw new Error("isolated write failure");
      }
    });

    const result = await handleSalesMessage(conversationId, "cancelar pedido");
    const current = await getOrderStatusSnapshot(order.id);
    assert.equal(current?.status, "pending");
    assert.match(result.reply, /no pude confirmar la cancelación/i);
    assert.doesNotMatch(result.reply, /ha sido cancelado con éxito/i);
  });
});

test("a cancellation during receipt verification prevents preparing and is reread as cancelled", async () => {
  await withIsolatedSqlite(async () => {
    const order = await newPendingOrder("0002");
    const snapshotBeforeVerification = await getOrderStatusSnapshot(order.id);
    assert.equal(snapshotBeforeVerification?.status, "pending");

    const cancelled = await updateOrderStatus(order.id, "cancelled", {
      allowedCurrentStatuses: [...OPEN_STATUSES],
      rejectDeliveredOrPaid: true,
    });
    assert.equal(cancelled?.status, "cancelled");

    const prepared = await updateOrderStatus(order.id, "preparing", {
      allowedCurrentStatuses: [...OPEN_STATUSES],
    });
    const current = await getOrderStatusSnapshot(order.id);
    assert.equal(prepared, null, "La transición condicional no debe aplicar sobre estado cancelado");
    assert.equal(current?.status, "cancelled", "La relectura debe conservar el estado vigente");
  });
});

test("panel refuses to move an already cancelled order to preparing", async () => {
  await withIsolatedSqlite(async ({ sqlite }) => {
    const { NextRequest } = await import("next/server");
    const { createUser, createSession } = await import("../lib/auth/session");
    const { PATCH } = await import("../app/api/panel/orders/[id]/route");
    const order = await newPendingOrder("0006");
    await sqlite.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
    const user = await createUser({
      email: `cancelled-preparing-${Date.now()}@example.test`,
      password: "Password123*",
      name: "Test Admin",
      role: "admin",
    });
    const { token } = await createSession(user.id);
    const request = new NextRequest(`http://localhost/api/panel/orders/${order.id}`, {
      method: "PATCH",
      headers: { cookie: `panel_session=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "preparing", notifyCustomer: false }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: order.id }) });
    assert.equal(response.status, 409);
    assert.equal((await getOrderStatusSnapshot(order.id))?.status, "cancelled");
  });
});

test("panel rereads a cancellation that wins while preparing is being persisted and sends no notification", async () => {
  await withIsolatedSqlite(async ({ sqlite, setIntercept }) => {
    const { NextRequest } = await import("next/server");
    const { createUser, createSession } = await import("../lib/auth/session");
    const { PATCH } = await import("../app/api/panel/orders/[id]/route");
    const order = await newPendingOrder("0007");
    const user = await createUser({
      email: `race-preparing-${Date.now()}@example.test`,
      password: "Password123*",
      name: "Test Admin",
      role: "admin",
    });
    const { token } = await createSession(user.id);
    let cancellationInterleaved = false;
    setIntercept(async (statement) => {
      const sql = typeof statement === "string" ? statement : statement?.sql;
      const args = typeof statement === "string" ? [] : statement?.args || [];
      if (!cancellationInterleaved && sql?.startsWith("UPDATE orders SET status = ? WHERE id = ? AND status IN") && args[0] === "preparing") {
        cancellationInterleaved = true;
        await sqlite.execute({
          sql: "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'confirmed')",
          args: [order.id],
        });
      }
    });

    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const request = new NextRequest(`http://localhost/api/panel/orders/${order.id}`, {
        method: "PATCH",
        headers: { cookie: `panel_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "preparing", notifyCustomer: true }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: order.id }) });
      assert.equal(cancellationInterleaved, true);
      assert.equal(response.status, 409);
      assert.equal((await getOrderStatusSnapshot(order.id))?.status, "cancelled");
      assert.equal(fetchCalls, 0, "No outbound notification is sent for a rejected transition");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("panel allows the normal pending-to-preparing transition", async () => {
  await withIsolatedSqlite(async () => {
    const { NextRequest } = await import("next/server");
    const { createUser, createSession } = await import("../lib/auth/session");
    const { PATCH } = await import("../app/api/panel/orders/[id]/route");
    const order = await newPendingOrder("0008");
    const user = await createUser({
      email: `legitimate-preparing-${Date.now()}@example.test`,
      password: "Password123*",
      name: "Test Admin",
      role: "admin",
    });
    const { token } = await createSession(user.id);
    const request = new NextRequest(`http://localhost/api/panel/orders/${order.id}`, {
      method: "PATCH",
      headers: { cookie: `panel_session=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "preparing", notifyCustomer: false }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: order.id }) });
    assert.equal(response.status, 200);
    assert.equal((await getOrderStatusSnapshot(order.id))?.status, "preparing");
  });
});

test("concurrent SQLite delivery and cancellation leave either a clean cancellation or a delivered confirmed order", async () => {
  await withIsolatedSqlite(async () => {
    const order = await newPendingOrder("0003");
    const [cancelled, delivered] = await Promise.all([
      updateOrderStatus(order.id, "cancelled", {
        allowedCurrentStatuses: [...OPEN_STATUSES],
        rejectDeliveredOrPaid: true,
      }),
      updateOrderStatus(order.id, "delivered", { rejectCancelled: true }),
    ]);

    if (delivered) {
      const confirmed = await markOrderDriverPaymentConfirmed(
        order.id,
        { amount: order.total, phone: "panel-admin" },
        { requiredStatus: "delivered" }
      );
      assert.equal(confirmed?.driverPaymentConfirmed, 1);
    }

    const current = await getOrderStatusSnapshot(order.id);
    assert.ok(current);
    if (cancelled) {
      assert.equal(delivered, null);
      assert.equal(current.status, "cancelled");
      assert.equal(current.driverPaymentConfirmed || 0, 0);
    } else {
      assert.ok(delivered);
      assert.equal(current.status, "delivered");
      assert.equal(current.driverPaymentConfirmed, 1);
    }
  });
});

test("the verified-receipt route guards its post-verification write and returns before notification when cancelled", () => {
  const route = readFileSync("app/api/webhooks/evolution/route.ts", "utf8");
  const transition = route.indexOf('preparedOrder = await updateOrderStatus(pendingOrder.id, "preparing"');
  const cancelledCheck = route.indexOf('currentOrder?.status === "cancelled"', transition);
  const notification = route.indexOf("notifyDeliveryDriver(preparedOrder", transition);
  assert.notEqual(transition, -1);
  assert.match(route.slice(transition, transition + 260), /allowedCurrentStatuses:\s*\["pending",\s*"confirmed"\]/);
  assert.ok(cancelledCheck > transition, "Relee el estado cuando el compare-and-set falla");
  assert.ok(notification > cancelledCheck, "La notificación ocurre solo después de manejar el estado cancelado");
  assert.match(route.slice(cancelledCheck, notification), /return;/, "El pedido cancelado no alcanza el envío al domiciliario");
});

test("legitimate pending receipt can advance and the invoice/accounting fields stay untouched", async () => {
  await withIsolatedSqlite(async () => {
    const order = await newPendingOrder("0004");
    const prepared = await updateOrderStatus(order.id, "preparing", {
      allowedCurrentStatuses: [...OPEN_STATUSES],
    });
    assert.equal(prepared?.status, "preparing");
    assert.equal(prepared?.driverPaymentConfirmed || 0, 0);
    assert.equal(prepared?.accountingPaymentSynced || 0, 0);
    assert.equal(prepared?.invoiceNumber, "TEST-0004");
    assert.equal(prepared?.invoiceId, "test-invoice-0004");
  });
});
