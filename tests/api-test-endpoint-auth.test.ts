import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

process.env.ENABLE_TEST_ENDPOINT = "";

test("endpoint desactivado responde 404 aunque haya sesión", async () => {
  const { GET } = await import("../app/api/test/route");
  const res = await GET(new NextRequest("http://localhost/api/test"));
  assert.equal(res.status, 404);
  const cuerpo = await res.json();
  assert.equal(cuerpo.ok, false);
  assert.match(String(cuerpo.error), /No disponible/i);
});

test("endpoint activo sin sesión responde 401", async () => {
  process.env.ENABLE_TEST_ENDPOINT = "true";
  const { GET } = await import("../app/api/test/route");
  const res = await GET(new NextRequest("http://localhost/api/test"));
  assert.equal(res.status, 401);
  const cuerpo = await res.json();
  assert.match(String(cuerpo.error), /No autorizado/i);
  process.env.ENABLE_TEST_ENDPOINT = "";
});

test("endpoint activo con cookie inválida responde 401", async () => {
  process.env.ENABLE_TEST_ENDPOINT = "true";
  const { GET } = await import("../app/api/test/route");
  const req = new NextRequest("http://localhost/api/test", {
    headers: { cookie: "panel_session=token-invalido" },
  });
  const res = await GET(req);
  assert.equal(res.status, 401);
  process.env.ENABLE_TEST_ENDPOINT = "";
});
