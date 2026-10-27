import { NextRequest, NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/auth/session';
import { runDeepSeekDiagnostic } from "@/lib/deepseek";
import { safeProviderErrorLabel } from "@/lib/ai-provider-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado" }, { status: 401 });
  }

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
        }).then(res => ({ model, ok: true, text: res.text, error: null }))
          .catch(err => ({ model, ok: false, error: safeProviderErrorLabel(err), text: null }))
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
      results.gemini = `Error fatal: ${safeProviderErrorLabel(e)}`;
    }
  } else {
    results.gemini = "No configurado";
  }

  const deepSeekDiagnostic = await runDeepSeekDiagnostic("No configurado");
  results.deepseek = deepSeekDiagnostic.startsWith("OK:") ? "OK" : deepSeekDiagnostic;

  return NextResponse.json({ ok: true, results });
}
