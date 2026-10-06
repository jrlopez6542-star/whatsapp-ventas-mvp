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
  name: "Mi Tienda",
  tone: "amable, comercial y conciso",
  welcomeMessage: "¡Hola! 👋 Bienvenido. ¿En qué producto estás interesado hoy?",
  rules: "Solo cotiza productos del catálogo activo en pesos colombianos (COP). Si el usuario pide hablar con una persona, escala a humano.",
};

const SEED_PRODUCTS: Product[] = [
  {
    sku: "KIT-INI-01",
    name: "Kit Inicial Emprendedor",
    price: 45000,
    active: true,
    description: "Kit básico para iniciar ventas",
  },
  {
    sku: "BOLSAS-KRAFT-M",
    name: "Bolsas Kraft Medianas (x50)",
    price: 28000,
    active: true,
    description: "Paquete de 50 bolsas kraft tamaño mediano",
  },
  {
    sku: "BOLSAS-KRAFT-G",
    name: "Bolsas Kraft Grandes (x50)",
    price: 38000,
    active: true,
    description: "Paquete de 50 bolsas kraft tamaño grande",
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

  createOrder(conversationId: string, items: OrderItem[], total: number): Order {
    const order: Order = {
      id: randomUUID(),
      conversationId,
      status: "pending",
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

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isTursoConfigured()) {
    return getMemoryStore().getConversation(id);
  }
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute({
      sql: "SELECT id, phone, status, created_at, updated_at FROM conversations WHERE id = ? LIMIT 1",
      args: [id],
    });
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return {
      id: String(r.id),
      phone: String(r.phone),
      status: (r.status as ConversationStatus) || "bot",
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  } catch {
    return getMemoryStore().getConversation(id);
  }
}

export async function getOrCreateConversation(id: string): Promise<Conversation> {
  const existing = await getConversation(id);
  if (existing) return existing;

  const now = Date.now();
  const c: Conversation = { id, phone: id, status: "bot", createdAt: now, updatedAt: now };

  if (!isTursoConfigured()) {
    getMemoryStore().conversations.set(id, c);
    return c;
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    await client.execute({
      sql: `INSERT INTO conversations (id, phone, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      args: [id, id, "bot", now, now],
    });
    return c;
  } catch {
    return getMemoryStore().getOrCreateConversation(id);
  }
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
    } catch {
      // fallback handled
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
      await client.execute({
        sql: `INSERT INTO messages (id, conversation_id, role, content, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [memoryMsg.id, conversationId, role, content, memoryMsg.createdAt],
      });
      await client.execute({
        sql: "UPDATE conversations SET updated_at = ? WHERE id = ?",
        args: [Date.now(), conversationId],
      });
    } catch {
      // fallback handled
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
    const res = await client.execute({
      sql: "SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      args: [conversationId],
    });
    return res.rows.map((r: any) => ({
      id: String(r.id),
      conversationId: String(r.conversation_id),
      role: r.role as "user" | "assistant" | "system",
      content: String(r.content),
      createdAt: Number(r.created_at),
    }));
  } catch {
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
  total: number
): Promise<Order> {
  const memOrder = getMemoryStore().createOrder(conversationId, items, total);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: "INSERT INTO orders (id, conversation_id, status, total, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [memOrder.id, conversationId, memOrder.status, total, memOrder.createdAt],
      });
      for (const it of items) {
        await client.execute({
          sql: "INSERT INTO order_items (id, order_id, sku, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
          args: [randomUUID(), memOrder.id, it.sku, it.quantity, it.unitPrice],
        });
      }
    } catch {
      // fallback
    }
  }
  return memOrder;
}

export async function getOrders(): Promise<Order[]> {
  if (!isTursoConfigured()) {
    return getMemoryStore().getOrders();
  }
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute("SELECT id, conversation_id, status, total, created_at FROM orders ORDER BY created_at DESC");
    return res.rows.map((r: any) => ({
      id: String(r.id),
      conversationId: String(r.conversation_id),
      status: (r.status as Order["status"]) || "pending",
      total: Number(r.total),
      createdAt: Number(r.created_at),
    }));
  } catch {
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
