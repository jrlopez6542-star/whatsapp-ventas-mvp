let cachedClient: any = null;
let initializedPromise: Promise<void> | null = null;

export function isTursoConfigured(): boolean {
  return Boolean(
    process.env.TURSO_DATABASE_URL?.trim() &&
      process.env.TURSO_AUTH_TOKEN?.trim()
  );
}

export function getTursoClient(): any {
  if (cachedClient) return cachedClient;

  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url || !authToken) {
    throw new Error("Turso no está configurado (faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN)");
  }

  // Dynamic import/require so environments without @libsql/client can still run memory mode/tests
  const { createClient } = require("@libsql/client");

  cachedClient = createClient({
    url,
    authToken,
  });

  return cachedClient;
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
          unit_price INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS org_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
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
    ];
    for (const col of alterOrders) {
      try {
        await client.execute(`ALTER TABLE orders ADD COLUMN ${col};`);
      } catch {
        // Ignored if column already exists
      }
    }

    const alterConversations = [
      "phone TEXT",
      "from_wa TEXT",
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
    ];
    for (const col of alterMessages) {
      try {
        await client.execute(`ALTER TABLE messages ADD COLUMN ${col};`);
      } catch {}
    }

    // Data repair for legacy databases (fix 0/epoch-1969 dates and null phone columns)
    try {
      const nowMs = Date.now();
      await client.execute(`UPDATE conversations SET updated_at = ${nowMs} WHERE updated_at IS NULL OR updated_at <= 86400000;`);
      await client.execute(`UPDATE conversations SET created_at = updated_at WHERE created_at IS NULL OR created_at <= 86400000;`);
      await client.execute(`UPDATE messages SET created_at = ${nowMs} WHERE created_at IS NULL OR created_at <= 86400000;`);
      await client.execute(`UPDATE orders SET created_at = ${nowMs} WHERE created_at IS NULL OR created_at <= 86400000;`);
      await client.execute(`UPDATE conversations SET phone = from_wa WHERE (phone IS NULL OR phone = '') AND from_wa IS NOT NULL;`);
      await client.execute(`UPDATE conversations SET from_wa = phone WHERE (from_wa IS NULL OR from_wa = '') AND phone IS NOT NULL;`);
    } catch (repairErr) {
      console.warn("[db data repair notice]", repairErr);
    }

    try {
      const cRows = (await client.execute("PRAGMA table_info(conversations);")).rows;
      const mRows = (await client.execute("PRAGMA table_info(messages);")).rows;
      const oRows = (await client.execute("PRAGMA table_info(orders);")).rows;
      console.log("[db schema conversations]", JSON.stringify(cRows));
      console.log("[db schema messages]", JSON.stringify(mRows));
      console.log("[db schema orders]", JSON.stringify(oRows));
    } catch {}
  })().catch((err: unknown) => {
    initializedPromise = null;
    throw err;
  });

  return initializedPromise;
}
