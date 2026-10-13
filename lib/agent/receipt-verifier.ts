import { GoogleGenAI } from "@google/genai";

export interface ReceiptVerificationResult {
  isReceipt: boolean;
  bank?: string;
  amount?: number;
  reference?: string;
  date?: string;
  matchesExpected?: boolean;
  summary: string;
}

export async function verifyReceiptWithGemini(
  base64Data: string,
  mimeType = "image/jpeg",
  expectedAmount?: number
): Promise<ReceiptVerificationResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      isReceipt: false,
      summary: "API Key de Gemini no configurada",
    };
  }

  // Limpiar cualquier prefijo data:image/... si viene incluido
  const pureBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Analiza detalladamente esta imagen enviada por un cliente en Colombia.
Determina si es una captura de pantalla de un comprobante de pago o transferencia bancaria exitosa (por ejemplo: Nequi, Bancolombia, Bre-B, Daviplata, Dale, etc.).

${expectedAmount ? `El monto esperado a verificar es aproximadamente: $${expectedAmount} COP.` : ""}

Debes responder ÚNICAMENTE en formato JSON con la siguiente estructura:
{
  "isReceipt": true/false (true si es un comprobante de transferencia o pago exitoso legible),
  "bank": "Nombre del banco o billetera (ej: Nequi, Bre-B, Bancolombia, Daviplata)" o null,
  "amount": número entero en COP del monto transferido (ej: 32000) o null,
  "reference": "código o número de comprobante/aprobación" o null,
  "date": "fecha y hora del comprobante si es visible" o null,
  "summary": "Breve explicación en español de lo que se observó en la imagen"
}`;

    const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType || "image/jpeg",
                    data: pureBase64,
                  },
                },
              ],
            },
          ],
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const text = response.text?.trim() || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const matchesExpected =
            expectedAmount && parsed.amount
              ? Math.abs(parsed.amount - expectedAmount) <= 1000
              : undefined;

          return {
            isReceipt: Boolean(parsed.isReceipt),
            bank: parsed.bank || undefined,
            amount: parsed.amount ? Number(parsed.amount) : undefined,
            reference: parsed.reference || undefined,
            date: parsed.date || undefined,
            matchesExpected,
            summary: parsed.summary || "",
          };
        }
      } catch (err: any) {
        console.warn(`[receipt-verifier] Modelo ${model} falló:`, err?.message || err);
      }
    }
  } catch (err) {
    console.error("[receipt-verifier] Error general al verificar comprobante:", err);
  }

  return {
    isReceipt: false,
    summary: "No se pudo procesar la imagen con Gemini Visión.",
  };
}
