import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("panel_session")?.value;
  if (!token) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const user = await validateSession(token);
  if (user) {
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
    });
  }

  // Compatibilidad legacy si el token coincide con PANEL_PASSWORD
  const envPassword = (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "");
  if (envPassword) {
    const { createHash } = await import("crypto");
    const expected = createHash("sha256").update(`whatsapp-ventas-panel:${envPassword}`).digest("hex");
    if (token === expected) {
      return NextResponse.json({
        ok: true,
        user: {
          id: "usr_admin_legacy",
          email: "admin@bunuelandia.co",
          name: "Administrador Principal",
          role: "admin",
        },
      });
    }
  }

  return NextResponse.json({ ok: false, error: "Sesión inválida o expirada" }, { status: 401 });
}
