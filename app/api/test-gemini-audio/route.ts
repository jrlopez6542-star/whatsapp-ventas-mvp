import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) return NextResponse.json({ error: "no_key" });

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const models = [
    "gemini-3.8-flash",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-omni-1.1-flash",
  ];

  const results: Record<string, string> = {};

  for (const model of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: "Di solamente la palabra 'LISTO'",
      });
      results[model] = res.text?.trim() || "OK";
    } catch (err: any) {
      results[model] = err?.message || String(err);
    }
  }

  return NextResponse.json({ results });
}
