import assert from "node:assert/strict";
import test from "node:test";
import { getSessionMessages } from "../lib/agent/session-context";
import type { Message, Order } from "../lib/store";

function message(id: string, role: Message["role"], content: string, createdAt: number): Message {
  return { id, conversationId: "local-session-test", role, content, createdAt };
}

test("getSessionMessages conserva el historial normal en el mismo orden y con el mismo contenido", () => {
  const history = [
    message("m1", "user", "Quiero una caja tradicional", 100),
    message("m2", "assistant", "¿A qué dirección la enviamos?", 200),
    message("m3", "user", "Calle 5 # 3-10", 300),
  ];
  const expected = [
    { id: "m1", conversationId: "local-session-test", role: "user", content: "Quiero una caja tradicional", createdAt: 100 },
    { id: "m2", conversationId: "local-session-test", role: "assistant", content: "¿A qué dirección la enviamos?", createdAt: 200 },
    { id: "m3", conversationId: "local-session-test", role: "user", content: "Calle 5 # 3-10", createdAt: 300 },
  ];

  assert.deepEqual(getSessionMessages(history), expected);
});

test("getSessionMessages inicia el contexto después del marcador de nuevo pedido", () => {
  const history = [
    message("old-user", "user", "Quiero una caja x8", 100),
    message("old-bot", "assistant", "Pedido registrado", 200),
    message("restart", "user", "Hola, quiero otro pedido", 300),
    message("new-bot", "assistant", "Claro, cuéntame qué deseas", 400),
  ];

  assert.deepEqual(getSessionMessages(history), history.slice(3));
});

test("getSessionMessages corta el historial anterior a un pedido cancelado o terminado", () => {
  const orderTime = Date.now();
  const history = [
    message("before", "user", "Quiero una caja x4", orderTime - 200),
    message("at-order", "assistant", "Pedido registrado", orderTime),
    message("after", "user", "Quiero hacer otro pedido", orderTime + 1),
  ];
  const baseOrder = {
    id: "order-local",
    conversationId: "local-session-test",
    status: "cancelled",
    total: 0,
    createdAt: orderTime,
  } satisfies Order;

  for (const status of ["cancelled", "delivered"] as const) {
    assert.deepEqual(getSessionMessages(history, { ...baseOrder, status }), [history[2]]);
  }
});

test("equivalencia: los mensajes posteriores a una cancelación explícita coinciden con la salida esperada", () => {
  const history = [
    message("m1", "user", "Quiero un pedido", 100),
    message("m2", "assistant", "Hemos cancelado tu solicitud de pedido", 200),
    message("m3", "user", "Ahora quiero una caja x4", 300),
    message("m4", "assistant", "¿Qué dirección?", 400),
  ];
  const expected = [
    { id: "m3", conversationId: "local-session-test", role: "user", content: "Ahora quiero una caja x4", createdAt: 300 },
    { id: "m4", conversationId: "local-session-test", role: "assistant", content: "¿Qué dirección?", createdAt: 400 },
  ];

  assert.deepEqual(getSessionMessages(history), expected);
});
