// Loaded before every BOTW test worker by the npm test command.
// Tests may replace global fetch with a mock; the captured original remains guarded.
const originalFetch = globalThis.fetch;

const automatedTestRun = Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.includes("--test");
const localBuildRun = isLocalBuildRun(process.argv);
const integrationEnvKeys = [
  "CONTABILIDAD_API_URL",
  "CONTABILIDAD_RECORD_PAYMENT_URL",
  "BOT_INVOICE_SECRET",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "PANEL_PASSWORD",
  "PANEL_SESSION_SECRET",
];

function disableIntegrationEnv(env = process.env) {
  for (const key of integrationEnvKeys) env[key] = "";
}

function isLocalBuildRun(argv) {
  return argv.some((arg) => /[\\/]next[\\/]dist[\\/]bin[\\/]next(?:\.js)?$/i.test(arg)) && argv.includes("build");
}

function configureLocalBuildIntegrations(env = process.env) {
  Object.assign(env, {
    CONTABILIDAD_API_URL: "http://127.0.0.1:1/api/invoices/create-from-order",
    CONTABILIDAD_RECORD_PAYMENT_URL: "http://127.0.0.1:1/api/invoices/record-payment",
    BOT_INVOICE_SECRET: "botw-local-build-disabled",
    EVOLUTION_API_URL: "http://127.0.0.1:1",
    EVOLUTION_API_KEY: "botw-local-build-disabled",
    EVOLUTION_INSTANCE: "botw-local-build",
    GEMINI_API_KEY: "botw-local-build-disabled",
    OPENAI_API_KEY: "botw-local-build-disabled",
    TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
    TWILIO_AUTH_TOKEN: "botw-local-build-disabled",
    TWILIO_WHATSAPP_FROM: "whatsapp:+15005550006",
    TURSO_DATABASE_URL: "http://127.0.0.1:1",
    TURSO_AUTH_TOKEN: "botw-local-build-disabled",
    PANEL_PASSWORD: "botw-local-build-disabled",
    PANEL_SESSION_SECRET: "botw-local-build-disabled-session-secret",
  });
}

if (automatedTestRun) disableIntegrationEnv();
if (localBuildRun) configureLocalBuildIntegrations();
if (automatedTestRun) {
  // Keep code paths that require a configured Evolution client testable, but
  // point them at an unreachable loopback-only address with a fake key.
  process.env.EVOLUTION_API_URL = "http://127.0.0.1:1";
  process.env.EVOLUTION_API_KEY = "botw-test-only";
  process.env.EVOLUTION_INSTANCE = "botw-test";
}

function isLoopback(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" ||
    host === "127.0.0.1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function getRequestUrl(input) {
  if (typeof input === "string" || input instanceof URL) return new URL(input);
  if (input && typeof input.url === "string") return new URL(input.url);
  throw new TypeError("Test network guard could not determine request URL");
}

function assertLocalRequest(input) {
  const url = getRequestUrl(input);
  if (!isLoopback(url.hostname)) {
    process.exitCode = 1;
    throw new Error("Blocked non-loopback network request in BOTW tests");
  }
}

if (typeof originalFetch === "function") {
  globalThis.fetch = function guardedFetch(input, init) {
    assertLocalRequest(input);
    // A local mock must not be able to redirect a test to a public service.
    return originalFetch.call(this, input, { ...init, redirect: "manual" });
  };
}

// Guard raw sockets as well: clients such as libSQL may bypass fetch/http(s).
if (automatedTestRun || localBuildRun) {
  const net = require("node:net");
  const originalSocketConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedSocketConnect(...args) {
    const target = args[0];
    let host = "localhost";
    if (typeof target === "string") {
      // A string target is a local pipe/path in Node's socket API.
      if (target.startsWith("/") || target.startsWith("\\\\.\\pipe\\")) return originalSocketConnect.apply(this, args);
      host = target;
    } else if (typeof target === "number") {
      host = typeof args[1] === "string" ? args[1] : "localhost";
    } else if (target && typeof target === "object") {
      if (target.path) return originalSocketConnect.apply(this, args);
      host = target.host || target.hostname || "localhost";
    } else {
      process.exitCode = 1;
      throw new Error("Blocked unknown socket connection in BOTW tests/build");
    }
    if (!isLoopback(host)) {
      process.exitCode = 1;
      throw new Error("Blocked non-loopback socket connection in BOTW tests/build");
    }
    return originalSocketConnect.apply(this, args);
  };
}
// Guard Node's built-in HTTP clients too, in case a test bypasses fetch.
for (const scheme of ["http", "https"]) {
  const client = require(scheme);
  for (const method of ["request", "get"]) {
    const original = client[method];
    client[method] = function guardedRequest(input, options, callback) {
      let url;
      try {
        if (typeof input === "string" || input instanceof URL) url = new URL(input);
        else if (input && typeof input.href === "string") url = new URL(input.href);
        else if (input && typeof input.hostname === "string") {
          url = new URL(`${scheme}://${input.hostname}${input.port ? `:${input.port}` : ""}${input.path || "/"}`);
        } else if (input && typeof input.host === "string") {
          url = new URL(`${scheme}://${input.host}${input.path || "/"}`);
        }
      } catch {}
      if (!url || !isLoopback(url.hostname)) {
        process.exitCode = 1;
        throw new Error("Blocked non-loopback network request in BOTW tests");
      }
      return original.call(this, input, options, callback);
    };
  }
}

module.exports = { isLoopback, assertLocalRequest, disableIntegrationEnv, configureLocalBuildIntegrations, isLocalBuildRun };
