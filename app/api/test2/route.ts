import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, ensureTursoReady } from "@/lib/store/db";
import { validateSession } from "@/lib/auth/session";

export const runtime = "nodejs";

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
    await ensureTursoReady();
    const client = getTursoClient();

    const testId = "test-id-" + Date.now();
    try {
      await client.execute({
        sql: `INSERT INTO orders (id, conversation_id, customer_name, delivery_address, payment_method, items_summary, status, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          testId,
          "whatsapp:test",
          "Test User",
          "Test Addr",
          "Cash",
          "Test Items",
          "pending",
          18000,
          Date.now(),
        ],
      });
      // Limpiar el pedido de prueba inmediatamente para no ensuciar la base de datos
      await client.execute({ sql: "DELETE FROM orders WHERE id = ?", args: [testId] }).catch(() => {});
      return NextResponse.json({ ok: true, msg: "Prueba de inserción en BD exitosa (registro limpiado)" });
    } catch (insertErr: any) {
      return NextResponse.json({ ok: false, error: insertErr.message });
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
