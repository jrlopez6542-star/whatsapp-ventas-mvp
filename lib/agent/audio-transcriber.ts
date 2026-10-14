import { GoogleGenAI } from "@google/genai";
import { logSystemEvent } from "@/lib/logger";

const WHISPER_PROMPT =
  "Buñuelandia: Buñuelos de queso tradicionales, buñuelos rellenos de arequipe, bocadillo, nutella, mora. " +
  "Cajas surtidas de 4 (C4S) y 8 buñuelos (C8S), salsas, gaseosas Postobón, Colombiana, Manzana, Pepsi, Coca Cola, " +
  "Bre-B, Nequi, efectivo, domicilio en Neiva Huila, direcciones, conjuntos residenciales, torres, apartamentos, veredas, fincas.";

/**
 * Transcribe un archivo o nota de voz de WhatsApp enviado en Base64.
 * 1. Opción Primaria: Google Gemini Flash-Lite (@google/genai) activo y sin 503.
 * 2. Opción Whisper-1: OpenAI Whisper-1 vía REST si hay cuota disponible.
 */
export async function transcribeWhatsAppAudio(
  base64Audio: string,
  mimeType = "audio/ogg"
): Promise<string | null> {
  if (!base64Audio || typeof base64Audio !== "string") {
    return null;
  }

  // 1. Extraer MIME type real si viene embebido en data URI
  let cleanMime = "audio/ogg";
  if (base64Audio.startsWith("data:")) {
    const match = base64Audio.match(/^data:([^;,]+)/i);
    if (match && match[1] && match[1].toLowerCase().startsWith("audio/")) {
      cleanMime = match[1].trim().toLowerCase();
    }
  } else if (mimeType && mimeType.toLowerCase().startsWith("audio/")) {
    cleanMime = mimeType.split(";")[0].trim().toLowerCase();
  }

  // 2. Extraer Base64 puro eliminando cualquier prefijo data:audio/...;base64,
  const pureBase64 = (
    base64Audio.includes(",") ? base64Audio.split(",")[1] : base64Audio
  )
    .replace(/\s+/g, "")
    .trim();

  if (!pureBase64) return null;

  const audioBuffer = Buffer.from(pureBase64, "base64");
  if (audioBuffer.length === 0) {
    console.warn("[audio-transcriber] Buffer de audio vacío tras decodificar Base64");
    return null;
  }

  logSystemEvent("info", "voice", `Nota de voz recibida (${audioBuffer.length} bytes, ${cleanMime})`);

  // 3. INTENTO CON GOOGLE GEMINI (@google/genai)
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      // 3a. INTENTO ESPECIALIZADO: gemini-3.5-transcribe (Speech-to-Text nativo de Google)
      try {
        const timeoutTranscribe = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 10000)
        );
        const transcribePromise = ai.models.generateContent({
          model: "gemini-3.5-transcribe",
          contents: [
            {
              role: "user",
              parts: [
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
            audioTranscriptionConfig: {
              mode: "SMART" as any,
            },
          },
        });

        const transcribeRes = await Promise.race([transcribePromise, timeoutTranscribe]);
        const transcribeText = transcribeRes.text?.trim() || "";
        const lower = transcribeText.toLowerCase();

        if (transcribeText && !lower.includes("vacio") && !lower.includes("vacío")) {
          const cleaned = transcribeText.replace(/^["'«“]+|["'»”]+$/g, "").trim();
          console.log("[audio-transcriber] gemini-3.5-transcribe transcribió con éxito:", cleaned);
          logSystemEvent("success", "voice", `Audio transcrito con éxito (gemini-3.5-transcribe): "${cleaned}"`);
          return cleaned;
        }
      } catch (sttErr: any) {
        console.warn("[audio-transcriber] gemini-3.5-transcribe falló, pasando a modelos multimodales:", sttErr?.message || sttErr);
      }

      // 3b. INTENTO MULTIMODAL CON PROMPT (gemini-flash-lite-latest, gemini-3.5-flash-lite, gemini-3.8-flash, gemini-flash-latest)
      const prompt =
        "Transcribe con total exactitud este audio de un cliente en Colombia haciendo un pedido en Buñuelandia. " +
        "Devuelve ÚNICAMENTE las palabras dichas por el cliente en español, sin comillas, sin introducciones ni comentarios. " +
        "Si el audio es completamente inaudible o silencio, responde exactamente: VACIO";

      const candidateModels = [
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "gemini-flash-latest",
      ];

      for (const model of candidateModels) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 9000)
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
            logSystemEvent("success", "voice", `Audio transcrito con éxito (${model}): "${cleaned}"`);
            return cleaned;
          }
          if (lower === "vacio" || lower === "vacío") {
            logSystemEvent("warn", "voice", `Audio inaudible o silencio (${model})`);
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

  // 4. FALLBACK CON OPENAI WHISPER-1 (Si tiene créditos disponibles)
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const ext =
        cleanMime.includes("mp4") || cleanMime.includes("m4a")
          ? "m4a"
          : cleanMime.includes("mp3")
          ? "mp3"
          : cleanMime.includes("wav")
          ? "wav"
          : "ogg";

      const uint8 = new Uint8Array(audioBuffer);
      const audioBlob = new Blob([uint8], { type: cleanMime });

      const formData = new FormData();
      formData.append("file", audioBlob, `audio.${ext}`);
      formData.append("model", "whisper-1");
      formData.append("language", "es");
      formData.append("prompt", WHISPER_PROMPT);
      formData.append("temperature", "0");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        const text = data?.text?.trim();
        if (text) {
          const cleaned = text.replace(/^["'«“]+|["'»”]+$/g, "").trim();
          console.log("[audio-transcriber] Whisper-1 transcribió con éxito:", cleaned);
          logSystemEvent("success", "voice", `Audio transcrito con éxito (Whisper-1): "${cleaned}"`);
          return cleaned;
        }
      } else {
        const errText = await res.text().catch(() => "");
        console.warn(`[audio-transcriber] Whisper HTTP ${res.status}:`, errText);
        logSystemEvent("warn", "voice", `Whisper HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
    } catch (whisperErr: any) {
      console.warn("[audio-transcriber] Error en llamada REST a Whisper:", whisperErr?.message || whisperErr);
    }
  }

  logSystemEvent("warn", "voice", "No se pudo transcribir la nota de voz");
  return null;
}
