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

    const candidateModels = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-flash-latest"];

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
    console.error("[receipt-verifier] Error con Gemini Visión:", err);
  }

  // Fallback con OpenAI GPT-4o-mini Visión si Gemini falló
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiKey });
      const prompt = `Analiza detalladamente esta imagen de un comprobante de pago en Colombia. Determina si es un pago exitoso (Nequi, Bre-B, Bancolombia, Daviplata).
${expectedAmount ? `Monto esperado: $${expectedAmount} COP.` : ""}
Responde estrictamente en JSON:
{"isReceipt": true/false, "bank": string|null, "amount": number|null, "reference": string|null, "date": string|null, "summary": string}`;

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/jpeg"};base64,${pureBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
      });

      const content = res.choices[0]?.message?.content || "";
      const parsed = JSON.parse(content);
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
    } catch (openAiErr) {
      console.warn("[receipt-verifier] OpenAI Visión fallback falló:", openAiErr);
    }
  }

  return {
    isReceipt: false,
    summary: "No se pudo procesar la imagen del comprobante.",
  };
}
