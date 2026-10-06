import { NextRequest, NextResponse } from "next/server";
import { twimlEmpty, twimlMessage, validateTwilioSignature } from "@/lib/twilio";
import { claimWebhookEvent } from "@/lib/webhook-dedupe";
import { handleSalesMessage } from "@/lib/agent/sales-agent";
import {
  appendMessage,
  getOrCreateConversation,
  setConversationStatus,
} from "@/lib/store";

export const runtime = "nodejs";

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET() {
  return new NextResponse("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (authToken) {
    const signature = request.headers.get("x-twilio-signature");
    const valid = validateTwilioSignature(
      authToken,
      signature,
      request.url,
      params
    );
    if (!valid) {
      console.warn("[twilio] firma inválida");
      return xmlResponse(twimlEmpty(), 403);
    }
  }

  const from = params.From || "";
  const body = (params.Body || "").trim();
  const messageSid = params.MessageSid || "";

  if (!from || !body) {
    return xmlResponse(twimlEmpty(), 200);
  }

  if (messageSid) {
    const claimed = await claimWebhookEvent(messageSid);
    if (!claimed) {
      console.log("[twilio] mensaje duplicado omitido", messageSid);
      return xmlResponse(twimlEmpty(), 200);
    }
  }

  const conv = await getOrCreateConversation(from);

  if (conv.status === "human") {
    await appendMessage(from, "user", body);
    console.log("[twilio] modo humano activo — omitir respuesta bot", from);
    return xmlResponse(twimlEmpty(), 200);
  }

  if (conv.status === "closed") {
    await setConversationStatus(from, "bot");
  }

  const { reply } = await handleSalesMessage(from, body);

  return xmlResponse(twimlMessage(reply), 200);
}
