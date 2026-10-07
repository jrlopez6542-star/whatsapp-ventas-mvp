import { NextResponse } from 'next/server';

export const runtime = "nodejs";

export async function GET() {
  const results: any = {};
  
  // Test Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: "Responde únicamente con la palabra 'OK'",
      });
      results.gemini = response.text ? "OK" : "Empty response";
    } catch (e: any) {
      results.gemini = "Error: " + e.message;
    }
  } else {
    results.gemini = "Not configured";
  }

  // Test OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Responde únicamente con la palabra 'OK'" }],
        max_tokens: 5
      });
      results.openai = response.choices[0]?.message?.content ? "OK" : "Empty response";
    } catch (e: any) {
      results.openai = "Error: " + e.message;
    }
  } else {
    results.openai = "Not configured";
  }

  return NextResponse.json({ ok: true, results });
}
