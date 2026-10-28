import { NextRequest, NextResponse } from "next/server";
import { createOrder, deleteOrder, type Order } from "@/lib/store";
import { validateSession, requirePanelAuth } from "@/lib/auth/session";
import {
  validateTursoEnvironmentAccess,
  isTursoConfigured,
  ensureTursoReady,
  getTursoClient,
} from "@/lib/store/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const CONTROLLED_TEST_CONVERSATION_ID = "test:preview:sandbox-order";
export const CONTROLLED_TEST_CUSTOMER_NAME = "[PRUEBA PREVIEW] Auditoría BOTW";

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
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error al simular pedido";
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

/**
 * POST /api/test-order
 * Creación controlada de un pedido de prueba persistente.
 * Restricciones estrictas:
 * 1. Solo se ejecuta en Vercel Preview (VERCEL_ENV === "preview").
 * 2. Requiere sesión administrativa activa (rol admin).
 * 3. Valida el aislamiento seguro de la base de datos Turso Sandbox antes de escribir.
 * 4. Evita duplicados verificando existencia previa; si la lectura falla, aborta por fallo seguro.
 * 5. Cero efectos externos (sin WhatsApp, sin Evolution API, sin Contabilidad).
 */
export async function POST(request: NextRequest) {
  // 1. Candado de entorno: Exclusivamente en Vercel Preview
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json(
      { ok: false, error: "Operación restringida: la creación de pedidos persistentes de prueba solo está permitida en entorno Preview." },
      { status: 403 }
    );
  }

  // 2. Candado de autorización: Sesión con rol admin obligatoria
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: auth.error || "No autorizado. Inicie sesión como administrador para ejecutar pruebas." },
      { status: 401 }
    );
  }

  // 3. Candado de base de datos: Validar aislamiento de configuración Turso Sandbox
  const dbValidation = validateTursoEnvironmentAccess();
  if (!dbValidation.allowed) {
    return NextResponse.json(
      { ok: false, error: `Validación de aislamiento Turso fallida: ${dbValidation.reason || "conexión no permitida en Preview"}` },
      { status: 403 }
    );
  }

  // 4. Candado de idempotencia / no duplicación: Verificar si ya existe el pedido de prueba
  // Si la lectura en la base de datos falla, abortar por fallo seguro para evitar crear duplicados
  try {
    let existingOrder: Order | undefined;
    if (isTursoConfigured()) {
      await ensureTursoReady();
      const client = getTursoClient();
      const checkRes = await client.execute({
        sql: "SELECT id, customer_name, customer_phone, delivery_address, payment_method, items_summary, status, total, created_at FROM orders WHERE conversation_id = ? OR customer_name = ? LIMIT 1",
        args: [CONTROLLED_TEST_CONVERSATION_ID, CONTROLLED_TEST_CUSTOMER_NAME],
      });
      if (checkRes.rows && checkRes.rows.length > 0) {
        const r: Record<string, unknown> = checkRes.rows[0] as Record<string, unknown>;
        existingOrder = {
          id: String(r.id),
          conversationId: CONTROLLED_TEST_CONVERSATION_ID,
          customerName: r.customer_name ? String(r.customer_name) : undefined,
          customerPhone: r.customer_phone ? String(r.customer_phone) : undefined,
          deliveryAddress: r.delivery_address ? String(r.delivery_address) : undefined,
          paymentMethod: r.payment_method ? String(r.payment_method) : undefined,
          itemsSummary: r.items_summary ? String(r.items_summary) : undefined,
          status: (r.status as Order["status"]) || "pending",
          total: Number(r.total ?? 0),
          createdAt: Number(r.created_at ?? Date.now()),
        };
      }
    }

    if (existingOrder) {
      return NextResponse.json({
        ok: true,
        persisted: true,
        created: false,
        message: "El pedido de prueba ya existía previamente en la base de datos.",
        orderId: existingOrder.id,
        order: {
          id: existingOrder.id,
          customerName: existingOrder.customerName,
          customerPhone: existingOrder.customerPhone,
          deliveryAddress: existingOrder.deliveryAddress,
          paymentMethod: existingOrder.paymentMethod,
          itemsSummary: existingOrder.itemsSummary,
          status: existingOrder.status,
          total: existingOrder.total,
          createdAt: existingOrder.createdAt,
        },
      });
    }
  } catch (readErr: unknown) {
    const errorMsg = readErr instanceof Error ? readErr.message : "Error al verificar pedidos existentes";
    return NextResponse.json(
      {
        ok: false,
        error: `No se pudo comprobar la existencia previa del pedido de prueba: ${errorMsg}. Operación abortada por seguridad para evitar duplicados.`,
      },
      { status: 500 }
    );
  }

  // 5. Inserción de pedido claramente identificado como prueba mediante createOrder
  try {
    const order = await createOrder(
      CONTROLLED_TEST_CONVERSATION_ID,
      [{ sku: "C4S", quantity: 1, unitPrice: 18000, name: "Caja x4 Surtida" }],
      18000,
      {
        customerName: CONTROLLED_TEST_CUSTOMER_NAME,
        customerPhone: "3000000000",
        deliveryAddress: "CRA 1 # 1-1 (PREVIEW SANDBOX)",
        paymentMethod: "Efectivo",
        itemsSummary: "1x CAJA x4 Surtida [TEST]",
        deliveryFee: 0,
        status: "pending",
        deliveryNotes: "Pedido de prueba generado desde panel Preview para verificar persistencia",
      }
    );

    return NextResponse.json(
      {
        ok: true,
        persisted: true,
        created: true,
        message: "Pedido de prueba creado y persistido exitosamente en Preview.",
        orderId: order.id,
        order: {
          id: order.id,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          deliveryAddress: order.deliveryAddress,
          paymentMethod: order.paymentMethod,
          itemsSummary: order.itemsSummary,
          status: order.status,
          total: order.total,
          createdAt: order.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error al crear pedido de prueba";
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  }
}
