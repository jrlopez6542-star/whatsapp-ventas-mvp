import { NextRequest, NextResponse } from "next/server";
import { setConversationStatus, type ConversationStatus } from "@/lib/store";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
    const { status } = await request.json();
    if (status !== "bot" && status !== "human" && status !== "closed") {
      return NextResponse.json({ ok: false, error: "Estado no válido" }, { status: 400 });
    }

    await setConversationStatus(decodedId, status as ConversationStatus);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
