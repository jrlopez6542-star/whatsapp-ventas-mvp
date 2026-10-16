import { NextRequest, NextResponse } from "next/server";
import { requirePanelAuth, updateUser, deleteUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
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
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado. Se requiere rol de Administrador." }, { status: 403 });
  }

  const { id } = await params;

  // Evitar que el administrador se elimine a sí mismo
  if (auth.user.id === id) {
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
