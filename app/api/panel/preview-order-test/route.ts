import { NextRequest, NextResponse } from "next/server";
import { createOrder, getOrders, getProducts } from "@/lib/store";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constantes estandarizadas e inmutables para la prueba en Preview.
 * El número telefónico es estrictamente ficticio y no enrutable (3000000000).
 */
export const PREVIEW_TEST_DUMMY_PHONE = "3000000000";
export const PREVIEW_TEST_CONVERSATION_ID = "preview-order-test:singleton";
export const PREVIEW_TEST_IDEMPOTENCY_KEY = "preview-order-test:singleton:key";

/**
 * Validador estricto de seguridad de entorno y bandera explícita (Fail-Closed).
 * - En runtime real: Exige obligatoriamente VERCEL_ENV === "preview" Y ENABLE_PREVIEW_ORDER_TEST === "true".
 * - En producción o entornos sin clasificar: Responde 404 inmediatamente.
 * - En runtime de test automatizado: Exige ENABLE_PREVIEW_ORDER_TEST === "true" y que no sea "production".
 */
export function isPreviewOrderTestAllowed(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  const isEnabled = process.env.ENABLE_PREVIEW_ORDER_TEST === "true";
  const isAutomatedTest = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);

  if (isAutomatedTest) {
    if (vercelEnv === "production") return false;
    return isEnabled;
  }

  // Runtime real en servidor
  if (vercelEnv !== "preview" || !isEnabled) {
    return false;
  }

  return true;
}

/**
 * Lista blanca cerrada de campos permitidos en el cuerpo de la petición.
 * Cualquier campo adicional (ej. phone, customerPhone, total, price, dbUrl) es estrictamente rechazado.
 */
const ALLOWED_BODY_FIELDS = new Set([
  "sku",
  "customerName",
  "deliveryAddress",
  "deliveryNotes",
]);

interface PreviewTestOrderPayload {
  sku?: string;
  customerName?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
}

async function handlePreviewOrderTest(request: NextRequest) {
  // 1. Candado de entorno y bandera de habilitación (Fail-Closed: 404)
  if (!isPreviewOrderTestAllowed()) {
    return NextResponse.json(
      { ok: false, error: "No disponible." },
      { status: 404 }
    );
  }

  // 2. Candado de autenticación administrativa
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    const isForbidden = Boolean(
      auth.error &&
      (auth.error.toLowerCase().includes("permisos") ||
       auth.error.toLowerCase().includes("denegado") ||
       auth.error.toLowerCase().includes("rol"))
    );
    return NextResponse.json(
      { ok: false, error: auth.error || "No autorizado. Inicie sesión en el panel como administrador." },
      { status: isForbidden ? 403 : 401 }
    );
  }

  try {
    let payload: PreviewTestOrderPayload = {};

    if (request.method === "POST") {
      let rawJson: unknown;
      try {
        rawJson = await request.json();
      } catch {
        rawJson = {};
      }

      if (rawJson !== null && typeof rawJson === "object" && !Array.isArray(rawJson)) {
        const bodyObj = rawJson as Record<string, unknown>;
        const keys = Object.keys(bodyObj);

        // Validación estricta de lista blanca: rechazar campos no permitidos
        for (const k of keys) {
          if (!ALLOWED_BODY_FIELDS.has(k)) {
            return NextResponse.json(
              {
                ok: false,
                error: `Campo no permitido en el payload: '${k}'. El teléfono ('${PREVIEW_TEST_DUMMY_PHONE}') y los parámetros de red son inmutables.`,
              },
              { status: 400 }
            );
          }
        }

        payload = {
          sku: typeof bodyObj.sku === "string" ? bodyObj.sku.trim() : undefined,
          customerName: typeof bodyObj.customerName === "string" ? bodyObj.customerName.trim() : undefined,
          deliveryAddress: typeof bodyObj.deliveryAddress === "string" ? bodyObj.deliveryAddress.trim() : undefined,
          deliveryNotes: typeof bodyObj.deliveryNotes === "string" ? bodyObj.deliveryNotes.trim() : undefined,
        };
      } else if (rawJson !== undefined) {
        return NextResponse.json(
          { ok: false, error: "El cuerpo de la petición debe ser un objeto JSON válido." },
          { status: 400 }
        );
      }
    }

    // 3. Control de Idempotencia: Verificar si ya existe una orden activa para la clave de prueba
    const existingOrders = await getOrders();
    const existingOrder = existingOrders.find(
      (o) => o.conversationId === PREVIEW_TEST_CONVERSATION_ID && o.status !== "cancelled"
    );

    if (existingOrder) {
      return NextResponse.json({
        ok: true,
        alreadyExists: true,
        orderId: existingOrder.id,
        order: {
          id: existingOrder.id,
          conversationId: existingOrder.conversationId,
          customerName: existingOrder.customerName,
          customerPhone: existingOrder.customerPhone,
          deliveryAddress: existingOrder.deliveryAddress,
          deliveryNotes: existingOrder.deliveryNotes,
          paymentMethod: existingOrder.paymentMethod,
          itemsSummary: existingOrder.itemsSummary,
          total: existingOrder.total,
          status: existingOrder.status,
          createdAt: existingOrder.createdAt,
        },
        message: "El pedido de prueba ya existía previamente en Turso Sandbox (idempotente).",
        environment: process.env.VERCEL_ENV || "test",
      });
    }

    // 4. Catálogo oficial y resolución matemática
    const products = await getProducts(true);
    const requestedSku = payload.sku ? payload.sku.toUpperCase() : "C4S";
    const product =
      products.find((p) => p.sku === requestedSku) ||
      products.find((p) => p.sku === "C4S") ||
      products[0];

    if (!product) {
      return NextResponse.json(
        { ok: false, error: "No se encontraron productos activos en el catálogo de Preview." },
        { status: 400 }
      );
    }

    const quantity = 1;
    const unitPrice = product.price;
    const total = unitPrice * quantity;

    // 5. Datos estandarizados protegidos
    const customerName = payload.customerName || "CLIENTE PRUEBA BOTW";
    const deliveryAddress = payload.deliveryAddress || "DIRECCIÓN FICTICIA DE PRUEBA";
    const deliveryNotes = payload.deliveryNotes || "PEDIDO DE PRUEBA — NO DESPACHAR";
    const paymentMethod = "Efectivo";
    const itemsSummary = `${quantity}x ${product.name}`;

    // 6. Creación atómica duradera en Turso Sandbox
    // Sin efectos secundarios: NO llama a WhatsApp, NO factura, NO notifica domiciliario
    const order = await createOrder(
      PREVIEW_TEST_CONVERSATION_ID,
      [
        {
          sku: product.sku,
          name: product.name,
          quantity,
          unitPrice,
        },
      ],
      total,
      {
        customerName,
        customerPhone: PREVIEW_TEST_DUMMY_PHONE,
        deliveryAddress,
        deliveryNotes,
        paymentMethod,
        itemsSummary,
        deliveryFee: 0,
        status: "pending",
        idempotencyKey: PREVIEW_TEST_IDEMPOTENCY_KEY,
      }
    );

    return NextResponse.json({
      ok: true,
      alreadyExists: false,
      orderId: order.id,
      order: {
        id: order.id,
        conversationId: order.conversationId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        deliveryNotes: order.deliveryNotes,
        paymentMethod: order.paymentMethod,
        itemsSummary: order.itemsSummary,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      },
      environment: process.env.VERCEL_ENV || "test",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message || "Error al crear pedido de prueba en Preview" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handlePreviewOrderTest(request);
}

export async function POST(request: NextRequest) {
  return handlePreviewOrderTest(request);
}
