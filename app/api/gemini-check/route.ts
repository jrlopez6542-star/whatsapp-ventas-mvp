import { NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: any = {};
  
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const candidateModels = [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
        "gemini-3.5-flash",
        "gemini-3.8-flash",
      ];
      if (process.env.GEMINI_MODEL) candidateModels.unshift(process.env.GEMINI_MODEL.trim());
      
      const uniqueModels = Array.from(new Set(candidateModels));
      let success = false;
      let lastErr = "";
      let successfulModel = "";

      for (const model of uniqueModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: "Responde únicamente con la palabra 'OK'",
          });
          if (response.text) {
            success = true;
            successfulModel = model;
            results[`model_${model}`] = `OK: ${response.text.trim()}`;
            break;
          }
        } catch (err: any) {
          lastErr = err.message;
          results[`model_${model}`] = err.message;
        }
      }

      if (success) {
        results.gemini = `OK (usando ${successfulModel})`;
      } else {
        results.gemini = `Error: ${lastErr}`;
      }
    } catch (e: any) {
      results.gemini = "Error fatal: " + e.message;
    }
  } else {
    results.gemini = "Not configured";
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: "Responde únicamente con la palabra 'OK'" }],
        max_tokens: 10,
      });
      results.openai = `OK: ${response.choices[0]?.message?.content?.trim()}`;
    } catch (err: any) {
      results.openai = `Error: ${err.message}`;
    }
  } else {
    results.openai = "Not configured";
  }

  return NextResponse.json({ ok: true, results });
}
