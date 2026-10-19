import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dispatchAudioTranscriptionResult,
  getAudioTranscriptionFailureReply,
  raceWithTimeout,
  transcribeWhatsAppAudio,
} from "../lib/agent/audio-transcriber";
import { handleSalesMessage } from "../lib/agent/sales-agent";
import { parseEvolutionUpsert } from "../lib/evolution";

const transcript = "Buenos días para un pedido de una cajita de buñuelos";

function makeSilentWavFixture(): Buffer {
  const sampleRate = 8000;
  const samples = 800;
  const dataBytes = samples * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

test("audio hablado local pasa por recepción y transcripción simulada hasta el agente de ventas", async () => {
  const spokenAudio = readFileSync("tests/fixtures/spoken-order.wav");
  assert.equal(spokenAudio.toString("ascii", 0, 4), "RIFF");
  assert.equal(spokenAudio.toString("ascii", 8, 12), "WAVE");
  assert.ok(spokenAudio.length > 1000, "El fixture debe contener voz sintética, no solo una cabecera WAV");

  const inbound = parseEvolutionUpsert({
    event: "messages.upsert",
    data: {
      key: { remoteJid: "573000000000@s.whatsapp.net", fromMe: false, id: "local-spoken-audio" },
      message: {
        audioMessage: {
          mimetype: "audio/wav",
          base64: spokenAudio.toString("base64"),
        },
      },
    },
  });
  assert.ok(inbound);
  assert.equal(inbound.mediaType, "audio");
  assert.ok(inbound.mediaBase64);
  assert.deepEqual(Buffer.from(inbound.mediaBase64, "base64"), spokenAudio);
  assert.ok(!process.env.GEMINI_API_KEY);
  assert.ok(!process.env.OPENAI_API_KEY);
  const noProviderConfigured = await transcribeWhatsAppAudio(inbound.mediaBase64!, inbound.mimeType || "audio/wav");
  assert.deepEqual(noProviderConfigured, { ok: false, reason: "provider_unavailable" });

  let receivedAudioBytes = 0;
  const mockedTranscriber = async (audioBase64: string) => {
    receivedAudioBytes = Buffer.from(audioBase64, "base64").length;
    return { ok: true as const, text: transcript };
  };
  const transcription = await mockedTranscriber(inbound.mediaBase64);
  let agentReply = "";
  let agentInput = "";
  const continued = await dispatchAudioTranscriptionResult(
    transcription,
    async (text) => {
      agentInput = text;
      const response = await handleSalesMessage(`whatsapp:local-audio-${randomUUID()}`, text, "Prueba local");
      agentReply = response.reply;
    },
    async () => assert.fail("Una transcripción simulada válida no debe activar la respuesta de error"),
  );

  assert.equal(continued, true);
  assert.equal(receivedAudioBytes, spokenAudio.length);
  assert.equal(agentInput, transcript);
  assert.ok(agentReply.length > 0);
  assert.doesNotMatch(agentReply, /no logramos escucharla con claridad/i);
});

test("nota de voz con transcripción válida continúa al agente con el texto transcrito", async () => {
  const mockPayload = {
    event: "messages.upsert",
    data: {
      key: { remoteJid: "573001234567@s.whatsapp.net", fromMe: false, id: "audio-regression-1" },
      message: {
        audioMessage: {
          mimetype: "audio/wav",
          // WAV PCM válido para probar la recepción sin servicios externos.
          base64: makeSilentWavFixture().toString("base64"),
        },
      },
    },
  };

  const inbound = parseEvolutionUpsert(mockPayload);
  assert.ok(inbound);
  assert.equal(inbound.mediaType, "audio");
  assert.equal(inbound.mimeType, "audio/wav");
  assert.ok(inbound.mediaBase64);

  let agentInput = "";
  let fallbackCalled = false;
  const continued = await dispatchAudioTranscriptionResult(
    { ok: true, text: transcript },
    async (text) => {
      // Simula el paso de currentText al agente, sin ejecutar ventas ni enviar mensajes.
      agentInput = text;
    },
    async () => {
      fallbackCalled = true;
    },
  );

  assert.equal(continued, true);
  assert.equal(agentInput, transcript);
  assert.equal(fallbackCalled, false);

  const webhook = readFileSync("app/api/webhooks/evolution/route.ts", "utf8");
  assert.match(webhook, /dispatchAudioTranscriptionResult\(\s*transcription/);
  assert.match(webhook, /currentText\s*=\s*transcript/);
  assert.match(webhook, /if \(!shouldContinue\)\s*\{\s*return;\s*\}/);
  assert.match(webhook, /handleSalesMessage\(fromKey, currentText, effectiveName\)/);
  assert.ok(webhook.indexOf("if (!shouldContinue)") < webhook.indexOf("handleSalesMessage(fromKey, currentText, effectiveName)"));
});

test("fallo técnico de transcripción usa ruta de error y no la clasifica como inaudible", async () => {
  let failureReason = "";
  const continued = await dispatchAudioTranscriptionResult(
    { ok: false, reason: "provider_unavailable" },
    async () => assert.fail("No debe pasar una transcripción inexistente al agente"),
    async (reason) => {
      failureReason = reason;
    },
  );

  assert.equal(continued, false);
  assert.equal(failureReason, "provider_unavailable");
  let inaudibleReason = "";
  const inaudibleContinued = await dispatchAudioTranscriptionResult(
    { ok: false, reason: "inaudible" },
    async () => assert.fail("Un audio inaudible no debe enviarse al agente"),
    async (reason) => { inaudibleReason = reason; },
  );
  assert.equal(inaudibleContinued, false);
  assert.equal(inaudibleReason, "inaudible");

  const webhook = readFileSync("app/api/webhooks/evolution/route.ts", "utf8");
  const transcriberSource = readFileSync("lib/agent/audio-transcriber.ts", "utf8");
  assert.match(webhook, /Transcripción exitosa", \{ characters: transcript\.length \}/);
  assert.doesNotMatch(webhook, /console\.log\("\[evolution\] Transcripción exitosa",\s*transcript/);  const debounceBlock = webhook.slice(
    webhook.indexOf("if (!isImage && !isAudio && DEBOUNCE_WINDOW_MS > 0)"),
    webhook.indexOf("} else if (isImage || isAudio)")
  );
  assert.match(debounceBlock, /console\.log\("\[evolution\] Ráfaga de mensajes agrupada:", currentText\)/);
  assert.match(transcriberSource, /Audio transcrito con éxito[\s\S]*?\{ characters: cleaned\.length \}/);
  assert.doesNotMatch(transcriberSource, /console\.log\([^\n]*(?:transcribeText|resultText|\$\{cleaned\})/);
});

test("validación de audio corrupto, texto en blanco y normalización de MIME en audio-transcriber", async () => {
  // 1. Audio vacío o corrupto
  const emptyRes = await transcribeWhatsAppAudio("", "audio/ogg");
  assert.deepEqual(emptyRes, { ok: false, reason: "invalid_audio" });

  const invalidBase64Res = await transcribeWhatsAppAudio("!!!no-es-base64-valido???", "audio/ogg");
  assert.deepEqual(invalidBase64Res, { ok: false, reason: "invalid_audio" });

  // 2. Transcripción con texto en blanco devuelto por el transcriptor
  let failureReason = "";
  const blankContinued = await dispatchAudioTranscriptionResult(
    { ok: true, text: "   \n\t  " },
    async () => assert.fail("Texto en blanco no debe continuar al agente"),
    async (reason) => {
      failureReason = reason;
    }
  );
  assert.equal(blankContinued, false);
  assert.equal(failureReason, "transcription_failed");

  // 3. Parseo de mensaje de voz real con MIME audio/ogg; codecs=opus
  const opusPayload = {
    event: "messages.upsert",
    data: {
      key: { remoteJid: "573109876543@s.whatsapp.net", fromMe: false, id: "ptt-opus-message" },
      messageType: "audioMessage",
      message: {
        audioMessage: {
          mimetype: "audio/ogg; codecs=opus",
          base64: Buffer.from("OggS-test-fake-audio").toString("base64"),
          ptt: true,
        },
      },
    },
  };
  const parsedOpus = parseEvolutionUpsert(opusPayload);
  assert.ok(parsedOpus);
  assert.equal(parsedOpus.isMedia, true);
  assert.equal(parsedOpus.mediaType, "audio");
  assert.equal(parsedOpus.mimeType, "audio/ogg; codecs=opus");
});

test("raceWithTimeout: resolución normal, rechazo de promesa, timeout de espera y limpieza de temporizadores", async () => {
  // 1. Resolución normal antes del timeout: retorna el valor y no deja timer pendiente
  const fastResult = await raceWithTimeout(Promise.resolve("éxito-rápido"), 100);
  assert.equal(fastResult, "éxito-rápido");

  // 2. Rechazo de la promesa original antes del timeout: propaga el error y limpia el timer
  await assert.rejects(
    async () => await raceWithTimeout(Promise.reject(new Error("Fallo de red simulado")), 100),
    { message: "Fallo de red simulado" }
  );

  // 3. Timeout vencido: rechaza con Error("Timeout") en el plazo estipulado
  const slowPromise = new Promise((resolve) => setTimeout(resolve, 200));
  await assert.rejects(
    async () => await raceWithTimeout(slowPromise, 30),
    { name: "Error", message: "Timeout" }
  );

  // 4. Verificación de limpieza del temporizador (clearTimeout)
  const originalClearTimeout = globalThis.clearTimeout;
  let clearedCount = 0;
  globalThis.clearTimeout = ((id: any) => {
    clearedCount++;
    return originalClearTimeout(id);
  }) as typeof clearTimeout;

  try {
    await raceWithTimeout(Promise.resolve("limpieza-ok"), 100);
    assert.ok(clearedCount > 0, "clearTimeout debe ser invocado al resolver la promesa para prevenir fugas");
  } finally {
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("cancelación local con AbortSignal.timeout: propagación de señal y verificación de configuración en proveedores", async () => {
  // 1. Verificación de propagación local de AbortSignal.timeout sin llamadas de red
  const timeoutSignal = AbortSignal.timeout(25);
  let taskAborted = false;

  const mockAbortableFetch = new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("datos-remotos"), 200);
    timeoutSignal.addEventListener("abort", () => {
      clearTimeout(timer);
      taskAborted = true;
      reject(new DOMException("The operation was aborted", "AbortError"));
    });
  });

  await assert.rejects(
    async () => await raceWithTimeout(mockAbortableFetch, 50),
    (err: any) => err.name === "AbortError"
  );
  assert.equal(timeoutSignal.aborted, true);
  assert.equal(taskAborted, true, "El trabajo local debe abortarse por la señal de tiempo");

  // 2. Comprobación estática de que los proveedores configuran AbortSignal.timeout client-side
  // NOTA: AbortSignal es una operación client-side en Node.js; no garantiza ni simula acuse de recibo en Google.
  const transcriberSource = readFileSync("lib/agent/audio-transcriber.ts", "utf8");
  assert.match(
    transcriberSource,
    /model:\s*"gemini-3\.5-transcribe"[\s\S]*?abortSignal:\s*AbortSignal\.timeout\(10000\)/,
    "gemini-3.5-transcribe debe incorporar abortSignal: AbortSignal.timeout(10000)"
  );
  assert.match(
    transcriberSource,
    /for\s*\(const model of candidateModels\)[\s\S]*?abortSignal:\s*AbortSignal\.timeout\(9000\)/,
    "Los modelos multimodales deben incorporar abortSignal: AbortSignal.timeout(9000)"
  );
  assert.match(
    transcriberSource,
    /fetch\("https:\/\/api\.openai\.com\/v1\/audio\/transcriptions"[\s\S]*?signal:\s*AbortSignal\.timeout\(15000\)/,
    "Whisper-1 debe incorporar signal: AbortSignal.timeout(15000)"
  );
});

test("mensajes reales de producción al cliente: contenido exacto para inaudible, provider_unavailable, transcription_failed e invalid_audio", async () => {
  // 1. inaudible: debe solicitar repetir el audio porque no se entendieron las palabras
  const inaudibleMsg = getAudioTranscriptionFailureReply("inaudible");
  assert.equal(
    inaudibleMsg,
    "¡Hola! Recibimos tu nota de voz 🎤 pero no logramos entender las palabras. ¿Podrías reenviarla o escribirnos tu pedido? ¡Con gusto te atendemos! 😊"
  );
  assert.match(inaudibleMsg, /no logramos entender las palabras/i);
  assert.doesNotMatch(inaudibleMsg, /inconveniente técnico/i);

  // 2. provider_unavailable: disculpa cortés por inconveniente técnico
  const providerUnavailableMsg = getAudioTranscriptionFailureReply("provider_unavailable");
  assert.equal(
    providerUnavailableMsg,
    "¡Hola! Tuvimos un inconveniente técnico al procesar tu nota de voz 🎤. ¿Podrías reenviarla o escribirnos tu pedido? ¡Con gusto te ayudamos! 😊"
  );
  assert.match(providerUnavailableMsg, /inconveniente técnico al procesar/i);
  assert.doesNotMatch(providerUnavailableMsg, /no logramos entender las palabras/i);

  // 3. transcription_failed: disculpa por inconveniente técnico
  const failedMsg = getAudioTranscriptionFailureReply("transcription_failed");
  assert.equal(
    failedMsg,
    "¡Hola! Tuvimos un inconveniente técnico al procesar tu nota de voz 🎤. ¿Podrías reenviarla o escribirnos tu pedido? ¡Con gusto te ayudamos! 😊"
  );
  assert.match(failedMsg, /inconveniente técnico al procesar/i);
  assert.doesNotMatch(failedMsg, /no logramos entender las palabras/i);

  // 4. invalid_audio: disculpa por inconveniente técnico (sin culpar al usuario de formato corrupto)
  const invalidAudioMsg = getAudioTranscriptionFailureReply("invalid_audio");
  assert.equal(
    invalidAudioMsg,
    "¡Hola! Tuvimos un inconveniente técnico al procesar tu nota de voz 🎤. ¿Podrías reenviarla o escribirnos tu pedido? ¡Con gusto te ayudamos! 😊"
  );
  assert.match(invalidAudioMsg, /inconveniente técnico al procesar/i);
  assert.doesNotMatch(invalidAudioMsg, /no logramos entender las palabras/i);

  // 5. Integración con el despachador: comprobar que dispatchAudioTranscriptionResult pasa el mensaje real al callback de fallo
  let capturedFailureReply = "";
  await dispatchAudioTranscriptionResult(
    { ok: false, reason: "inaudible" },
    async () => assert.fail("No debe llamar onTranscript"),
    async (reason) => {
      capturedFailureReply = getAudioTranscriptionFailureReply(reason);
    }
  );
  assert.equal(capturedFailureReply, inaudibleMsg);

  let capturedTechReply = "";
  await dispatchAudioTranscriptionResult(
    { ok: false, reason: "transcription_failed" },
    async () => assert.fail("No debe llamar onTranscript"),
    async (reason) => {
      capturedTechReply = getAudioTranscriptionFailureReply(reason);
    }
  );
  assert.equal(capturedTechReply, failedMsg);
});

