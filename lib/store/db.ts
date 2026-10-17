let cachedClient: any = null;
let initializedPromise: Promise<void> | null = null;

/**
 * Detecta si la ejecución actual corresponde al entorno Preview de Vercel.
 */
export function isPreviewEnvironment(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" ||
    (Boolean(process.env.VERCEL) && process.env.VERCEL_ENV !== "production")
  );
}

/**
 * Valida el acceso a Turso según el entorno de ejecución.
 * En Preview, exige autorización explícita (TURSO_ENVIRONMENT='sandbox' | 'preview' | 'test' o ALLOW_TURSO_IN_PREVIEW='true')
 * y bloquea por fallo seguro cualquier intento de conexión a URLs con indicadores de producción.
 */
export function validateTursoEnvironmentAccess(url?: string): { allowed: boolean; reason?: string } {
  const targetUrl = (
    url ||
    (isPreviewEnvironment() && process.env.TURSO_DATABASE_URL_PREVIEW) ||
    process.env.TURSO_DATABASE_URL ||
    ""
  )
    .trim()
    .toLowerCase();

  if (!targetUrl) {
    return { allowed: false, reason: "missing_url" };
  }

  const isPreview = isPreviewEnvironment();
  if (isPreview) {
    // 1. Verificación explícita de entorno (no confiar únicamente en el nombre de la URL)
    const envFlag = (process.env.TURSO_ENVIRONMENT || "").trim().toLowerCase();
    const allowPreview =
      envFlag === "preview" ||
      envFlag === "sandbox" ||
      envFlag === "test" ||
      process.env.ALLOW_TURSO_IN_PREVIEW === "true";

    if (!allowPreview) {
      return {
        allowed: false,
        reason:
          "Entorno Preview detectado sin configuración explícita para Turso. Configure TURSO_ENVIRONMENT='sandbox' o 'preview' para autorizar el uso de una base de datos no productiva.",
      };
    }

    // 2. Fallo seguro (defensa en profundidad contra URLs de producción)
    const hasProdIndicator =
      targetUrl.includes("bunuelandia-prod") ||
      targetUrl.includes("-prod.") ||
      targetUrl.includes("_prod.") ||
      targetUrl.includes("/production") ||
      (targetUrl.includes("prod") && !targetUrl.includes("sandbox") && !targetUrl.includes("test"));

    if (hasProdIndicator) {
      return {
        allowed: false,
        reason:
          "La URL de Turso configurada contiene indicadores de producción. Conexión rechazada en Preview por fallo seguro.",
      };
    }
  }

  return { allowed: true };
}

export function isTursoConfigured(): boolean {
  if (cachedClient) return true;

  const isPreview = isPreviewEnvironment();
  const url = isPreview && process.env.TURSO_DATABASE_URL_PREVIEW?.trim()
    ? process.env.TURSO_DATABASE_URL_PREVIEW.trim()
    : process.env.TURSO_DATABASE_URL?.trim();
  const authToken = isPreview && process.env.TURSO_AUTH_TOKEN_PREVIEW?.trim()
    ? process.env.TURSO_AUTH_TOKEN_PREVIEW.trim()
    : process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url || !authToken) return false;

  const validation = validateTursoEnvironmentAccess(url);
  return validation.allowed;
}

export function getTursoClient(): any {
  if (cachedClient) return cachedClient;

  const isPreview = isPreviewEnvironment();
  const url = isPreview && process.env.TURSO_DATABASE_URL_PREVIEW?.trim()
    ? process.env.TURSO_DATABASE_URL_PREVIEW.trim()
    : process.env.TURSO_DATABASE_URL?.trim();
  const authToken = isPreview && process.env.TURSO_AUTH_TOKEN_PREVIEW?.trim()
    ? process.env.TURSO_AUTH_TOKEN_PREVIEW.trim()
    : process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url || !authToken) {
    throw new Error("Turso no está configurado (faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN)");
  }

  const validation = validateTursoEnvironmentAccess(url);
  if (!validation.allowed) {
    throw new Error(`[SECURITY FATAL] ${validation.reason}`);
  }

  // Dynamic import/require so environments without @libsql/client can still run memory mode/tests
  const { createClient } = require("@libsql/client");

  cachedClient = createClient({
    url,
    authToken,
  });

  return cachedClient;
}

export function setTursoClientForTesting(client: any): void {
  cachedClient = client;
}

export async function ensureTursoReady(): Promise<void> {
  if (!isTursoConfigured()) return;
  if (initializedPromise) return initializedPromise;

  initializedPromise = (async () => {
    const client = getTursoClient();

    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS outbound_conversation_locks (
          conversation_key TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          locked_until INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS webhook_receipts (
          id TEXT PRIMARY KEY,
          received_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          phone TEXT NOT NULL,
          customer_name TEXT,
          status TEXT NOT NULL DEFAULT 'bot',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS products (
          sku TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          price INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          description TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          customer_name TEXT,
          delivery_address TEXT,
          payment_method TEXT,
          items_summary TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          total INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          sku TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price INTEGER NOT NULL,
          created_at INTEGER DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS org_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS system_logs (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          module TEXT NOT NULL,
          message TEXT NOT NULL,
          details TEXT,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'operator',
          name TEXT NOT NULL,
          phone TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at INTEGER NOT NULL,
          user_agent TEXT,
          ip_address TEXT,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS password_resets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at INTEGER NOT NULL,
          used_at INTEGER,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS revoked_tokens (
          token_hash TEXT PRIMARY KEY,
          revoked_at INTEGER NOT NULL
        )`,
      ],
      "write"
    );

    // Safely apply alterations for existing databases individually
    const alterOrders = [
      "customer_name TEXT",
      "delivery_address TEXT",
      "payment_method TEXT",
      "items_summary TEXT",
      "total INTEGER DEFAULT 0",
      "status TEXT DEFAULT 'confirmed'",
      "created_at INTEGER DEFAULT 0",
      "conversation_id TEXT",
      "delivery_fee INTEGER DEFAULT 0",
      "change_amount TEXT",
      "delivery_notes TEXT",
      "invoice_number TEXT",
      "invoice_id TEXT",
      "invoice_url TEXT",
      "customer_phone TEXT",
      "driver_notified TEXT",
      "driver_notified_at INTEGER DEFAULT 0",
    ];
    for (const col of alterOrders) {
      try {
        await client.execute(`ALTER TABLE orders ADD COLUMN ${col};`);
      } catch {
        // Ignored if column already exists
      }
    }

    const alterOrderItems = [
      "order_id TEXT",
      "sku TEXT",
      "quantity INTEGER DEFAULT 1",
      "unit_price INTEGER DEFAULT 0",
      "created_at INTEGER DEFAULT 0",
    ];
    for (const col of alterOrderItems) {
      try {
        await client.execute(`ALTER TABLE order_items ADD COLUMN ${col};`);
      } catch {
        // Ignored if column already exists
      }
    }
    // Safely migrate any legacy column names if present by detecting them via PRAGMA
    try {
      const tableInfo = await client.execute("PRAGMA table_info(order_items);");
      const existingCols = new Set(
        (tableInfo.rows || []).map((r: any) => String(r.name || r[1] || "").toLowerCase())
      );
      if (existingCols.has("qty")) {
        await client.execute(
          "UPDATE order_items SET quantity = qty WHERE (quantity IS NULL OR quantity = 1) AND qty IS NOT NULL;"
        );
      }
      if (existingCols.has("count")) {
        await client.execute(
          "UPDATE order_items SET quantity = count WHERE (quantity IS NULL OR quantity = 1) AND count IS NOT NULL;"
        );
      }
      if (existingCols.has("price")) {
        await client.execute(
          "UPDATE order_items SET unit_price = price WHERE (unit_price IS NULL OR unit_price = 0) AND price IS NOT NULL;"
        );
      }
    } catch {
      // Fallback seguro si PRAGMA no está disponible
      try {
        await client.execute("UPDATE order_items SET quantity = qty WHERE (quantity IS NULL OR quantity = 1) AND qty IS NOT NULL;");
      } catch {}
      try {
        await client.execute("UPDATE order_items SET quantity = count WHERE (quantity IS NULL OR quantity = 1) AND count IS NOT NULL;");
      } catch {}
      try {
        await client.execute("UPDATE order_items SET unit_price = price WHERE (unit_price IS NULL OR unit_price = 0) AND price IS NOT NULL;");
      } catch {}
    }

    const alterConversations = [
      "phone TEXT",
      "from_wa TEXT",
      "customer_name TEXT",
      "status TEXT DEFAULT 'bot'",
      "created_at INTEGER DEFAULT 0",
      "updated_at INTEGER DEFAULT 0",
    ];
    for (const col of alterConversations) {
      try {
        await client.execute(`ALTER TABLE conversations ADD COLUMN ${col};`);
      } catch {}
    }

    const alterMessages = [
      "conversation_id TEXT",
      "role TEXT",
      "content TEXT",
      "created_at INTEGER DEFAULT 0",
      "delivery_status TEXT DEFAULT 'pending'",
      "provider_message_id TEXT",
      "error_details TEXT",
      "updated_at INTEGER DEFAULT 0",
    ];
    for (const col of alterMessages) {
      try {
        await client.execute(`ALTER TABLE messages ADD COLUMN ${col};`);
      } catch {}
    }

    const alterWebhookReceipts = [
      "status TEXT DEFAULT 'completed'",
      "completed_at INTEGER DEFAULT 0",
      "error TEXT",
      "order_id TEXT",
    ];
    for (const col of alterWebhookReceipts) {
      try {
        await client.execute(`ALTER TABLE webhook_receipts ADD COLUMN ${col};`);
      } catch {}
    }

    const alterOrgSettings = [
      "business_name TEXT",
      "tone TEXT",
      "welcome_message TEXT",
      "rules TEXT",
      "business_hours_enabled TEXT",
      "business_hours_start TEXT",
      "business_hours_end TEXT",
      "out_of_hours_message TEXT",
      "extra_prompt TEXT",
      "bot_objective TEXT",
      "transfer_qr_image TEXT",
      "nequi_number TEXT",
      "breb_key TEXT",
      "delivery_fee INTEGER DEFAULT 0",
      "free_delivery_threshold INTEGER DEFAULT 0",
      "estimated_delivery_time TEXT",
      "bot_enabled TEXT DEFAULT 'true'",
      "upsell_drinks_enabled TEXT DEFAULT 'true'",
      "delivery_driver_phone TEXT",
      "delivery_driver_notify_enabled TEXT DEFAULT 'true'",
      "auto_pause_on_mobile_reply TEXT DEFAULT 'true'",
      "business_city TEXT DEFAULT 'Tocancipá, Cundinamarca'",
      "coverage_area TEXT DEFAULT 'Tocancipá y alrededores'",
    ];
    for (const col of alterOrgSettings) {
      try {
        await client.execute(`ALTER TABLE org_settings ADD COLUMN ${col};`);
      } catch {}
    }

    // One-time data repair for legacy databases (fix 0/epoch-1969 dates and null phone columns).
    // We track completion in _db_meta so this NEVER runs more than once even across serverless cold starts.
    try {
      await client.execute(`CREATE TABLE IF NOT EXISTS _db_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      const metaRow = await client.execute(`SELECT value FROM _db_meta WHERE key = 'repair_v1_done'`);
      const repairAlreadyDone = metaRow.rows.length > 0;
      if (!repairAlreadyDone) {
        const nowMs = Date.now();
        await client.execute(`UPDATE conversations SET updated_at = ${nowMs} WHERE updated_at IS NULL OR updated_at <= 86400000`);
        await client.execute(`UPDATE conversations SET created_at = updated_at WHERE created_at IS NULL OR created_at <= 86400000`);
        await client.execute(`UPDATE messages SET created_at = ${nowMs} WHERE created_at IS NULL OR created_at <= 86400000`);
        await client.execute(`UPDATE orders SET created_at = ${nowMs} WHERE created_at IS NULL OR created_at <= 86400000`);
        await client.execute(`UPDATE conversations SET phone = from_wa WHERE (phone IS NULL OR phone = '') AND from_wa IS NOT NULL`);
        await client.execute(`UPDATE conversations SET from_wa = phone WHERE (from_wa IS NULL OR from_wa = '') AND phone IS NOT NULL`);
        await client.execute(`INSERT OR IGNORE INTO _db_meta (key, value) VALUES ('repair_v1_done', '1')`);
        console.log("[db] one-time data repair completed");
      }
    } catch (repairErr) {
      console.warn("[db data repair notice]", repairErr);
    }
  })().catch((err: unknown) => {
    initializedPromise = null;
    throw err;
  });

  return initializedPromise;
}
