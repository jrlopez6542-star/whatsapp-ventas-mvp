import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result: any = { gemini: null, openai: null };

  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const modelsList: string[] = [];
      const list = await ai.models.list();
      for await (const m of list) {
        modelsList.push(m.name || "unknown");
      }
      result.gemini = { ok: true, count: modelsList.length, models: modelsList.slice(0, 30) };
    } catch (err: any) {
      result.gemini = { ok: false, error: err?.message || String(err) };
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const list = await openai.models.list();
      result.openai = { ok: true, count: list.data.length, hasWhisper: list.data.some((m) => m.id.includes("whisper")) };
    } catch (err: any) {
      result.openai = { ok: false, error: err?.message || String(err) };
    }
  }

  return NextResponse.json(result);
}
