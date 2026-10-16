import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, setConversationCustomerName } from "@/lib/store";
import { deleteEvolutionChat } from "@/lib/evolution";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: auth.error || "Acceso denegado. Se requiere rol de administrador." },
      { status: auth.error?.includes("permisos") ? 403 : 401 }
    );
  }

  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  try {
    await deleteConversation(decodedId);
    // Intentar sincronizar borrado / vaciado de chat en la app de WhatsApp vía Evolution
    await deleteEvolutionChat(decodedId).catch(() => {});
    return NextResponse.json({ ok: true, deletedId: decodedId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePanelAuth(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: auth.error || "No autorizado" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  try {
    const { customerName } = await request.json();
    if (typeof customerName === "string") {
      await setConversationCustomerName(decodedId, customerName);
      return NextResponse.json({ ok: true, customerName });
    }
    return NextResponse.json({ ok: false, error: "customerName inválido" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
