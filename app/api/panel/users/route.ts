import { NextRequest, NextResponse } from "next/server";
import { requirePanelAuth, listAllUsers, createUser, type UserRole } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
  }

  const users = await listAllUsers();
  return NextResponse.json({ ok: true, users });
}

export async function POST(request: NextRequest) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
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
