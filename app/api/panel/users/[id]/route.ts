import { NextRequest, NextResponse } from "next/server";
import { validateSession, updateUser, deleteUser, type UserRole } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("panel_session")?.value;
  if (!token) return null;
  const user = await validateSession(token);
  if (user && user.role === "admin") return user;

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const updated = await updateUser(id, body);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, user: updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Error al actualizar usuario" }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
  }

  const { id } = await params;

  // Evitar que el administrador se elimine a sí mismo
  if (admin.id === id) {
    return NextResponse.json(
      { ok: false, error: "No puedes eliminar tu propia cuenta de administrador mientras tienes la sesión iniciada." },
      { status: 400 }
    );
  }

  const success = await deleteUser(id);
  if (!success) {
    return NextResponse.json({ ok: false, error: "No se pudo eliminar el usuario." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
