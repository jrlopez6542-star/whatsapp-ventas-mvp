import { randomUUID } from "crypto";
import { ensureTursoReady, getTursoClient, isTursoConfigured } from "./db";

export type ConversationStatus = "bot" | "human" | "closed";

export interface Conversation {
  id: string;
  phone: string;
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface Product {
  sku: string;
  name: string;
  price: number; // en COP
  active: boolean;
  description?: string;
}

export interface OrderItem {
  id?: string;
  orderId?: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  conversationId: string;
  customerName?: string;
  deliveryAddress?: string;
  paymentMethod?: string;
  itemsSummary?: string;
  status: "pending" | "confirmed" | "cancelled";
  total: number;
  items?: OrderItem[];
  createdAt: number;
}

export interface OrgSettings {
  name: string;
  tone: string;
  welcomeMessage: string;
  rules: string;
}

const DEFAULT_SETTINGS: OrgSettings = {
  name: "BUÑUELANDIA",
  tone: "amable, alegre, antojador y vendedor",
  welcomeMessage: "¡Hola! 🤤 Bienvenido a *BUÑUELANDIA*. Los mejores buñuelos frescos, crujientes y calienticos recién hechos. ¿Te gustaría ver nuestro menú de buñuelos y cajas?",
  rules: "Ofrece el catálogo oficial de BUÑUELANDIA. Para pedidos confirma: productos y cantidades, nombre completo del cliente, dirección exacta de entrega y medio de pago (Nequi, Daviplata o Efectivo contra entrega). Si solicitan hablar con una persona, escala a humano.",
};

const SEED_PRODUCTS: Product[] = [
  {
    sku: "BM",
    name: "Buñuelo Mora",
    price: 4500,
    active: true,
    description: "Buñuelo caliente relleno con dulce de mora artesanal",
  },
  {
    sku: "BA",
    name: "Buñuelo Arequipe",
    price: 4500,
    active: true,
    description: "Buñuelo caliente relleno de exquisito arequipe",
  },
  {
    sku: "BQ",
    name: "Buñuelo Queso",
    price: 4500,
    active: true,
    description: "Buñuelo caliente relleno con queso derretido",
  },
  {
    sku: "BC",
    name: "Buñuelo Costeño",
    price: 4500,
    active: true,
    description: "Buñuelo tradicional con auténtico queso costeño",
  },
  {
    sku: "C4T",
    name: "CAJA x4 Tradicional",
    price: 16000,
    active: true,
    description: "Caja de 4 buñuelos tradicionales dorados y crujientes",
  },
  {
    sku: "C8T",
    name: "CAJA x8 Tradicional",
    price: 32000,
    active: true,
    description: "Caja familiar de 8 buñuelos tradicionales",
  },
  {
    sku: "C4S",
    name: "CAJA x4 Surtida",
    price: 18000,
    active: true,
    description: "Caja de 4 buñuelos surtidos rellenos a elección (Mora, Arequipe, Queso)",
  },
  {
    sku: "C8S",
    name: "CAJA x8 Surtida",
    price: 36000,
    active: true,
    description: "Caja de 8 buñuelos surtidos rellenos a elección",
  },
];


// --- In-Memory Store Fallback ---
class MemoryStore {
  conversations = new Map<string, Conversation>();
  messages: Message[] = [];
  products = new Map<string, Product>();
  orders = new Map<string, Order>();
  settings: OrgSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    for (const p of SEED_PRODUCTS) {
      this.products.set(p.sku, p);
    }
  }

  getConversation(id: string): Conversation | null {
    return this.conversations.get(id) || null;
  }

  getOrCreateConversation(id: string): Conversation {
    let c = this.conversations.get(id);
    if (!c) {
      const now = Date.now();
      c = { id, phone: id, status: "bot", createdAt: now, updatedAt: now };
      this.conversations.set(id, c);
    }
    return c;
  }

  setConversationStatus(id: string, status: ConversationStatus): void {
    const c = this.getOrCreateConversation(id);
    c.status = status;
    c.updatedAt = Date.now();
  }

  deleteConversation(id: string): void {
    this.conversations.delete(id);
    this.messages = this.messages.filter((m) => m.conversationId !== id);
  }

  appendMessage(conversationId: string, role: "user" | "assistant" | "system", content: string): Message {
    const c = this.getOrCreateConversation(conversationId);
    c.updatedAt = Date.now();
    const msg: Message = {
      id: randomUUID(),
      conversationId,
      role,
      content,
      createdAt: Date.now(),
    };
    this.messages.push(msg);
    return msg;
  }

  getMessages(conversationId: string): Message[] {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }

  getProducts(activeOnly = true): Product[] {
    const list = Array.from(this.products.values());
    return activeOnly ? list.filter((p) => p.active) : list;
  }

  getProduct(sku: string): Product | null {
    return this.products.get(sku) || null;
  }

  upsertProduct(product: Product): void {
    this.products.set(product.sku, product);
  }

  createOrder(
    conversationId: string,
    items: OrderItem[],
    total: number,
    details?: { customerName?: string; deliveryAddress?: string; paymentMethod?: string; itemsSummary?: string }
  ): Order {
    const order: Order = {
      id: randomUUID(),
      conversationId,
      customerName: details?.customerName,
      deliveryAddress: details?.deliveryAddress,
      paymentMethod: details?.paymentMethod,
      itemsSummary: details?.itemsSummary,
      status: "confirmed",
      total,
      items,
      createdAt: Date.now(),
    };
    this.orders.set(order.id, order);
    return order;
  }

  getOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  getOrgSettings(): OrgSettings {
    return this.settings;
  }

  updateOrgSettings(patch: Partial<OrgSettings>): OrgSettings {
    this.settings = { ...this.settings, ...patch };
    return this.settings;
  }
}

declare global {
  var __whatsappMemoryStore: MemoryStore | undefined;
}

function getMemoryStore(): MemoryStore {
  if (!globalThis.__whatsappMemoryStore) {
    globalThis.__whatsappMemoryStore = new MemoryStore();
  }
  return globalThis.__whatsappMemoryStore;
}

// --- Store Exports with Turso / Memory dispatch ---

export function parseTimestamp(raw: unknown): number {
  if (raw == null) return Date.now();
  if (typeof raw === "number") {
    if (raw <= 86400000) return Date.now(); // 0 or epoch 1970
    if (raw < 10000000000) return raw * 1000; // was in unix seconds
    return raw;
  }
  const str = String(raw).trim();
  if (!str || str === "0") return Date.now();
  const num = Number(str);
  if (!isNaN(num)) {
    if (num <= 86400000) return Date.now();
    if (num < 10000000000) return num * 1000;
    return num;
  }
  const parsed = Date.parse(str);
  if (!isNaN(parsed) && parsed > 86400000) return parsed;
  return Date.now();
}

export function decodeWhatsappIdentifier(val: string): string {
  if (!val) return "";
  let s = String(val).trim();
  if (/^[A-Za-z0-9+/=]{20,}$/.test(s) && (s.startsWith("d2hh") || s.length % 4 === 0)) {
    try {
      const decoded = Buffer.from(s, "base64").toString("utf8");
      if (decoded.startsWith("whatsapp:") || decoded.startsWith("+") || /^\d+$/.test(decoded)) {
        return decoded;
      }
    } catch {}
  }
  return s;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isTursoConfigured()) {
    return getMemoryStore().getConversation(id);
  }
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const decoded = decodeWhatsappIdentifier(id);
    const encoded = Buffer.from(id).toString("base64");
    const bare = id.replace(/^whatsapp:/i, "");
    const candidates = Array.from(new Set([id, decoded, encoded, bare])).filter(Boolean);
    const placeholders = candidates.map(() => "?").join(",");

    const res = await client.execute({
      sql: `SELECT * FROM conversations WHERE id IN (${placeholders}) OR phone IN (${placeholders}) OR from_wa IN (${placeholders}) ORDER BY updated_at DESC LIMIT 1`,
      args: [...candidates, ...candidates, ...candidates],
    });
    if (!res.rows.length) return null;
    const r = res.rows[0];
    const rawPhone = String(r.phone || r.from_wa || r.id);
    return {
      id: String(r.id),
      phone: decodeWhatsappIdentifier(rawPhone) || rawPhone,
      status: (r.status as ConversationStatus) || "bot",
      createdAt: parseTimestamp(r.created_at),
      updatedAt: parseTimestamp(r.updated_at),
    };
  } catch {
    return getMemoryStore().getConversation(id);
  }
}

export async function getOrCreateConversation(id: string): Promise<Conversation> {
  const existing = await getConversation(id);
  if (existing) return existing;

  const now = Date.now();
  const decoded = decodeWhatsappIdentifier(id);
  const phoneVal = decoded || id;
  const c: Conversation = { id, phone: phoneVal, status: "bot", createdAt: now, updatedAt: now };

  if (!isTursoConfigured()) {
    getMemoryStore().conversations.set(id, c);
    return c;
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    try {
      await client.execute({
        sql: `INSERT INTO conversations (id, phone, from_wa, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, phone = excluded.phone, from_wa = excluded.from_wa`,
        args: [id, phoneVal, phoneVal, "bot", now, now],
      });
    } catch {
      await client.execute({
        sql: `INSERT INTO conversations (id, phone, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, phone = excluded.phone`,
        args: [id, phoneVal, "bot", now, now],
      });
    }
    return c;
  } catch (err) {
    console.error("[store] getOrCreateConversation Turso error:", err);
    return getMemoryStore().getOrCreateConversation(id);
  }
}

export async function deleteConversation(id: string): Promise<boolean> {
  getMemoryStore().deleteConversation(id);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      const decoded = decodeWhatsappIdentifier(id);
      const encoded = Buffer.from(id).toString("base64");
      const bare = id.replace(/^whatsapp:/i, "");
      const candidates = Array.from(new Set([id, decoded, encoded, bare])).filter(Boolean);
      const placeholders = candidates.map(() => "?").join(",");
      await client.execute({
        sql: `DELETE FROM messages WHERE conversation_id IN (${placeholders})`,
        args: candidates,
      }).catch(() => {});
      await client.execute({
        sql: `DELETE FROM conversations WHERE id IN (${placeholders}) OR phone IN (${placeholders}) OR from_wa IN (${placeholders})`,
        args: [...candidates, ...candidates, ...candidates],
      }).catch(() => {});
      return true;
    } catch (err) {
      console.error("[store] deleteConversation Turso error:", err);
    }
  }
  return true;
}

export async function setConversationStatus(id: string, status: ConversationStatus): Promise<void> {
  getMemoryStore().setConversationStatus(id, status);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?",
        args: [status, Date.now(), id],
      });
    } catch (err) {
      console.error("[store] setConversationStatus Turso error:", err);
    }
  }
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<Message> {
  const memoryMsg = getMemoryStore().appendMessage(conversationId, role, content);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      try {
        await client.execute({
          sql: `INSERT INTO messages (id, conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?, ?)`,
          args: [memoryMsg.id, conversationId, role, content, memoryMsg.createdAt],
        });
      } catch {
        // Fallback if id is auto-increment integer or created_at is text
        await client.execute({
          sql: `INSERT INTO messages (conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?)`,
          args: [conversationId, role, content, new Date(memoryMsg.createdAt).toISOString()],
        }).catch(async () => {
          await client.execute({
            sql: `INSERT INTO messages (conversation_id, role, content, created_at)
                  VALUES (?, ?, ?, ?)`,
            args: [conversationId, role, content, memoryMsg.createdAt],
          });
        });
      }
      await client.execute({
        sql: "UPDATE conversations SET updated_at = ? WHERE id = ?",
        args: [Date.now(), conversationId],
      }).catch(() => {});
    } catch (err) {
      console.error("[store] appendMessage Turso error:", err);
    }
  }
  return memoryMsg;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  if (!isTursoConfigured()) {
    return getMemoryStore().getMessages(conversationId);
  }
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const decoded = decodeWhatsappIdentifier(conversationId);
    const encoded = Buffer.from(conversationId).toString("base64");
    const bare = conversationId.replace(/^whatsapp:/i, "");
    const candidates = Array.from(new Set([conversationId, decoded, encoded, bare])).filter(Boolean);
    const placeholders = candidates.map(() => "?").join(",");
    const res = await client.execute({
      sql: `SELECT * FROM messages WHERE conversation_id IN (${placeholders}) ORDER BY rowid ASC`,
      args: candidates,
    });
    return res.rows.map((r: any) => ({
      id: String(r.id || r.rowid || randomUUID()),
      conversationId: String(r.conversation_id || conversationId),
      role: (r.role as "user" | "assistant" | "system") || "user",
      content: String(r.content || ""),
      createdAt: parseTimestamp(r.created_at),
    }));
  } catch (err) {
    console.error("[store] getMessages Turso error:", err);
    return getMemoryStore().getMessages(conversationId);
  }
}

export async function getProducts(activeOnly = true): Promise<Product[]> {
  if (!isTursoConfigured()) {
    return getMemoryStore().getProducts(activeOnly);
  }
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const sql = activeOnly
      ? "SELECT sku, name, price, active, description FROM products WHERE active = 1"
      : "SELECT sku, name, price, active, description FROM products";
    const res = await client.execute(sql);
    if (!res.rows.length) {
      // Seed initial products if DB empty
      for (const p of SEED_PRODUCTS) {
        await client.execute({
          sql: "INSERT OR IGNORE INTO products (sku, name, price, active, description) VALUES (?, ?, ?, ?, ?)",
          args: [p.sku, p.name, p.price, p.active ? 1 : 0, p.description || ""],
        });
      }
      return SEED_PRODUCTS;
    }
    return res.rows.map((r: any) => ({
      sku: String(r.sku),
      name: String(r.name),
      price: Number(r.price),
      active: Number(r.active) === 1,
      description: r.description ? String(r.description) : undefined,
    }));
  } catch {
    return getMemoryStore().getProducts(activeOnly);
  }
}

export async function getProduct(sku: string): Promise<Product | null> {
  const products = await getProducts(false);
  return products.find((p) => p.sku.toUpperCase() === sku.toUpperCase()) || null;
}

export async function upsertProduct(product: Product): Promise<void> {
  getMemoryStore().upsertProduct(product);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: `INSERT INTO products (sku, name, price, active, description)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(sku) DO UPDATE SET
                name = excluded.name,
                price = excluded.price,
                active = excluded.active,
                description = excluded.description`,
        args: [
          product.sku,
          product.name,
          product.price,
          product.active ? 1 : 0,
          product.description || "",
        ],
      });
    } catch {
      // fallback
    }
  }
}

export async function createOrder(
  conversationId: string,
  items: OrderItem[],
  total: number,
  details?: { customerName?: string; deliveryAddress?: string; paymentMethod?: string; itemsSummary?: string }
): Promise<Order> {
  const memOrder = getMemoryStore().createOrder(conversationId, items, total, details);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: `INSERT INTO orders (id, conversation_id, customer_name, delivery_address, payment_method, items_summary, status, total, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          memOrder.id,
          conversationId,
          details?.customerName || null,
          details?.deliveryAddress || null,
          details?.paymentMethod || null,
          details?.itemsSummary || null,
          memOrder.status,
          total,
          memOrder.createdAt,
        ],
      });
      try {
        for (const it of items) {
          await client.execute({
            sql: "INSERT INTO order_items (id, order_id, sku, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
            args: [randomUUID(), memOrder.id, it.sku, it.quantity, it.unitPrice],
          });
        }
      } catch (itemErr) {
        console.warn("[store] order_items insert warning:", itemErr);
      }
    } catch (err) {
      console.error("[store] createOrder Turso error:", err);
    }
  }
  return memOrder;
}

export async function deleteOrder(id: string): Promise<void> {
  getMemoryStore().orders.delete(id);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({ sql: "DELETE FROM orders WHERE id = ?", args: [id] });
    } catch (err) {
      console.error("[store] deleteOrder error:", err);
    }
  }
}

export async function getOrders(): Promise<Order[]> {
  if (!isTursoConfigured()) {
    return getMemoryStore().getOrders();
  }
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );
    return res.rows.map((r: any) => ({
      id: String(r.id),
      conversationId: String(r.conversation_id || r.conversationId || ""),
      customerName: r.customer_name ? String(r.customer_name) : undefined,
      deliveryAddress: r.delivery_address ? String(r.delivery_address) : undefined,
      paymentMethod: r.payment_method ? String(r.payment_method) : undefined,
      itemsSummary: r.items_summary ? String(r.items_summary) : undefined,
      status: (r.status as Order["status"]) || "confirmed",
      total: Number(r.total ?? r.amount ?? 0),
      createdAt: Number(r.created_at || Date.now()),
    }));
  } catch (err) {
    console.error("[store] getOrders Turso query failed:", err);
    return getMemoryStore().getOrders();
  }
}

export async function getOrgSettings(): Promise<OrgSettings> {
  if (!isTursoConfigured()) {
    return getMemoryStore().getOrgSettings();
  }
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute("SELECT key, value FROM org_settings");
    if (!res.rows.length) return DEFAULT_SETTINGS;
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of res.rows) {
      const k = String(row.key);
      const v = String(row.value);
      if (k === "name") settings.name = v;
      if (k === "tone") settings.tone = v;
      if (k === "welcomeMessage") settings.welcomeMessage = v;
      if (k === "rules") settings.rules = v;
    }
    return settings;
  } catch {
    return getMemoryStore().getOrgSettings();
  }
}

export async function updateOrgSettings(patch: Partial<OrgSettings>): Promise<OrgSettings> {
  const updated = getMemoryStore().updateOrgSettings(patch);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      for (const [k, v] of Object.entries(patch)) {
        if (v != null) {
          await client.execute({
            sql: `INSERT INTO org_settings (key, value) VALUES (?, ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            args: [k, String(v)],
          });
        }
      }
    } catch {
      // fallback
    }
  }
  return updated;
}
