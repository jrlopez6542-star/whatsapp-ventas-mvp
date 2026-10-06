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
  })().catch((err: unknown) => {
    initializedPromise = null;
    throw err;
  });

  return initializedPromise;
}
