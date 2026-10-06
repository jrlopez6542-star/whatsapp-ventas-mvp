import { NextResponse } from "next/server";
import { isEvolutionConfigured } from "@/lib/evolution";
import { isTwilioSendConfigured } from "@/lib/twilio";
import { isTursoConfigured } from "@/lib/store/db";
import { getWhatsAppChannel } from "@/lib/whatsapp-send";

export const runtime = "nodejs";

export async function GET() {
  const evolution = isEvolutionConfigured();
  const twilio = isTwilioSendConfigured();
  const turso = isTursoConfigured();
  const channel = getWhatsAppChannel();

  return NextResponse.json(
    {
      ok: true,
      channel,
      evolutionConfigured: evolution,
      twilioSendConfigured: twilio,
      tursoConfigured: turso,
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
