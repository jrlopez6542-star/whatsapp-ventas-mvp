import { NextRequest, NextResponse } from "next/server";
import { validateSession, listAllUsers, createUser, type UserRole } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("panel_session")?.value;
  if (!token) return null;
  const user = await validateSession(token);
  if (user && user.role === "admin") return user;

  // Compatibilidad legacy
  const envPassword = (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "");
  if (envPassword) {
    const { createHash } = await import("crypto");
    const expected = createHash("sha256").update(`whatsapp-ventas-panel:${envPassword}`).digest("hex");
    if (token === expected) {
      return { id: "admin_legacy", email: "admin@bunuelandia.co", name: "Admin", role: "admin" as UserRole };
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
  }

  const users = await listAllUsers();
  return NextResponse.json({ ok: true, users });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, password, name, role, phone } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { ok: false, error: "Correo, contraseña y nombre son campos obligatorios." },
        { status: 400 }
      );
    }

    const validRoles: UserRole[] = ["admin", "operator", "driver"];
    const targetRole = validRoles.includes(role) ? role : "operator";

    const newUser = await createUser({
      email,
      password,
      name,
      role: targetRole,
      phone,
    });

    return NextResponse.json({ ok: true, user: newUser }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error al crear el usuario." },
      { status: 400 }
    );
  }
}
