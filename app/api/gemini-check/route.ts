import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from "@/lib/auth/session";
import { runDeepSeekDiagnostic } from "@/lib/deepseek";
import { safeProviderErrorLabel } from "@/lib/ai-provider-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("panel_session")?.value;
  const isDev = process.env.NODE_ENV !== "production";
  const user = token ? await validateSession(token) : null;

  if (!isDev && !user) {
    return NextResponse.json(
      { ok: false, error: "No autorizado. Inicie sesión en el panel." },
      { status: 401 }
    );
  }

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
          lastErr = safeProviderErrorLabel(err);
          results[`model_${model}`] = lastErr;
        }
      }

      if (success) {
        results.gemini = `OK (usando ${successfulModel})`;
      } else {
        results.gemini = `Error: ${lastErr}`;
      }
    } catch (e: any) {
      results.gemini = `Error fatal: ${safeProviderErrorLabel(e)}`;
    }
  } else {
    results.gemini = "Not configured";
  }

  results.deepseek = await runDeepSeekDiagnostic("Not configured");

  return NextResponse.json({ ok: true, results });
}
