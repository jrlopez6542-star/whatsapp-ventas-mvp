import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { logSystemEvent } from "@/lib/logger";

const WHISPER_PROMPT =
  "Buñuelandia: Buñuelos de queso tradicionales, buñuelos rellenos de arequipe, bocadillo, nutella, mora. " +
  "Cajas surtidas de 4 (C4S) y 8 buñuelos (C8S), salsas, gaseosas Postobón, Colombiana, Manzana, Pepsi, Coca Cola, " +
  "Bre-B, Nequi, efectivo, domicilio en Tocancipá Cundinamarca, direcciones, conjuntos residenciales, torres, apartamentos, veredas, fincas.";

/**
 * Transcribe un archivo o nota de voz de WhatsApp enviado en Base64.
 * 1. Opción Primaria: Google Gemini Flash-Lite (@google/genai) activo y sin 503.
 * 2. Opción Whisper-1: OpenAI Whisper-1 vía REST si hay cuota disponible.
 */
export async function transcribeWhatsAppAudio(
  base64Audio: string,
  mimeType = "audio/ogg"
): Promise<AudioTranscriptionResult> {
  if (!base64Audio || typeof base64Audio !== "string") {
    return { ok: false, reason: "invalid_audio" };
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

  if (!pureBase64 || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(pureBase64) || pureBase64.length % 4 === 1) {
    return { ok: false, reason: "invalid_audio" };
  }

  const audioBuffer = Buffer.from(pureBase64, "base64");
  if (audioBuffer.length === 0) {
    console.warn("[audio-transcriber] Buffer de audio vacío tras decodificar Base64");
    return { ok: false, reason: "invalid_audio" };
  }

  logSystemEvent("info", "voice", `Nota de voz recibida (${audioBuffer.length} bytes, ${cleanMime})`);

  // 3. INTENTO CON GOOGLE GEMINI (@google/genai)
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  let providerAttempted = false;
  if (geminiKey) {
    providerAttempted = true;
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      // 3a. INTENTO ESPECIALIZADO: gemini-3.5-transcribe (Speech-to-Text nativo de Google)
      try {
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
            abortSignal: AbortSignal.timeout(10000),
          },
        });

        const transcribeRes = await raceWithTimeout(transcribePromise, 10000);
        const transcribeText = extractGeminiResponseText(transcribeRes);
        const lower = transcribeText.toLowerCase();

        if (transcribeText && !lower.includes("vacio") && !lower.includes("vacío")) {
          const cleaned = transcribeText.replace(/^["'«“]+|["'»”]+$/g, "").trim();
          console.log("[audio-transcriber] gemini-3.5-transcribe transcribió con éxito", { characters: cleaned.length });
          logSystemEvent("success", "voice", "Audio transcrito con éxito (gemini-3.5-transcribe)", { characters: cleaned.length });
          return { ok: true, text: cleaned };
        }
        if (lower === "vacio" || lower === "vacío") {
          logSystemEvent("warn", "voice", "Audio clasificado como silencio o inaudible");
          return { ok: false, reason: "inaudible" };
        }
      } catch (sttErr: any) {
        console.warn("[audio-transcriber] gemini-3.5-transcribe falló, pasando a modelos multimodales", { error: safeErrorName(sttErr) });
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
              abortSignal: AbortSignal.timeout(9000),
            },
          });

          const response = await raceWithTimeout(genPromise, 9000);
          const resultText = extractGeminiResponseText(response);
          const lower = resultText.toLowerCase();

          if (resultText && !lower.includes("vacio") && !lower.includes("vacío")) {
            const cleaned = resultText.replace(/^["'«“]+|["'»”]+$/g, "").trim();
            console.log(`[audio-transcriber] Gemini (${model}) transcribió con éxito`, { characters: cleaned.length });
            logSystemEvent("success", "voice", `Audio transcrito con éxito (${model})`, { characters: cleaned.length });
            return { ok: true, text: cleaned };
          }
          if (lower === "vacio" || lower === "vacío") {
            logSystemEvent("warn", "voice", `Audio inaudible o silencio (${model})`);
            return { ok: false, reason: "inaudible" };
          }
        } catch (modelErr: any) {
          console.warn(`[audio-transcriber] Gemini modelo ${model} falló para audio`, { error: safeErrorName(modelErr) });
        }
      }
    } catch (geminiErr) {
      console.warn("[audio-transcriber] Error conectando con Gemini para audio", { error: safeErrorName(geminiErr) });
    }
  }

  // 4. FALLBACK CON OPENAI WHISPER-1 (Si tiene créditos disponibles)
  if (openaiKey) {
    providerAttempted = true;
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
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        const text = data?.text?.trim();
        if (text) {
          const cleaned = text.replace(/^["'«“]+|["'»”]+$/g, "").trim();
          console.log("[audio-transcriber] Whisper-1 transcribió con éxito", { characters: cleaned.length });
          logSystemEvent("success", "voice", "Audio transcrito con éxito (Whisper-1)", { characters: cleaned.length });
          return { ok: true, text: cleaned };
        }
        if (res.ok) {
          logSystemEvent("warn", "voice", "Whisper respondió sin transcripción");
          return { ok: false, reason: "inaudible" };
        }
      } else {
        console.warn(`[audio-transcriber] Whisper devolvió HTTP ${res.status}`);
        logSystemEvent("warn", "voice", `Whisper devolvió HTTP ${res.status}`);
      }
    } catch (whisperErr: any) {
      console.warn("[audio-transcriber] Error en llamada REST a Whisper", { error: safeErrorName(whisperErr) });
    }
  }

  logSystemEvent("warn", "voice", "No se pudo transcribir la nota de voz");
  return {
    ok: false,
    reason: providerAttempted ? "transcription_failed" : "provider_unavailable",
  };
}

export type AudioTranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; reason: "invalid_audio" | "inaudible" | "provider_unavailable" | "transcription_failed" };

export type AudioTranscriptionFailure = Extract<AudioTranscriptionResult, { ok: false }>["reason"];

export async function dispatchAudioTranscriptionResult(
  result: AudioTranscriptionResult,
  onTranscript: (text: string) => Promise<void>,
  onFailure: (reason: AudioTranscriptionFailure) => Promise<void>
): Promise<boolean> {
  if (!result.ok) {
    await onFailure(result.reason);
    return false;
  }

  const text = result.text.trim();
  if (!text) {
    await onFailure("transcription_failed");
    return false;
  }

  await onTranscript(text);
  return true;
}

/**
 * Mensaje oficial para el cliente según el motivo del fallo de transcripción de audio.
 */
export function getAudioTranscriptionFailureReply(reason: AudioTranscriptionFailure): string {
  return reason === "inaudible"
    ? "¡Hola! Recibimos tu nota de voz 🎤 pero no logramos entender las palabras. ¿Podrías reenviarla o escribirnos tu pedido? ¡Con gusto te atendemos! 😊"
    : "¡Hola! Tuvimos un inconveniente técnico al procesar tu nota de voz 🎤. ¿Podrías reenviarla o escribirnos tu pedido? ¡Con gusto te ayudamos! 😊";
}

function safeErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name.slice(0, 40);
  }
  return "ProviderError";
}

export function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Extrae de forma segura el texto de una respuesta de Gemini:
 * 1. Lee response.text directo (modelos generativos y multimodales estándar).
 * 2. Si está vacío o ausente, recorre candidates[0].content.parts buscando
 *    part.text o part.audioTranscription.text (STT nativo / gemini-3.5-transcribe).
 */
export function extractGeminiResponseText(response?: GenerateContentResponse | null): string {
  const directText = response?.text?.trim();
  if (directText) return directText;

  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const textSegments: string[] = [];
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.trim()) {
        textSegments.push(part.text.trim());
      } else if (typeof part.audioTranscription?.text === "string" && part.audioTranscription.text.trim()) {
        textSegments.push(part.audioTranscription.text.trim());
      }
    }
    if (textSegments.length > 0) {
      return textSegments.join(" ").trim();
    }
  }

  return "";
}
