import { GoogleGenAI } from "@google/genai";

/**
 * Transcribe un archivo o nota de voz de WhatsApp enviado en Base64.
 * 1. Opción Primaria: Google Gemini Multimodal (@google/genai).
 * 2. Opción Fallback: OpenAI Whisper-1 (si Gemini no está disponible o falla).
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

  // 1. INTENTO CON GEMINI MULTIMODAL
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const prompt =
        "Transcribe exactamente este audio de un cliente en Colombia haciendo un pedido en Buñuelandia. Devuelve ÚNICAMENTE el texto transcrito, sin comillas ni explicaciones adicionales. Si el audio es inaudible o solo ruido, responde exactamente vacio.";

      const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

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

          const resultText = response.text?.trim() || "";
          if (resultText && !resultText.toLowerCase().includes("vacio") && !resultText.toLowerCase().includes("vacío")) {
            console.log(`[audio-transcriber] Gemini (${model}) transcribió con éxito:`, resultText);
            return resultText;
          }
          if (resultText.toLowerCase() === "vacio" || resultText.toLowerCase() === "vacío") {
            return null; // Audio inaudible según la instrucción
          }
        } catch (modelErr: any) {
          console.warn(`[audio-transcriber] Gemini modelo ${model} falló para audio:`, modelErr?.message || modelErr);
        }
      }
    } catch (geminiErr) {
      console.warn("[audio-transcriber] Error conectando con Gemini para audio:", geminiErr);
    }
  }

  // 2. FALLBACK CON OPENAI WHISPER-1
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const { OpenAI, toFile } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiKey });
      const buffer = Buffer.from(pureBase64, "base64");
      const ext = cleanMime.includes("mp4") || cleanMime.includes("m4a") ? "m4a" : cleanMime.includes("mp3") ? "mp3" : "ogg";
      const file = await toFile(buffer, `audio.${ext}`, { type: cleanMime });

      const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        language: "es",
        file,
      });

      const whisperText = transcription.text?.trim();
      if (whisperText) {
        console.log("[audio-transcriber] Whisper transcribió con éxito:", whisperText);
        return whisperText;
      }
    } catch (whisperErr: any) {
      console.warn("[audio-transcriber] Whisper falló al transcribir:", whisperErr?.message || whisperErr);
    }
  }

  return null;
}
