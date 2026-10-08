import { NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: any = {};
  
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const candidateModels = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-exp-1206"];
      if (process.env.GEMINI_MODEL) candidateModels.unshift(process.env.GEMINI_MODEL.trim());
      
      let success = false;
      let lastErr = "";
      let successfulModel = "";

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: "Responde únicamente con la palabra 'OK'",
          });
          if (response.text) {
            success = true;
            successfulModel = model;
            break;
          }
        } catch (err: any) {
          lastErr = err.message;
          results[`model_${model}`] = err.message;
        }
      }

      if (success) {
        results.gemini = `OK (using ${successfulModel})`;
      } else {
        results.gemini = `Error: ${lastErr}`;
      }
    } catch (e: any) {
      results.gemini = "Error fatal: " + e.message;
    }
  } else {
    results.gemini = "Not configured";
  }

  return NextResponse.json({ ok: true, results });
}
