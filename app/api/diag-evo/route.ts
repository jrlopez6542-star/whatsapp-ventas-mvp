import { NextResponse } from "next/server";
import { resolveEvolutionSendNumber } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("target") || "573009998877";

  const base = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();

  if (!base || !apiKey || !instance) {
    return NextResponse.json({ error: "Missing config" }, { status: 500 });
  }

  const results: Record<string, unknown> = {};

  // Test 1: sendPresence with plain digits
  try {
    const res1 = await fetch(`${base}/chat/sendPresence/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: target.replace(/\D/g, ""), presence: "composing", delay: 3000 }),
    });
    results.presenceDigits = { status: res1.status, body: await res1.json().catch(() => res1.statusText) };
  } catch (e: any) {
    results.presenceDigits = { error: e.message };
  }

  // Test 2: sendPresence with @s.whatsapp.net
  try {
    const jid = `${target.replace(/\D/g, "")}@s.whatsapp.net`;
    const res2 = await fetch(`${base}/chat/sendPresence/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: jid, presence: "composing", delay: 3000 }),
    });
    results.presenceJid = { status: res2.status, body: await res2.json().catch(() => res2.statusText) };
  } catch (e: any) {
    results.presenceJid = { error: e.message };
  }

  // Test 3: markMessageAsRead
  try {
    const res3 = await fetch(`${base}/chat/markMessageAsRead/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        readMessages: [{ remoteJid: `${target.replace(/\D/g, "")}@s.whatsapp.net`, fromMe: false, id: "test-fake-id" }],
      }),
    });
    results.markRead = { status: res3.status, body: await res3.json().catch(() => res3.statusText) };
  } catch (e: any) {
    results.markRead = { error: e.message };
  }

  return NextResponse.json({ ok: true, results });
}
