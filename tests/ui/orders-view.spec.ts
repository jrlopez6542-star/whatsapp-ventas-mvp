import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const here = __dirname;
const repo = path.resolve(here, "../..");
let appBundle = "";
let globalCss = "";

const fixtures = [
  {
    id: "fixture-botw-001",
    conversationId: "whatsapp:0000000000@s.whatsapp.net",
    customerName: "PEDIDO DE PRUEBA BOTW — María Fixture",
    phone: "0000000000",
    deliveryAddress: "Dirección ficticia de prueba BOTW, apartamento 0",
    paymentMethod: "Nequi",
    itemsSummary: "2 x Buñuelo de prueba\n1 x Café ficticio",
    status: "pending",
    total: 9500,
    invoiceNumber: "PRUEBA-0001",
    invoiceId: "fixture-invoice-001",
    invoiceUrl: "https://example.invalid/fixture-invoice-001",
    createdAt: 1_792_684_800_000,
  },
  {
    id: "fixture-botw-002",
    conversationId: "whatsapp:0000000000@s.whatsapp.net",
    customerName: "PEDIDO DE PRUEBA BOTW — Carlos Fixture",
    phone: "0000000000",
    deliveryAddress: "Dirección de prueba BOTW, casa 0",
    paymentMethod: "Efectivo",
    itemsSummary: "1 x Caja ficticia de buñuelos",
    status: "preparing",
    total: 12000,
    createdAt: 1_792_598_400_000,
  },
  {
    id: "fixture-botw-003",
    conversationId: "whatsapp:0000000000@s.whatsapp.net",
    customerName: "PEDIDO DE PRUEBA BOTW — Ana Fixture",
    phone: "0000000000",
    deliveryAddress: "Dirección ficticia BOTW, local 0",
    paymentMethod: "Nequi",
    itemsSummary: "3 x Producto de prueba",
    status: "delivered",
    total: 7000,
    createdAt: 1_792_512_000_000,
  },
];

async function mountIsolatedView(page: Page, options: { confirmAnswers?: boolean[]; deleteStatus?: Record<string, number> } = {}) {
  const calls = { requests: [] as string[] };
  await page.route("**/*", async (route) => {
    calls.requests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${globalCss}</style></head><body><div id="root"></div><script>window.__BOTW_TEST__=${JSON.stringify({
      orders: fixtures,
      deleteStatus: options.deleteStatus ?? {},
      confirmAnswers: options.confirmAnswers ?? [],
      fetchCalls: [],
      alerts: [],
      openedUrls: [],
      externalNavigationAttempts: [],
      unexpectedFetches: [],
    })};</script><script>${appBundle}</script></body></html>`,
  );
  await expect(page.getByRole("heading", { name: "Pedidos", exact: true })).toBeVisible();
  return calls;
}

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.join(here, "orders-view.harness.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    tsconfig: path.join(repo, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"test"' },
  });
  appBundle = result.outputFiles[0].text;
  globalCss = await fs.readFile(path.join(repo, "app/globals.css"), "utf8");
  process.chdir(os.tmpdir());
});

test.beforeEach(async ({ page }) => {
  await mountIsolatedView(page);
});

test("muestra la tabla sintética y filtra por búsqueda, estado y pago", async ({ page }) => {
  const table = page.getByRole("table");
  await expect(table.getByText("PEDIDO DE PRUEBA BOTW — María Fixture")).toBeVisible();
  await expect(page.getByText("3 de 3 pedidos")).toBeVisible();

  await page.getByRole("searchbox", { name: "Buscar pedidos" }).fill("María Fixture");
  await expect(page.getByText("1 de 3 pedidos")).toBeVisible();
  await expect(table.getByText("PEDIDO DE PRUEBA BOTW — Carlos Fixture")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Buscar pedidos" }).clear();
  await page.getByLabel("Filtrar por estado").selectOption("pending");
  await page.getByLabel("Filtrar por medio de pago").selectOption("Nequi");
  await expect(page.getByText("1 de 3 pedidos")).toBeVisible();
  await expect(table.getByText("PEDIDO DE PRUEBA BOTW — María Fixture")).toBeVisible();
});

test("selecciona una fila y todos los pedidos visibles", async ({ page }) => {
  await page.getByLabel("Seleccionar pedido fixture-").first().check();
  await expect(page.getByText("1 seleccionado")).toBeVisible();
  await page.getByLabel("Seleccionar todos").check();
  await expect(page.getByText("3 seleccionados")).toBeVisible();
  await page.getByLabel("Seleccionar todos").uncheck();
  await expect(page.getByText("0 seleccionados")).toBeVisible();
});

test("cancelar la confirmación no hace ninguna solicitud de eliminación", async ({ page }) => {
  await page.getByLabel("Seleccionar todos").check();
  await page.evaluate(() => {
    window.__BOTW_TEST__!.confirmAnswers.push(false);
  });
  await page.getByRole("button", { name: "Eliminar seleccionados" }).click();
  await expect(page.getByText("3 seleccionados")).toBeVisible();
  const state = await page.evaluate(() => window.__BOTW_TEST__);
  expect(state?.fetchCalls).toEqual([]);
  expect(state?.alerts).toEqual([]);
});

test("eliminación múltiple parcial informa el fallo y conserva el pedido no eliminado", async ({ page }) => {
  await page.getByLabel("Seleccionar todos").check();
  await page.evaluate(() => {
    window.__BOTW_TEST__!.confirmAnswers.push(true);
    window.__BOTW_TEST__!.deleteStatus["fixture-botw-002"] = 503;
  });
  await page.getByRole("button", { name: "Eliminar seleccionados" }).click();

  const table = page.getByRole("table");
  await expect(table.getByText("PEDIDO DE PRUEBA BOTW — María Fixture")).toHaveCount(0);
  await expect(table.getByText("PEDIDO DE PRUEBA BOTW — Carlos Fixture")).toBeVisible();
  await expect(table.getByText("PEDIDO DE PRUEBA BOTW — Ana Fixture")).toHaveCount(0);
  const state = await page.evaluate(() => window.__BOTW_TEST__);
  expect(state?.fetchCalls.map((call) => call.method)).toEqual(["DELETE", "DELETE", "DELETE"]);
  expect(state?.alerts).toEqual([
    "2 pedidos eliminados. No se pudieron eliminar 1: #fixture-.",
  ]);
  expect(state?.unexpectedFetches).toEqual([]);
});

test("abre, cierra y vuelve a abrir el detalle ficticio sin navegar a la factura", async ({ page }) => {
  const row = page.getByRole("row", { name: /María Fixture/ });
  await row.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("PEDIDO DE PRUEBA BOTW — María Fixture");
  await expect(dialog).toContainText("0000000000");
  await expect(dialog).toContainText("Nequi");
  await expect(dialog).toContainText("Dirección ficticia de prueba BOTW, apartamento 0");
  await expect(dialog).toContainText("2 x Buñuelo de prueba");
  const invoiceLink = dialog.getByRole("link", { name: /Factura #PRUEBA-0001/ });
  await expect(invoiceLink).toHaveAttribute(
    "href",
    "https://example.invalid/fixture-invoice-001",
  );
  await invoiceLink.click();
  expect(page.url()).toBe("about:blank");

  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const state = await page.evaluate(() => window.__BOTW_TEST__);
  expect(state?.fetchCalls).toEqual([]);
  expect(state?.openedUrls).toEqual([]);
  expect(state?.externalNavigationAttempts).toEqual(["https://example.invalid/fixture-invoice-001"]);
  expect(state?.unexpectedFetches).toEqual([]);
});

test("no contacta la red durante la interacción sintética", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.getByRole("searchbox", { name: "Buscar pedidos" }).fill("María");
  await page.getByRole("row", { name: /María Fixture/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(requests).toEqual([]);
});
