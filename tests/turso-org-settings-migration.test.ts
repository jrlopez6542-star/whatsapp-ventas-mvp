import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  setTursoClientForTesting,
  resetTursoReadyForTesting,
  ensureTursoReady,
} from "../lib/store/db";
import { getOrgSettings, updateOrgSettings } from "../lib/store";

test("org_settings: Creación de esquema nuevo en base limpia y actualización de configuración sin error SQL", async () => {
  const origUrl = process.env.TURSO_DATABASE_URL;
  const origToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-test-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // 1. Verificar esquema en base limpia
    const tableInfo = await client.execute("PRAGMA table_info(org_settings);");
    const cols = new Set((tableInfo.rows || []).map((r: any) => String(r.name || r[1] || "").toLowerCase()));

    assert.equal(cols.has("id"), true, "La columna 'id' debe existir en org_settings");
    assert.equal(cols.has("updated_at"), true, "La columna 'updated_at' debe existir en org_settings");
    assert.equal(cols.has("business_name"), true, "La columna 'business_name' debe existir en org_settings");
    assert.equal(cols.has("bot_enabled"), true, "La columna 'bot_enabled' debe existir en org_settings");

    // 2. Modificar configuración y verificar que no arroja SQLITE_UNKNOWN ni error de columna faltante
    const updated = await updateOrgSettings({
      botEnabled: "false",
      name: "Buñuelandia Test Clean",
      tone: "formal",
    });

    assert.equal(updated.botEnabled, "false");
    assert.equal(updated.name, "Buñuelandia Test Clean");

    // 3. getOrgSettings debe recuperar los valores persistidos en Turso
    const fetched = await getOrgSettings();
    assert.equal(fetched.botEnabled, "false");
    assert.equal(fetched.name, "Buñuelandia Test Clean");
    assert.equal(fetched.tone, "formal");

    // 4. Verificar existencia de exactamente 1 fila en la tabla
    const countRes = await client.execute("SELECT count(*) as cnt FROM org_settings WHERE id = 1;");
    assert.equal(Number(countRes.rows[0]?.cnt || 0), 1, "Debe existir exactamente una fila con id = 1");
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    if (origUrl !== undefined) process.env.TURSO_DATABASE_URL = origUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origToken !== undefined) process.env.TURSO_AUTH_TOKEN = origToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("org_settings: Migración compatible desde esquema legado clave-valor preservando datos históricos", async () => {
  const origUrl = process.env.TURSO_DATABASE_URL;
  const origToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-legacy-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // 1. Crear tabla con el esquema antiguo (exactamente el DDL previo: key y value, sin id ni columnas relacionales)
    await client.execute(`
      CREATE TABLE org_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 2. Insertar registros históricos en formato clave-valor
    await client.execute({
      sql: "INSERT INTO org_settings (key, value) VALUES (?, ?), (?, ?), (?, ?), (?, ?);",
      args: [
        "name", "Buñuelandia Tradicional Histórica",
        "tone", "cálido y alegre",
        "welcomeMessage", "¡Hola querido cliente de siempre!",
        "rules", "Reglas históricas preservadas",
      ],
    });

    // 3. Ejecutar ensureTursoReady para disparar la migración aditiva
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // 4. Verificar que se añadieron las columnas 'id' y 'updated_at'
    const tableInfo = await client.execute("PRAGMA table_info(org_settings);");
    const cols = new Set((tableInfo.rows || []).map((r: any) => String(r.name || r[1] || "").toLowerCase()));

    assert.equal(cols.has("id"), true, "La columna 'id' debe haber sido agregada a la tabla existente");
    assert.equal(cols.has("updated_at"), true, "La columna 'updated_at' debe haber sido agregada");
    assert.equal(cols.has("business_name"), true, "La columna 'business_name' debe haber sido agregada");

    // 5. Verificar que los datos históricos fueron consolidados en la fila singleton id = 1
    const settings = await getOrgSettings();
    assert.equal(settings.name, "Buñuelandia Tradicional Histórica", "El nombre histórico debe haberse preservado");
    assert.equal(settings.tone, "cálido y alegre", "El tono histórico debe haberse preservado");
    assert.equal(settings.welcomeMessage, "¡Hola querido cliente de siempre!", "El mensaje de bienvenida debe haberse preservado");
    assert.equal(settings.rules, "Reglas históricas preservadas", "Las reglas históricas deben haberse preservado");

    // 6. Verificar que updateOrgSettings funciona sobre el esquema migrado sin lanzar error
    const patched = await updateOrgSettings({ botEnabled: "true" });
    assert.equal(patched.botEnabled, "true");

    const afterPatch = await getOrgSettings();
    assert.equal(afterPatch.botEnabled, "true");
    assert.equal(afterPatch.name, "Buñuelandia Tradicional Histórica", "Los demás campos históricos deben seguir intactos");
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    if (origUrl !== undefined) process.env.TURSO_DATABASE_URL = origUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origToken !== undefined) process.env.TURSO_AUTH_TOKEN = origToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("org_settings: Actualizaciones repetidas no duplican filas (idempotencia y unicidad de id = 1)", async () => {
  const origUrl = process.env.TURSO_DATABASE_URL;
  const origToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-idempotency-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // Ejecutar múltiples mutaciones consecutivas simulando uso del panel
    await updateOrgSettings({ botEnabled: "false" });
    await updateOrgSettings({ deliveryFee: "0" });
    await updateOrgSettings({ estimatedDeliveryTime: "25-35 min" });
    await updateOrgSettings({ botEnabled: "true" });
    await updateOrgSettings({ nequiNumber: "3001234567" });

    // Verificar que solo existe un registro singleton con id = 1
    const res = await client.execute("SELECT count(*) as total, id FROM org_settings WHERE id = 1;");
    assert.equal(Number(res.rows[0]?.total || 0), 1, "Debe existir exactamente 1 fila con id = 1 tras múltiples updates");

    const finalSettings = await getOrgSettings();
    assert.equal(finalSettings.botEnabled, "true");
    assert.equal(finalSettings.deliveryFee, "0");
    assert.equal(finalSettings.estimatedDeliveryTime, "25-35 min");
    assert.equal(finalSettings.nequiNumber, "3001234567");
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    if (origUrl !== undefined) process.env.TURSO_DATABASE_URL = origUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origToken !== undefined) process.env.TURSO_AUTH_TOKEN = origToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("org_settings: Falla con error explícito si existen IDs duplicados antes de crear el índice", async () => {
  const origUrl = process.env.TURSO_DATABASE_URL;
  const origToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-dup-id-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // Crear tabla existente con IDs duplicados no nulos
    await client.execute(`
      CREATE TABLE org_settings (
        id INTEGER,
        key TEXT,
        value TEXT
      );
    `);
    await client.execute("INSERT INTO org_settings (id, key, value) VALUES (99, 'key1', 'val1'), (99, 'key2', 'val2');");

    resetTursoReadyForTesting();
    await assert.rejects(
      async () => {
        await ensureTursoReady();
      },
      /IDs duplicados|idx_org_settings_id/i,
      "ensureTursoReady debe rechazar la inicialización si existen IDs duplicados"
    );

    // Confirmar que no se eliminaron filas
    const countRes = await client.execute("SELECT count(*) as cnt FROM org_settings;");
    assert.equal(Number(countRes.rows[0]?.cnt || 0), 2, "Los registros duplicados no deben ser borrados automáticamente");
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    if (origUrl !== undefined) process.env.TURSO_DATABASE_URL = origUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origToken !== undefined) process.env.TURSO_AUTH_TOKEN = origToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("org_settings: Falla con error explícito si colisiona con clave reservada 'singleton_config'", async () => {
  const origUrl = process.env.TURSO_DATABASE_URL;
  const origToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-key-collision-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // Esquema legado con clave única 'singleton_config' preexistente e id incompatible
    await client.execute(`
      CREATE TABLE org_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    await client.execute({
      sql: "INSERT INTO org_settings (key, value) VALUES ('singleton_config', 'incompatible_preexistente');",
      args: [],
    });

    resetTursoReadyForTesting();
    await assert.rejects(
      async () => {
        await ensureTursoReady();
      },
      /colisión.*singleton_config|fila singleton obligatoria/i,
      "ensureTursoReady debe fallar si la clave 'singleton_config' ya existía impidiendo crear id = 1"
    );

    // Confirmar que los datos originales no fueron eliminados
    const checkRow = await client.execute("SELECT key, value FROM org_settings WHERE key = 'singleton_config';");
    assert.equal(checkRow.rows.length, 1);
    assert.equal(String(checkRow.rows[0]?.value), "incompatible_preexistente");
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    if (origUrl !== undefined) process.env.TURSO_DATABASE_URL = origUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origToken !== undefined) process.env.TURSO_AUTH_TOKEN = origToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("org_settings: Falla con error explícito si la fila singleton 'id = 1' no existe tras inserción ignorada", async () => {
  const origUrl = process.env.TURSO_DATABASE_URL;
  const origToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-missing-row1-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    await client.execute(`
      CREATE TABLE org_settings (
        key TEXT,
        value TEXT
      );
    `);
    // Trigger que silenciosamente descarta inserciones de id = 1 (simulando INSERT OR IGNORE bloqueado)
    await client.execute(`
      CREATE TRIGGER prevent_id_1 BEFORE INSERT ON org_settings WHEN NEW.id = 1 BEGIN
        SELECT RAISE(IGNORE);
      END;
    `);

    resetTursoReadyForTesting();
    await assert.rejects(
      async () => {
        await ensureTursoReady();
      },
      /no existe la fila singleton obligatoria/i,
      "ensureTursoReady debe fallar si la fila singleton id = 1 no pudo ser creada"
    );
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    if (origUrl !== undefined) process.env.TURSO_DATABASE_URL = origUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origToken !== undefined) process.env.TURSO_AUTH_TOKEN = origToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("org_settings: updateOrgSettings() falla si ninguna fila persistente fue afectada en Turso", async () => {
  const origUrl = process.env.TURSO_DATABASE_URL;
  const origToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-update-zero-rows-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // Eliminar intencionalmente la fila id = 1 para simular que no existe en Turso
    await client.execute("DELETE FROM org_settings WHERE id = 1;");

    await assert.rejects(
      async () => {
        await updateOrgSettings({ botEnabled: "false" });
      },
      /fila singleton.*no existe/i,
      "updateOrgSettings debe rechazar si la fila no existe en la base de datos"
    );
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    if (origUrl !== undefined) process.env.TURSO_DATABASE_URL = origUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origToken !== undefined) process.env.TURSO_AUTH_TOKEN = origToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});
