import { Socket } from "node:net";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { request as httpsRequest } from "node:https";
import {
  assertLocalRequest,
  configureLocalBuildIntegrations,
  disableIntegrationEnv,
  isLocalBuildRun,
  isLoopback,
} from "./no-public-network.cjs";
import {
  resolveContabilidadApiUrl,
  isProductionContabilidadUrl,
  isPreviewEnvironment,
} from "../lib/contabilidad";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

test("accounting sync marker changes only after durable Turso write succeeds", () => {
  const store = source("lib/store/index.ts");
  const marker = store.slice(
    store.indexOf("export async function markOrderAccountingPaymentSynced("),
    store.indexOf("export async function findOrderByInvoiceOrRef(")
  );
  assert.match(marker, /if \(result\.rowsAffected < 1\) return false/);
  assert.match(marker, /catch \(err\)[\s\S]*?return false/);
  assert.ok(marker.indexOf("if (result.rowsAffected < 1)") < marker.indexOf("memOrder.accountingPaymentSynced = 1"));
});

test("panel delivery syncs confirmed cash only after validating Contabilidad's response", () => {
  const webhook = source("app/api/webhooks/evolution/route.ts");
  assert.match(webhook, /Ya no es necesario confirmar el cobro por WhatsApp/);
  assert.doesNotMatch(webhook, /markOrderDriverPaymentConfirmed|recordPaymentInContabilidad/);
  const panel = source("app/api/panel/orders/[id]/route.ts");
  assert.match(panel, /status === "delivered"[\s\S]*?markOrderDriverPaymentConfirmed/);
  assert.match(panel, /recordPaymentInContabilidad/);
  assert.match(panel, /markOrderAccountingPaymentSynced/);
  assert.match(panel, /result\.status === "paid"/);
  assert.match(panel, /result\.paymentId/);
  assert.match(panel, /result\.orderId === order\.id/);
  assert.match(panel, /result\.amount/);
  assert.match(panel, /Math\.abs\(result\.amount - amount\)/);
  assert.match(panel, /currentOrder\?\.status === "cancelled"/);
});

test("delivery payment and cancellation use mutually exclusive atomic status predicates", () => {
  const store = source("lib/store/index.ts");
  const updateStatus = store.slice(
    store.indexOf("export async function updateOrderStatus("),
    store.indexOf("export async function claimOrderDriverNotification(")
  );
  assert.match(updateStatus, /COALESCE\(status, ''\) != 'cancelled'/);
  assert.match(updateStatus, /status IN \(\$\{options\.allowedCurrentStatuses\.map\(\(\) => "\?"\)\.join\(", "\)\}\)/);
  assert.match(updateStatus, /COALESCE\(status, ''\) != 'delivered'/);
  assert.match(updateStatus, /COALESCE\(driver_payment_confirmed, 0\) = 0/);

  const confirmPayment = store.slice(
    store.indexOf("export async function markOrderDriverPaymentConfirmed("),
    store.indexOf("export async function markOrderAccountingPaymentSynced(")
  );
  assert.match(confirmPayment, /AND status = \? AND COALESCE\(driver_payment_confirmed, 0\) = 0/);
  assert.match(confirmPayment, /if \(options\.requiredStatus\) return null/);
});

test("accounting HTTP timeouts and non-success responses remain retryable", () => {
  const client = source("lib/contabilidad.ts");
  const recordPayment = client.slice(client.indexOf("export async function recordPaymentInContabilidad("));
  assert.match(recordPayment, /AbortSignal\.timeout\(15000\)/);
  assert.match(recordPayment, /if \(!res\.ok\)[\s\S]*?return \{[\s\S]*?ok: false/);
  assert.match(recordPayment, /catch \(err: any\)[\s\S]*?return \{[\s\S]*?ok: false/);
  assert.doesNotMatch(client, /const errText = await res\.text\(\)/);
  assert.match(client, /safeIntegrationErrorName\(err\)/);
});

test("local runs do not fall back to the public accounting endpoint", () => {
  assert.equal(resolveContabilidadApiUrl({ NODE_ENV: "test" }), "");
  assert.equal(resolveContabilidadApiUrl({ NODE_ENV: "development" }), "");
  assert.equal(
    resolveContabilidadApiUrl({ NODE_ENV: "production", NODE_TEST_CONTEXT: "child-v8" }),
    ""
  );
  assert.equal(
    resolveContabilidadApiUrl({ NODE_ENV: "test", CONTABILIDAD_API_URL: "https://contabilidad.example.com/api/invoices/create-from-order" }),
    ""
  );
  assert.equal(
    resolveContabilidadApiUrl({ NODE_ENV: "test", CONTABILIDAD_API_URL: "http://127.0.0.1:3030/api/invoices/create-from-order" }),
    "http://127.0.0.1:3030/api/invoices/create-from-order"
  );
  assert.equal(
    resolveContabilidadApiUrl({ NODE_ENV: "production" }),
    "https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order"
  );
});

test("production contabilidad url detection identifies production hosts", () => {
  assert.equal(
    isProductionContabilidadUrl("https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order"),
    true
  );
  assert.equal(
    isProductionContabilidadUrl("https://contabilidad-prod.internal.domain/api/invoices/create-from-order"),
    true
  );
  assert.equal(
    isProductionContabilidadUrl("https://contabilidad_prod.internal.domain/api/invoices/create-from-order"),
    true
  );
  assert.equal(
    isProductionContabilidadUrl("https://contabilidad-sandbox.internal.domain/api/invoices/create-from-order"),
    false
  );
  assert.equal(isProductionContabilidadUrl("http://127.0.0.1:3000/api"), false);
  assert.equal(isProductionContabilidadUrl(""), false);
  assert.equal(isProductionContabilidadUrl(undefined), false);
});

test("preview environment detection identifies preview runs", () => {
  assert.equal(isPreviewEnvironment({ VERCEL_ENV: "preview" }), true);
  assert.equal(
    isPreviewEnvironment({ VERCEL: "1", VERCEL_ENV: "feature-branch" }),
    true
  );
  assert.equal(
    isPreviewEnvironment({ VERCEL: "1", VERCEL_ENV: "production" }),
    false
  );
  assert.equal(isPreviewEnvironment({ VERCEL_ENV: "production" }), false);
  assert.equal(isPreviewEnvironment({}), false);
});

test("preview environment blocks production accounting endpoint and requires safe dedicated url", () => {
  // 1. NODE_ENV=production y VERCEL_ENV=preview, sin URL Preview: nunca devuelve la URL de producción
  assert.equal(
    resolveContabilidadApiUrl({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
    ""
  );

  // 2. Preview con CONTABILIDAD_API_URL de producción heredada: nunca cae a producción y devuelve vacío
  assert.equal(
    resolveContabilidadApiUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      CONTABILIDAD_API_URL: "https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order",
    }),
    ""
  );

  // 3. Preview con CONTABILIDAD_API_URL_PREVIEW apuntando a producción: rechazada por seguridad
  assert.equal(
    resolveContabilidadApiUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      CONTABILIDAD_API_URL_PREVIEW: "https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order",
    }),
    ""
  );
  assert.equal(
    resolveContabilidadApiUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      CONTABILIDAD_API_URL_PREVIEW: "https://contabilidad-prod.internal.domain/api/invoices/create-from-order",
    }),
    ""
  );

  // 4. Preview con URL segura explícita: permitida conforme a la política
  assert.equal(
    resolveContabilidadApiUrl({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      CONTABILIDAD_API_URL_PREVIEW: "https://contabilidad-sandbox.internal.domain/api/invoices/create-from-order",
    }),
    "https://contabilidad-sandbox.internal.domain/api/invoices/create-from-order"
  );

  // 5. Preview con VERCEL=1 y VERCEL_ENV no-production
  assert.equal(
    resolveContabilidadApiUrl({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "custom-preview-branch",
    }),
    ""
  );

  // 6. Producción real (sin Preview): conserva el comportamiento existente
  assert.equal(
    resolveContabilidadApiUrl({ NODE_ENV: "production", VERCEL_ENV: "production" }),
    "https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order"
  );

  // 7. Test runtime en Preview: rechaza URLs públicas y solo admite loopback
  assert.equal(
    resolveContabilidadApiUrl({
      NODE_ENV: "test",
      VERCEL_ENV: "preview",
      CONTABILIDAD_API_URL_PREVIEW: "https://contabilidad.example.com/api/invoices/create-from-order",
    }),
    ""
  );
  assert.equal(
    resolveContabilidadApiUrl({
      NODE_ENV: "test",
      VERCEL_ENV: "preview",
      CONTABILIDAD_API_URL_PREVIEW: "http://127.0.0.1:4040/api/invoices/create-from-order",
    }),
    "http://127.0.0.1:4040/api/invoices/create-from-order"
  );
});

test("test network guard allows only loopback hosts and rejects public integrations", () => {
  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(isLoopback("localhost"), true);
  assert.equal(isLoopback("contabilidad-app-fawn.vercel.app"), false);
  assert.throws(
    () => assertLocalRequest("https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order"),
    /Blocked non-loopback network request/
  );
  assert.throws(
    () => httpsRequest("https://example.org"),
    /Blocked non-loopback network request/
  );
  assert.throws(
    () => new Socket().connect({ host: "example.org", port: 443 }),
    /Blocked non-loopback socket connection/
  );
  assert.equal(process.exitCode, 1);
  process.exitCode = 0;
});

test("automated runs use fake loopback integration values instead of deployed credentials", () => {
  const env = {
    CONTABILIDAD_API_URL: "https://contabilidad-app-fawn.vercel.app",
    EVOLUTION_API_KEY: "not-a-real-secret",
    GEMINI_API_KEY: "not-a-real-secret",
    TURSO_DATABASE_URL: "libsql://not-a-real-host",
  } as unknown as NodeJS.ProcessEnv;
  disableIntegrationEnv(env);
  assert.equal(env.CONTABILIDAD_API_URL, "");
  assert.equal(env.EVOLUTION_API_KEY, "");
  assert.equal(env.GEMINI_API_KEY, "");
  assert.equal(env.TURSO_DATABASE_URL, "");
  assert.equal(process.env.CONTABILIDAD_API_URL, "");
  assert.equal(process.env.EVOLUTION_API_URL, "http://127.0.0.1:1");
  assert.equal(process.env.EVOLUTION_API_KEY, "botw-test-only");
  assert.equal(process.env.GEMINI_API_KEY, "");
  assert.equal(process.env.TURSO_DATABASE_URL, "");

  assert.equal(isLocalBuildRun(["node", "C:\\repo\\node_modules\\next\\dist\\bin\\next", "build"]), true);
  assert.equal(isLocalBuildRun(["node", "C:\\repo\\node_modules\\next\\dist\\bin\\next", "dev"]), false);
  const buildEnv = {
    GEMINI_API_KEY: "real-key",
    CONTABILIDAD_API_URL: "https://contabilidad.example.com",
  } as unknown as NodeJS.ProcessEnv;
  configureLocalBuildIntegrations(buildEnv);
  assert.equal(buildEnv.GEMINI_API_KEY, "botw-local-build-disabled");
  assert.equal(new URL(buildEnv.CONTABILIDAD_API_URL!).hostname, "127.0.0.1");
});

test("remote destructive test:bot entrypoint is blocked before loading local env or issuing requests", () => {
  const script = source("scripts/test-bot.mjs");
  const blockedAt = script.indexOf("[test:bot] Bloqueado");
  assert.ok(blockedAt >= 0);
  assert.ok(blockedAt < script.indexOf("dotenv.config("));
  assert.ok(blockedAt < script.indexOf("const TARGET_URL"));
  const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
  assert.match(packageJson.scripts["test:bot"], /no-public-network\.cjs/);
});

test("test network guard does not follow a loopback redirect to a public host", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(302, { location: "https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order" });
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/redirect`);
    assert.equal(response.status, 302);
    assert.equal(response.url, `http://127.0.0.1:${address.port}/redirect`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
