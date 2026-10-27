import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  createDeepSeekChatCompletion,
  DeepSeekRequestError,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  runDeepSeekDiagnostic,
} from "../lib/deepseek";
import { verifyReceiptWithGemini } from "../lib/agent/receipt-verifier";
import { handleSalesMessage } from "../lib/agent/sales-agent";
import { safeProviderErrorLabel } from "../lib/ai-provider-errors";

const envKeys = ["DEEPSEEK_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"] as const;

async function withMockedProviderEnvironment<T>(run: () => Promise<T>): Promise<T> {
  const oldValues = new Map(envKeys.map((key) => [key, process.env[key]]));
  const oldGeminiModel = process.env.GEMINI_MODEL;
  const oldFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  try {
    return await run();
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of envKeys) {
      const value = oldValues.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (oldGeminiModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = oldGeminiModel;
  }
}

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({
    id: "local-deepseek-response",
    model: DEEPSEEK_MODELS.sales,
    choices: [{ message: { role: "assistant", content } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function geminiResponse(text: string): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { role: "model", parts: [{ text }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("Gemini es el proveedor principal cuando ambas claves están configuradas", async () => {
  await withMockedProviderEnvironment(async () => {
    process.env.GEMINI_API_KEY = "local-gemini-key";
    process.env.DEEPSEEK_API_KEY = "local-deepseek-key";
    let geminiRequests = 0;
    let deepSeekRequests = 0;
    globalThis.fetch = async (input) => {
      const hostname = new URL(String(input)).hostname;
      if (hostname === "generativelanguage.googleapis.com") {
        geminiRequests++;
        return geminiResponse("Hola, con gusto te ayudo.");
      }
      if (hostname === "api.deepseek.com") deepSeekRequests++;
      throw new Error(`Unexpected mocked provider host: ${hostname}`);
    };

    const result = await handleSalesMessage(`whatsapp:gemini-primary-${Date.now()}`, "Hola", "Prueba local");

    assert.equal(geminiRequests, 1);
    assert.equal(deepSeekRequests, 0);
    assert.equal(result.mode, "ai");
    assert.equal(result.reply, "Hola, con gusto te ayudo.");
  });
});

test("si Gemini falla, ventas pasa a DeepSeek sin exponer el texto del error", async () => {
  await withMockedProviderEnvironment(async () => {
    process.env.GEMINI_API_KEY = "local-gemini-key";
    process.env.DEEPSEEK_API_KEY = "local-deepseek-key";
    let geminiRequests = 0;
    let deepSeekRequests = 0;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
    globalThis.fetch = async (input) => {
      const hostname = new URL(String(input)).hostname;
      if (hostname === "generativelanguage.googleapis.com") {
        geminiRequests++;
        return new Response(JSON.stringify({ error: { message: "credential local-gemini-key rejected" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (hostname === "api.deepseek.com") {
        deepSeekRequests++;
        return chatResponse("Hola desde el respaldo local.");
      }
      throw new Error(`Unexpected mocked provider host: ${hostname}`);
    };

    try {
      const result = await handleSalesMessage(`whatsapp:gemini-fallback-${Date.now()}`, "Hola", "Prueba local");
      assert.ok(geminiRequests > 0);
      assert.equal(deepSeekRequests, 1);
      assert.equal(result.mode, "ai");
      assert.equal(result.reply, "Hola desde el respaldo local.");
      assert.doesNotMatch(warnings.join(" "), /local-gemini-key|credential/);
    } finally {
      console.warn = originalWarn;
    }
  });
});

test("el verificador prioriza Gemini Vision si ambos proveedores están disponibles", async () => {
  await withMockedProviderEnvironment(async () => {
    process.env.GEMINI_API_KEY = "local-gemini-key";
    process.env.DEEPSEEK_API_KEY = "local-deepseek-key";
    let geminiRequests = 0;
    let deepSeekRequests = 0;
    globalThis.fetch = async (input) => {
      const hostname = new URL(String(input)).hostname;
      if (hostname === "generativelanguage.googleapis.com") {
        geminiRequests++;
        return geminiResponse(JSON.stringify({
          isReceipt: true,
          bank: "Banco de prueba",
          amount: 32000,
          reference: "LOCAL-REF",
          date: null,
          summary: "Comprobante simulado.",
        }));
      }
      if (hostname === "api.deepseek.com") deepSeekRequests++;
      throw new Error(`Unexpected mocked provider host: ${hostname}`);
    };

    const result = await verifyReceiptWithGemini("YWJj", "image/jpeg", 32000);

    assert.equal(geminiRequests, 1);
    assert.equal(deepSeekRequests, 0);
    assert.equal(result.isReceipt, true);
    assert.equal(result.amount, 32000);
  });
});

test("si no hay credenciales de IA, ventas usa el respaldo determinista sin solicitudes", async () => {
  await withMockedProviderEnvironment(async () => {
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      throw new Error("No provider request is allowed without credentials");
    };

    const result = await handleSalesMessage(`whatsapp:no-ai-keys-${Date.now()}`, "Hola", "Prueba local");

    assert.equal(requests, 0);
    assert.equal(result.mode, "keyword");
    assert.ok(result.reply.trim().length > 0);
  });
});

test("los logs de proveedores reducen errores a etiquetas sin copiar mensajes sensibles", () => {
  assert.equal(safeProviderErrorLabel(new Error("token=local-secret-value")), "ProviderError");
  assert.equal(safeProviderErrorLabel({ status: 503, message: "token=local-secret-value" }), "HTTP_503");
  assert.equal(safeProviderErrorLabel(new DOMException("token=local-secret-value", "TimeoutError")), "TimeoutError");
});

test("el agente de ventas usa DeepSeek Chat Completions y conserva la respuesta conversacional", async () => {
  await withMockedProviderEnvironment(async () => {
    process.env.DEEPSEEK_API_KEY = "local-test-key";
    let requestUrl = "";
    let requestBody: any;
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer local-test-key");
      requestBody = JSON.parse(String(init?.body));
      return chatResponse("¡Hola! Con gusto te ayudo con tu pedido.");
    };

    const result = await handleSalesMessage(`whatsapp:deepseek-sales-${Date.now()}`, "Hola", "Prueba local");
    assert.equal(requestUrl, `${DEEPSEEK_BASE_URL}/chat/completions`);
    assert.equal(requestBody.model, DEEPSEEK_MODELS.sales);
    assert.equal(requestBody.temperature, 0.35);
    assert.equal(requestBody.max_tokens, 1500);
    assert.equal(requestBody.thinking.type, "disabled");
    assert.equal(result.mode, "ai");
    assert.equal(result.reply, "¡Hola! Con gusto te ayudo con tu pedido.");
  });
});

test("si DeepSeek falla, ventas continúa por el respaldo local sin propagar el error", async () => {
  await withMockedProviderEnvironment(async () => {
    process.env.DEEPSEEK_API_KEY = "local-test-key";
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return new Response("service unavailable", { status: 503 });
    };

    const result = await handleSalesMessage(`whatsapp:deepseek-failure-${Date.now()}`, "Hola", "Prueba local");
    assert.equal(requests, 1);
    assert.equal(result.mode, "keyword");
    assert.ok(result.reply.trim().length > 0);
    assert.doesNotMatch(result.reply, /local-test-key|HTTP 503/i);
  });
});

test("el verificador envía la imagen a DeepSeek y conserva una respuesta no concluyente", async () => {
  await withMockedProviderEnvironment(async () => {
    process.env.DEEPSEEK_API_KEY = "local-test-key";
    let requestBody: any;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return chatResponse(JSON.stringify({
        isReceipt: false,
        bank: null,
        amount: null,
        reference: null,
        date: null,
        summary: "La imagen no permite confirmar un pago.",
      }));
    };

    const result = await verifyReceiptWithGemini("YWJj", "image/jpeg", 32000);
    assert.equal(requestBody.model, DEEPSEEK_MODELS.receipt);
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
    const content = requestBody.messages[0].content;
    assert.equal(content[0].type, "text");
    assert.equal(content[1].type, "image_url");
    assert.equal(content[1].image_url.url, "data:image/jpeg;base64,YWJj");
    assert.equal(result.isReceipt, false);
    assert.equal(result.amount, undefined);
    assert.equal(result.summary, "La imagen no permite confirmar un pago.");
  });
});

test("la clave ausente impide solicitudes y DeepSeek devuelve errores controlados para timeout, HTTP y respuesta vacía", async () => {
  const oldKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  let requests = 0;
  const options = {
    model: DEEPSEEK_MODELS.sales,
    messages: [{ role: "user" as const, content: "hola" }],
  };
  const fetchImpl: typeof fetch = async () => {
    requests++;
    return chatResponse("respuesta");
  };

  try {
    await assert.rejects(
      createDeepSeekChatCompletion(options, { fetchImpl }),
      (error: unknown) => error instanceof DeepSeekRequestError && error.kind === "configuration"
    );
    assert.equal(requests, 0);

    await assert.rejects(
      createDeepSeekChatCompletion({ ...options, timeoutMs: 10 }, {
        apiKey: "local-test-key",
        fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return reject(new Error("timeout signal missing"));
          signal.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError")), { once: true });
        }),
      }),
      (error: unknown) => error instanceof DeepSeekRequestError && error.kind === "timeout"
    );

    await assert.rejects(
      createDeepSeekChatCompletion(options, {
        apiKey: "local-test-key",
        fetchImpl: async () => new Response("unavailable", { status: 503 }),
      }),
      (error: unknown) => error instanceof DeepSeekRequestError && error.kind === "http" && error.status === 503
    );

    await assert.rejects(
      createDeepSeekChatCompletion(options, {
        apiKey: "local-test-key",
        fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      }),
      (error: unknown) => error instanceof DeepSeekRequestError && error.kind === "empty_response"
    );
  } finally {
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = oldKey;
  }
});

test("ambas rutas de diagnóstico usan DeepSeek mediante respuestas locales simuladas", async () => {
  await withMockedProviderEnvironment(async () => {
    process.env.DEEPSEEK_API_KEY = "local-test-key";
    globalThis.fetch = async () => chatResponse("OK");

    const { GET: getGeminiCheck } = await import("../app/api/gemini-check/route");
    const geminiCheckResponse = await getGeminiCheck(new NextRequest("http://localhost/api/gemini-check"));
    const geminiCheck = await geminiCheckResponse.json();
    assert.equal(geminiCheck.results.deepseek, "OK: OK");

    const { createUser, createSession } = await import("../lib/auth/session");
    const user = await createUser({
      email: `deepseek-diagnostic-${Date.now()}@example.test`,
      password: "LocalTestOnly123!",
      name: "Prueba local",
      role: "admin",
    });
    const session = await createSession(user.id);
    const { GET: getPanelTestAi } = await import("../app/api/panel/test-ai/route");
    const panelResponse = await getPanelTestAi(new NextRequest("http://localhost/api/panel/test-ai", {
      headers: { cookie: `panel_session=${session.token}` },
    }));
    const panelResult = await panelResponse.json();
    assert.equal(panelResponse.status, 200);
    assert.equal(panelResult.results.deepseek, "OK");
  });
});
