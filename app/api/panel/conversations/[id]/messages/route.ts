import { NextRequest, NextResponse } from "next/server";
import { appendMessage, getMessages, setConversationStatus, updateMessageDeliveryStatus } from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
  const messages = await getMessages(decodedId);
  return NextResponse.json({ ok: true, messages });
}

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
    const { body } = await request.json();
    if (!body || typeof body !== "string" || !body.trim()) {
      return NextResponse.json({ ok: false, error: "El cuerpo del mensaje no puede estar vacío" }, { status: 400 });
    }

    // Auto-takeover: al responder manualmente un humano, cambiar estado a 'human'
    await setConversationStatus(decodedId, "human");
    const savedMsg = await appendMessage(decodedId, "assistant", body.trim(), { deliveryStatus: "pending" });

    // Enviar mensaje saliente vía WhatsApp (Evolution o Twilio)
    const sendResult = await sendOutboundWhatsApp(decodedId, body.trim());

    if (sendResult.ok) {
      await updateMessageDeliveryStatus(savedMsg.id, "accepted", { providerMessageId: sendResult.id });
    } else {
      await updateMessageDeliveryStatus(savedMsg.id, "failed", { errorDetails: sendResult.error });
    }

    return NextResponse.json({
      ok: sendResult.ok,
      send: sendResult,
      messageId: savedMsg.id,
      error: sendResult.ok ? undefined : sendResult.error,
      mode: "human_manual",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
