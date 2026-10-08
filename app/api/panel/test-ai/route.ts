import { NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: any = {};
  
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const candidateModels = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
      if (process.env.GEMINI_MODEL) candidateModels.unshift(process.env.GEMINI_MODEL.trim());
      
      const promises = candidateModels.map(model => 
        ai.models.generateContent({
          model,
          contents: "Responde únicamente con la palabra 'OK'",
        }).then(res => ({ model, ok: true, text: res.text }))
          .catch(err => ({ model, ok: false, error: err.message }))
      );
      
      const outcomes = await Promise.all(promises);
      const success = outcomes.find(o => o.ok);
      
      if (success) {
        results.gemini = `OK (usando ${success.model})`;
      } else {
        results.gemini = `Error: ${outcomes[0].error}`;
      }
      
      results.debug = outcomes;
    } catch (e: any) {
      results.gemini = "Error fatal: " + e.message;
    }
  } else {
    results.gemini = "No configurado";
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
      if (response.choices[0].message.content) {
        results.openai = "OK";
      } else {
        results.openai = "Error desconocido";
      }
    } catch (e: any) {
      results.openai = "Error: " + e.message;
    }
  } else {
    results.openai = "No configurado";
  }

  return NextResponse.json({ ok: true, results });
}
