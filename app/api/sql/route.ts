import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, ensureTursoReady } from "@/lib/store/db";
import { validateSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Proteger estrictamente en producción: solo accesible por Administrador autenticado
  const token = req.cookies.get("panel_session")?.value;
  const isDev = process.env.NODE_ENV !== "production";

  let isAdmin = false;
  if (token) {
    const user = await validateSession(token);
    if (user && user.role === "admin") {
      isAdmin = true;
    }
  }

  if (!isDev && !isAdmin) {
    return NextResponse.json(
      { ok: false, error: "Acceso no autorizado. Este endpoint está restringido." },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    if (!q) return NextResponse.json({ ok: false, error: "No query" }, { status: 400 });

    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute(q);

    return NextResponse.json({ ok: true, rows: res.rows });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error al ejecutar consulta" },
      { status: 500 }
    );
  }
}
