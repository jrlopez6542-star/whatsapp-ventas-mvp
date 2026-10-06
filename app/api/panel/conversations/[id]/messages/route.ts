import { NextRequest, NextResponse } from "next/server";
import { appendMessage, getMessages, setConversationStatus } from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const messages = await getMessages(decodedId);
  return NextResponse.json({ ok: true, messages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const { body } = await request.json();
    if (!body || typeof body !== "string" || !body.trim()) {
      return NextResponse.json({ ok: false, error: "El cuerpo del mensaje no puede estar vacío" }, { status: 400 });
    }

    // Auto-takeover: al responder manualmente un humano, cambiar estado a 'human'
    await setConversationStatus(decodedId, "human");
    await appendMessage(decodedId, "assistant", body.trim());

    // Enviar mensaje saliente vía WhatsApp (Evolution o Twilio)
    const sendResult = await sendOutboundWhatsApp(decodedId, body.trim());

    return NextResponse.json({
      ok: true,
      send: sendResult,
      mode: "human_manual",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
