/**
 * scripts/probe-audio-transcription.ts
 *
 * Procedimiento de prueba 100% aislado y de solo lectura para transcripción de audio.
 *
 * GARANTÍAS DE SEGURIDAD:
 * 1. Cero imports transitivos de negocio: No importa logger, store, db, evolution ni contabilidad.
 * 2. Cero WhatsApp / Evolution / Turso / Contabilidad: Variables de integración borradas del proceso.
 * 3. Exactamente UNA (1) sola llamada de red: Sin reintentos, sin bucles de fallback.
 * 4. Solo lee tests/fixtures/spoken-order.wav.
 * 5. Credencial en memoria volátil: No imprime la clave, no modifica .env ni guarda archivos.
 *
 * NO EJECUTAR SIN AUTORIZACIÓN EXPLÍCITA DEL USUARIO.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// 1. Blindaje contra cualquier integración externa
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.TURSO_DATABASE_URL_PREVIEW;
delete process.env.TURSO_AUTH_TOKEN_PREVIEW;
delete process.env.EVOLUTION_API_URL;
delete process.env.EVOLUTION_API_KEY;
delete process.env.EVOLUTION_INSTANCE;
delete process.env.CONTABILIDAD_API_URL;
delete process.env.BOT_INVOICE_SECRET;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

const WHISPER_PROMPT =
  "Buñuelandia: Buñuelos de queso tradicionales, buñuelos rellenos de arequipe, bocadillo, nutella, mora. " +
  "Cajas surtidas de 4 (C4S) y 8 buñuelos (C8S), salsas, gaseosas Postobón, Colombiana, Manzana, Pepsi, Coca Cola, " +
  "Bre-B, Nequi, efectivo, domicilio en Tocancipá Cundinamarca, direcciones, conjuntos residenciales, torres, apartamentos, veredas, fincas.";

const GEMINI_PROMPT =
  "Transcribe con total exactitud y de forma literal este audio en español de un cliente en Colombia haciendo un pedido en Buñuelandia. " +
  "Devuelve ÚNICAMENTE la transcripción literal de las palabras dichas por el cliente en español, sin comillas, sin introducciones, sin interpretaciones ni comentarios. " +
  "Si el audio es completamente inaudible o silencio, responde exactamente: VACIO";

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!geminiKey && !openaiKey) {
    console.error("❌ Faltan credenciales: configure GEMINI_API_KEY o OPENAI_API_KEY en la sesión.");
    console.log("Uso seguro:");
    console.log("  $env:GEMINI_API_KEY=\"...\"; npx tsx scripts/probe-audio-transcription.ts");
    process.exit(1);
  }

  const fixturePath = resolve("tests/fixtures/spoken-order.wav");
  const audioBuffer = readFileSync(fixturePath);
  const base64Audio = audioBuffer.toString("base64");

  // Proveedor y modelo seleccionados (exactamente 1 llamada, sin fallbacks)
  const provider = geminiKey ? "gemini" : "openai";
  const targetModel = provider === "gemini"
    ? (process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash")
    : "whisper-1";

  console.log("=================================================");
  console.log("PRUEBA AISLADA DE TRANSCRIPCIÓN (UNA SOLA LLAMADA)");
  console.log("=================================================");
  console.log(`Archivo: ${fixturePath}`);
  console.log(`Tamaño: ${audioBuffer.length} bytes (~${(audioBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`Proveedor: ${provider === "gemini" ? "Google Gemini" : "OpenAI Whisper"}`);
  console.log(`Modelo exacto: ${targetModel}`);
  console.log(`Llamadas máximas permitidas: 1 (fallbacks desactivados)`);
  console.log("Iniciando llamada...");

  let callsMade = 0;
  const startTime = Date.now();

  try {
    let transcriptText = "";

    if (provider === "gemini") {
      callsMade++;
      if (callsMade > 1) throw new Error("Violación de seguridad: más de una llamada detectada");

      const ai = new GoogleGenAI({ apiKey: geminiKey! });

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: [
          {
            role: "user",
            parts: [
              { text: GEMINI_PROMPT },
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: base64Audio,
                },
              },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          abortSignal: AbortSignal.timeout(25000),
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });
      transcriptText = response.text?.trim() || "";
    } else {
      callsMade++;
      if (callsMade > 1) throw new Error("Violación de seguridad: más de una llamada detectada");

      const uint8 = new Uint8Array(audioBuffer);
      const audioBlob = new Blob([uint8], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model", targetModel);
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

      if (!res.ok) {
        throw new Error(`OpenAI Whisper respondió HTTP ${res.status}`);
      }
      const data = (await res.json()) as { text?: string };
      transcriptText = data?.text?.trim() || "";
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`Tiempo de respuesta: ${elapsedMs} ms`);
    console.log(`Llamadas efectuadas: ${callsMade}`);

    if (transcriptText && !transcriptText.toLowerCase().includes("vacio")) {
      const cleaned = transcriptText.replace(/^["'«“]+|["'»”]+$/g, "").trim();
      console.log("✅ Transcripción exitosa:");
      console.log(`   Texto: "${cleaned}"`);
      console.log(`   Longitud: ${cleaned.length} caracteres`);
    } else {
      console.log("⚠️ El proveedor clasificó el audio como inaudible o vacío.");
    }
  } catch (err: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(`❌ Fallo en la llamada (${elapsedMs} ms):`, err?.name || "Error", err?.message ? `(${err.message.slice(0, 100)})` : "");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error no controlado:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
