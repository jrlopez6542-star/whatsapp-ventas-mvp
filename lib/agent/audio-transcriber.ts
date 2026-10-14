import { GoogleGenAI } from "@google/genai";

const WHISPER_PROMPT =
  "Buñuelandia: Buñuelos de queso tradicionales, buñuelos rellenos de arequipe, bocadillo, nutella, mora. " +
  "Cajas surtidas de 4 (C4S) y 8 buñuelos (C8S), salsas, gaseosas Postobón, Colombiana, Manzana, Pepsi, Coca Cola, " +
  "Bre-B, Nequi, efectivo, domicilio en Neiva Huila, direcciones, conjuntos residenciales, torres, apartamentos, veredas, fincas.";

/**
 * Transcribe un archivo o nota de voz de WhatsApp enviado en Base64.
 * 1. Opción Primaria: OpenAI Whisper-1 (alta fidelidad en acento colombiano, jerga de buñuelos y velocidad <700ms).
 * 2. Opción Fallback: Google Gemini Multimodal (@google/genai con gemini-3.5-transcribe / gemini-flash-latest).
 */
export async function transcribeWhatsAppAudio(
  base64Audio: string,
  mimeType = "audio/ogg"
): Promise<string | null> {
  if (!base64Audio || typeof base64Audio !== "string") {
    return null;
  }

  const pureBase64 = base64Audio.replace(/^data:[^;]+;base64,/, "").trim();
  if (!pureBase64) return null;

  const cleanMime = mimeType.split(";")[0].trim() || "audio/ogg";

  // 1. PRIORIDAD: OPENAI WHISPER-1 (El estándar de oro para reconocimiento de voz en español)
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const { OpenAI, toFile } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiKey });
      const buffer = Buffer.from(pureBase64, "base64");
      const ext =
        cleanMime.includes("mp4") || cleanMime.includes("m4a")
          ? "m4a"
          : cleanMime.includes("mp3")
          ? "mp3"
          : cleanMime.includes("wav")
          ? "wav"
          : "ogg";
      const file = await toFile(buffer, `audio.${ext}`, { type: cleanMime });

      const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        language: "es",
        prompt: WHISPER_PROMPT,
        temperature: 0.0,
        file,
      });

      const whisperText = transcription.text?.trim();
      if (whisperText) {
        // Limpiar comillas extras si las hay
        const cleaned = whisperText.replace(/^["'«“]+|["'»”]+$/g, "").trim();
        console.log("[audio-transcriber] Whisper-1 transcribió con éxito:", cleaned);
        return cleaned;
      }
    } catch (whisperErr: any) {
      console.warn("[audio-transcriber] Whisper falló al transcribir; pasando a Gemini fallback:", whisperErr?.message || whisperErr);
    }
  }

  // 2. FALLBACK: GEMINI MULTIMODAL (@google/genai)
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const prompt =
        "Transcribe con total exactitud este audio de un cliente en Colombia haciendo un pedido en Buñuelandia. " +
        "Devuelve ÚNICAMENTE las palabras dichas por el cliente, sin comillas, sin introducciones ni comentarios. " +
        "Si el audio es completamente inaudible o silencio, responde exactamente: VACIO";

      // Modelos válidos y activos en el API
      const candidateModels = [
        "gemini-3.5-transcribe",
        "gemini-flash-latest",
        "gemini-3.5-flash",
      ];

      for (const model of candidateModels) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 6000)
          );

          const genPromise = ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: pureBase64,
                    },
                  },
                ],
              },
            ],
            config: {
              temperature: 0.1,
            },
          });

          const response = await Promise.race([genPromise, timeoutPromise]);
          const resultText = response.text?.trim() || "";
          const lower = resultText.toLowerCase();

          if (resultText && !lower.includes("vacio") && !lower.includes("vacío")) {
            const cleaned = resultText.replace(/^["'«“]+|["'»”]+$/g, "").trim();
            console.log(`[audio-transcriber] Gemini (${model}) transcribió con éxito:`, cleaned);
            return cleaned;
          }
          if (lower === "vacio" || lower === "vacío") {
            return null;
          }
        } catch (modelErr: any) {
          console.warn(`[audio-transcriber] Gemini modelo ${model} falló para audio:`, modelErr?.message || modelErr);
        }
      }
    } catch (geminiErr) {
      console.warn("[audio-transcriber] Error conectando con Gemini para audio:", geminiErr);
    }
  }

  return null;
}
