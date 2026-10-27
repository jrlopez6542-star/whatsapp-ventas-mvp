import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { OrdersView } from "../../app/panel/OrdersView";

export interface SyntheticOrder {
  id: string;
  conversationId: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  paymentMethod: string;
  itemsSummary: string;
  status: string;
  total: number;
  invoiceNumber?: string;
  invoiceId?: string;
  invoiceUrl?: string;
  createdAt: number;
}

declare global {
  interface Window {
    __BOTW_TEST__?: {
      orders: SyntheticOrder[];
      deleteStatus: Record<string, number>;
      confirmAnswers: boolean[];
      fetchCalls: Array<{ url: string; method: string }>;
      alerts: string[];
      openedUrls: string[];
      externalNavigationAttempts: string[];
      unexpectedFetches: string[];
    };
  }
}

const fixtureValue = window.__BOTW_TEST__;
if (!fixtureValue) throw new Error("Faltan los datos aislados del harness BOTW.");
const fixture: NonNullable<typeof fixtureValue> = fixtureValue;

window.confirm = () => fixture.confirmAnswers.shift() ?? false;
window.alert = (message) => fixture.alerts.push(String(message));
window.open = (url) => {
  fixture.openedUrls.push(String(url));
  return null;
};
window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method || (typeof input === "object" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
  fixture.fetchCalls.push({ url, method });

  const match = url.match(/^\/api\/panel\/orders\/([^/?]+)$/);
  const orderId = match?.[1];
  if (method === "DELETE" && orderId && fixture.orders.some((order) => order.id === orderId)) {
    const status = fixture.deleteStatus[orderId] ?? 200;
    return new Response(status >= 200 && status < 300 ? "{}" : JSON.stringify({ error: "Fallo simulado" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  fixture.unexpectedFetches.push(`${method} ${url}`);
  throw new Error(`Solicitud bloqueada por el harness: ${method} ${url}`);
};

document.addEventListener(
  "click",
  (event) => {
    const anchor = (event.target as Element | null)?.closest("a");
    if (!anchor) return;
    event.preventDefault();
    fixture.externalNavigationAttempts.push(anchor.href);
  },
  true,
);

function IsolatedOrdersView() {
  const [orders, setOrders] = useState(fixture.orders);
  const refreshAfterMockDelete = () => {
    const successfulIds = fixture.fetchCalls
      .filter((call) => call.method === "DELETE")
      .map((call) => call.url.match(/^\/api\/panel\/orders\/([^/?]+)$/)?.[1])
      .filter((id): id is string => Boolean(id && (fixture.deleteStatus[id] ?? 200) < 300));
    setOrders((current) => current.filter((order) => !successfulIds.includes(order.id)));
  };

  return <OrdersView orders={orders} onOrdersChange={refreshAfterMockDelete} />;
}

createRoot(document.getElementById("root")!).render(<IsolatedOrdersView />);
