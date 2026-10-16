import { randomUUID } from "crypto";
import { ensureTursoReady, getTursoClient, isTursoConfigured, setTursoClientForTesting } from "./db";
export { setTursoClientForTesting, isTursoConfigured };

export type ConversationStatus = "bot" | "human" | "closed";

export interface Conversation {
  id: string;
  phone: string;
  customerName?: string;
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
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
  name?: string;
}

export type OrderStatus = "pending" | "confirmed" | "preparing" | "delivering" | "delivered" | "cancelled";

export interface Order {
  id: string;
  conversationId: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  paymentMethod?: string;
  itemsSummary?: string;
  deliveryFee?: number;
  changeAmount?: string;
  deliveryNotes?: string;
  status: OrderStatus;
  total: number;
  items?: OrderItem[];
  invoiceNumber?: string;
  invoiceId?: string;
  invoiceUrl?: string;
  invoicePdfUrl?: string;
  driverNotified?: string;
  driverNotifiedAt?: number;
  createdAt: number;
}

export interface OrgSettings {
  name: string;
  tone: string;
  welcomeMessage: string;
  businessCity?: string;
  coverageArea?: string;
  businessHoursEnabled?: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  outOfHoursMessage?: string;
  extraPrompt?: string;
  botObjective?: string;
  rules: string;
  transferQrImage?: string;
  nequiNumber?: string;
  brebKey?: string;
  deliveryFee?: string;
  freeDeliveryThreshold?: string;
  estimatedDeliveryTime?: string;
  botEnabled?: string;
  upsellDrinksEnabled?: string;
  deliveryDriverPhone?: string;
  deliveryDriverNotifyEnabled?: string;
  autoPauseOnMobileReply?: string;
}

const DEFAULT_SETTINGS: OrgSettings = {
  name: "BUÑUELANDIA",
  tone: "amable, alegre, antojador y vendedor",
  businessCity: "Tocancipá, Cundinamarca",
  coverageArea: "Tocancipá y alrededores",
  businessHoursEnabled: "false",
  businessHoursStart: "08:00",
  businessHoursEnd: "20:00",
  outOfHoursMessage: "¡Hola! En este momento nos encontramos cerrados. 🌙 Te atenderemos con gusto en nuestro horario de atención. 🥟",
  extraPrompt: "",
  botObjective: "Vender la mayor cantidad de cajas de buñuelos posibles y recolectar dirección y método de pago en Tocancipá y alrededores.",
  welcomeMessage: "¡Hola! 🤤 Bienvenido a *BUÑUELANDIA*. Los mejores buñuelos frescos, crujientes y calienticos recién hechos en Tocancipá. ¿Te gustaría ver nuestro menú de buñuelos y cajas?",
  rules: "Ofrece el catálogo oficial de BUÑUELANDIA. El negocio despacha sus pedidos desde Tocancipá, Cundinamarca, prestando servicio en Tocancipá y sus alrededores. Para pedidos confirma: productos y cantidades, nombre completo del cliente, dirección exacta de entrega y medio de pago (Nequi, Bre-B o Efectivo contra entrega). Si solicitan entrega en otra ciudad o fuera de cobertura, informa amablemente la cobertura en Tocancipá y deriva a un asesor humano. Si solicitan hablar con una persona, escala a humano.",
  transferQrImage: "",
  nequiNumber: "3228964947",
  brebKey: "3228964947",
  deliveryFee: "4000",
  freeDeliveryThreshold: "40000",
  estimatedDeliveryTime: "30 a 45 minutos",
  botEnabled: "true",
  upsellDrinksEnabled: "true",
  deliveryDriverPhone: "",
  deliveryDriverNotifyEnabled: "true",
  autoPauseOnMobileReply: "true",
};

const SEED_PRODUCTS: Product[] = [
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
    description: "Caja de 4 buñuelos surtidos. Salsas a elección: Mora, Arequipe, Bocadillo, Suero Costeño.",
  },
  {
    sku: "C8S",
    name: "CAJA x8 Surtida",
    price: 36000,
    active: true,
    description: "Caja de 8 buñuelos surtidos. Salsas a elección: Mora, Arequipe, Bocadillo, Suero Costeño.",
  },
  {
    sku: "BEB_CAFE",
    name: "Café Campesino",
    price: 3500,
    active: true,
    description: "Café campesino recién colado, aromático y calientito.",
  },
  {
    sku: "BEB_CHOC",
    name: "Chocolate Caliente Tradicional",
    price: 4000,
    active: true,
    description: "Chocolate caliente espumoso tradicional, perfecto para acompañar buñuelos.",
  },
  {
    sku: "BEB_GAS",
    name: "Gaseosa 400ml",
    price: 4500,
    active: true,
    description: "Gaseosa fría bien helada (Coca-Cola / Colombiana / Manzana).",
  },
  {
    sku: "BEB_JUGO",
    name: "Jugo Natural de Mora",
    price: 6000,
    active: true,
    description: "Jugo natural refrescante de fruta en agua o en leche.",
  },
  {
    sku: "BEB_AGUA",
    name: "Agua Mineral 500ml",
    price: 3000,
    active: true,
    description: "Agua fresca pura sin gas o con gas.",
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

  setConversationPhone(id: string, phone: string): void {
    const c = this.getOrCreateConversation(id);
    c.phone = phone;
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

  updateMessageContent(id: string, content: string): boolean {
    const msg = this.messages.find((m) => m.id === id);
    if (msg) {
      msg.content = content;
      return true;
    }
    return false;
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
    details?: {
      customerName?: string;
      customerPhone?: string;
      deliveryAddress?: string;
      paymentMethod?: string;
      itemsSummary?: string;
      deliveryFee?: number;
      changeAmount?: string;
      deliveryNotes?: string;
      status?: OrderStatus;
      invoiceNumber?: string;
      invoiceId?: string;
      invoiceUrl?: string;
    }
  ): Order {
    const order: Order = {
      id: randomUUID(),
      conversationId,
      customerName: details?.customerName,
      customerPhone: details?.customerPhone,
      deliveryAddress: details?.deliveryAddress,
      paymentMethod: details?.paymentMethod,
      itemsSummary: details?.itemsSummary,
      deliveryFee: details?.deliveryFee,
      changeAmount: details?.changeAmount,
      deliveryNotes: details?.deliveryNotes,
      status: details?.status || "confirmed",
      total,
      items,
      invoiceNumber: details?.invoiceNumber,
      invoiceId: details?.invoiceId,
      invoiceUrl: details?.invoiceUrl,
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
  const s = String(val).trim();
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
      customerName: r.customer_name ? String(r.customer_name) : undefined,
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
      await getOrCreateConversation(id);
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

export async function setConversationCustomerName(
  conversationId: string,
  customerName: string
): Promise<void> {
  const trimmed = (customerName || "").trim();
  if (!trimmed) return;

  const mem = getMemoryStore();
  const c = mem.conversations.get(conversationId);
  if (c) c.customerName = trimmed;

  if (isTursoConfigured()) {
    try {
      await getOrCreateConversation(conversationId);
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE conversations SET customer_name = ? WHERE id = ?",
        args: [trimmed, conversationId],
      });
    } catch (err) {
      console.warn("[store] setConversationCustomerName Turso error:", err);
    }
  }
}

export async function setConversationPhone(
  conversationId: string,
  phone: string
): Promise<void> {
  const trimmed = (phone || "").trim();
  if (!trimmed) return;

  const mem = getMemoryStore();
  const c = mem.conversations.get(conversationId);
  if (c) {
    c.phone = trimmed;
    c.updatedAt = Date.now();
  }

  if (isTursoConfigured()) {
    try {
      await getOrCreateConversation(conversationId);
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE conversations SET phone = ?, updated_at = ? WHERE id = ?",
        args: [trimmed, Date.now(), conversationId],
      });
    } catch (err) {
      console.warn("[store] setConversationPhone Turso error:", err);
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
      // En Turso, la columna 'id' de 'messages' es INTEGER PRIMARY KEY AUTOINCREMENT.
      // Insertamos sin especificar 'id' para evitar error SQLITE_MISMATCH (datatype mismatch con UUID).
      const res = await client.execute({
        sql: `INSERT INTO messages (conversation_id, role, content, at, created_at) VALUES (?, ?, ?, '', ?)`,
        args: [conversationId, role, content, memoryMsg.createdAt],
      });
      if (res?.lastInsertRowid != null) {
        memoryMsg.id = String(res.lastInsertRowid);
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

export async function updateMessageContent(id: string, content: string): Promise<void> {
  getMemoryStore().updateMessageContent(id, content);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE messages SET content = ? WHERE id = ? OR rowid = ?",
        args: [content, id, id],
      });
    } catch (err) {
      console.warn("[store] updateMessageContent Turso error:", err);
    }
  }
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
    // Ensure all seed products (including new drinks) are present
    for (const p of SEED_PRODUCTS) {
      await client.execute({
        sql: "INSERT OR IGNORE INTO products (sku, name, price, active, description) VALUES (?, ?, ?, ?, ?)",
        args: [p.sku, p.name, p.price, p.active ? 1 : 0, p.description || ""],
      }).catch(() => {});
    }

    const sql = activeOnly
      ? "SELECT sku, name, price, active, description FROM products WHERE active = 1"
      : "SELECT sku, name, price, active, description FROM products";
    const res = await client.execute(sql);
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
  details?: {
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    paymentMethod?: string;
    itemsSummary?: string;
    deliveryFee?: number;
    changeAmount?: string;
    deliveryNotes?: string;
    status?: OrderStatus;
    invoiceNumber?: string;
    invoiceId?: string;
    invoiceUrl?: string;
  }
): Promise<Order> {
  const memOrder = getMemoryStore().createOrder(conversationId, items, total, details);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();

      const orderStmt = {
        sql: `INSERT INTO orders (id, conversation_id, customer_name, customer_phone, delivery_address, payment_method, items_summary, delivery_fee, change_amount, delivery_notes, status, total, created_at, invoice_number, invoice_id, invoice_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          memOrder.id,
          conversationId,
          details?.customerName || null,
          details?.customerPhone || null,
          details?.deliveryAddress || null,
          details?.paymentMethod || null,
          details?.itemsSummary || null,
          details?.deliveryFee ?? 0,
          details?.changeAmount || null,
          details?.deliveryNotes || null,
          memOrder.status,
          total,
          memOrder.createdAt,
          details?.invoiceNumber || null,
          details?.invoiceId || null,
          details?.invoiceUrl || null,
        ],
      };

      const itemBatch = items.map((it) => ({
        sql: "INSERT INTO order_items (id, order_id, sku, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
        args: [randomUUID(), memOrder.id, it.sku, it.quantity, it.unitPrice],
      }));

      try {
        await client.batch([orderStmt, ...itemBatch], "write");
      } catch (batchErr: any) {
        console.warn("[store] Error en batch atómico de orden e items, intentando auto-reparación de esquema:", batchErr);
        try {
          await client.execute("ALTER TABLE order_items ADD COLUMN quantity INTEGER DEFAULT 1;").catch(() => {});
          await client.execute("ALTER TABLE order_items ADD COLUMN unit_price INTEGER DEFAULT 0;").catch(() => {});
          await client.batch([orderStmt, ...itemBatch], "write");
        } catch (retryErr) {
          console.error("[store] Inserción atómica de pedido falló definitivamente:", retryErr);
          try {
            if (memOrder.id && typeof memOrder.id === "string" && memOrder.id.length >= 10) {
              await client.execute({ sql: "DELETE FROM order_items WHERE order_id = ?", args: [memOrder.id] });
              await client.execute({ sql: "DELETE FROM orders WHERE id = ?", args: [memOrder.id] });
            }
          } catch {}
          getMemoryStore().orders.delete(memOrder.id);
          throw retryErr;
        }
      }

      if (details?.customerName && !details.customerName.toLowerCase().startsWith("cliente whatsapp")) {
        await client.execute({
          sql: "UPDATE conversations SET customer_name = ? WHERE id = ?",
          args: [details.customerName, conversationId],
        }).catch(() => {});
      }
    } catch (err) {
      getMemoryStore().orders.delete(memOrder.id);
      console.error("[store] createOrder Turso error:", err);
      throw err;
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

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  const mem = getMemoryStore();
  const memOrder = mem.orders.get(id);
  if (memOrder) {
    memOrder.status = status;
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE orders SET status = ? WHERE id = ?",
        args: [status, id],
      });
      const res = await client.execute({
        sql: "SELECT * FROM orders WHERE id = ? LIMIT 1",
        args: [id],
      });
      if (res.rows.length) {
        const r: any = res.rows[0];
        return {
          id: String(r.id),
          conversationId: String(r.conversation_id || r.conversationId || ""),
          customerName: r.customer_name ? String(r.customer_name) : undefined,
          customerPhone: r.customer_phone ? String(r.customer_phone) : undefined,
          deliveryAddress: r.delivery_address ? String(r.delivery_address) : undefined,
          paymentMethod: r.payment_method ? String(r.payment_method) : undefined,
          itemsSummary: r.items_summary ? String(r.items_summary) : undefined,
          deliveryFee: r.delivery_fee != null ? Number(r.delivery_fee) : 0,
          changeAmount: r.change_amount ? String(r.change_amount) : undefined,
          deliveryNotes: r.delivery_notes ? String(r.delivery_notes) : undefined,
          status: (r.status as OrderStatus) || status,
          total: Number(r.total ?? r.amount ?? 0),
          invoiceNumber: r.invoice_number ? String(r.invoice_number) : undefined,
          invoiceId: r.invoice_id ? String(r.invoice_id) : undefined,
          invoiceUrl: r.invoice_url ? String(r.invoice_url) : undefined,
          driverNotified: r.driver_notified ? String(r.driver_notified) : undefined,
          driverNotifiedAt: r.driver_notified_at ? parseTimestamp(r.driver_notified_at) : undefined,
          createdAt: parseTimestamp(r.created_at),
        };
      }
    } catch (err) {
      console.error("[store] updateOrderStatus error:", err);
      throw err;
    }
  }

  return memOrder || null;
}

/**
 * Reclama atómicamente el derecho a notificar al domiciliario para evitar duplicados por concurrencia.
 * Si una instancia anterior terminó inesperadamente durante el envío, la reserva expira a los 2 minutos (stale claim)
 * para evitar bloqueos permanentes.
 */
export async function claimOrderDriverNotification(
  id: string,
  kind: "initial" | "verified",
  force?: boolean,
  currentOrder?: Order
): Promise<boolean> {
  const STALE_DISPATCH_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos: si una instancia cayó a mitad de camino, la reserva expira
  const now = Date.now();
  const staleThreshold = now - STALE_DISPATCH_TIMEOUT_MS;

  const mem = getMemoryStore();
  let memOrder = mem.orders.get(id);
  if (!memOrder && currentOrder) {
    memOrder = currentOrder;
    mem.orders.set(id, currentOrder);
  }

  if (!force) {
    const notifiedState = memOrder?.driverNotified || currentOrder?.driverNotified;
    if (notifiedState) {
      if (
        notifiedState === kind ||
        (kind === "initial" && notifiedState === "verified")
      ) {
        return false;
      }
      if (notifiedState.startsWith(`sending_${kind}`)) {
        const claimedAt = memOrder?.driverNotifiedAt || currentOrder?.driverNotifiedAt || 0;
        if (claimedAt > 0 && now - claimedAt < STALE_DISPATCH_TIMEOUT_MS) {
          return false;
        }
        // Si el reclamo en memoria tiene más de 2 minutos, se considera stale y se permite reintentar
      }
    }
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      if (force) {
        await client.execute({
          sql: "UPDATE orders SET driver_notified = ?, driver_notified_at = ? WHERE id = ?",
          args: [`sending_${kind}`, now, id],
        });
        if (memOrder) {
          memOrder.driverNotified = `sending_${kind}`;
          memOrder.driverNotifiedAt = now;
        }
        if (currentOrder) {
          currentOrder.driverNotified = `sending_${kind}`;
          currentOrder.driverNotifiedAt = now;
        }
        return true;
      }

      const sql =
        kind === "initial"
          ? `UPDATE orders 
             SET driver_notified = 'sending_initial', driver_notified_at = ? 
             WHERE id = ? 
               AND (
                 driver_notified IS NULL 
                 OR driver_notified = '' 
                 OR driver_notified = 'none' 
                 OR (driver_notified = 'sending_initial' AND (driver_notified_at IS NULL OR driver_notified_at = 0 OR driver_notified_at < ?))
               )`
          : `UPDATE orders 
             SET driver_notified = 'sending_verified', driver_notified_at = ? 
             WHERE id = ? 
               AND driver_notified != 'verified' 
               AND (
                 driver_notified != 'sending_verified' 
                 OR (driver_notified = 'sending_verified' AND (driver_notified_at IS NULL OR driver_notified_at = 0 OR driver_notified_at < ?))
               )`;

      const res = await client.execute({ sql, args: [now, id, staleThreshold] });
      const claimed = (res.rowsAffected || 0) > 0;
      if (claimed) {
        if (memOrder) {
          memOrder.driverNotified = `sending_${kind}`;
          memOrder.driverNotifiedAt = now;
        }
        if (currentOrder) {
          currentOrder.driverNotified = `sending_${kind}`;
          currentOrder.driverNotifiedAt = now;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[store] claimOrderDriverNotification error:", err);
    }
  }

  if (memOrder) {
    memOrder.driverNotified = `sending_${kind}`;
    memOrder.driverNotifiedAt = now;
  }
  if (currentOrder) {
    currentOrder.driverNotified = `sending_${kind}`;
    currentOrder.driverNotifiedAt = now;
  }
  return true;
}

/**
 * Libera o confirma el reclamo de la notificación al domiciliario.
 * Si falló el envío, revierte el estado para permitir un reintento futuro.
 */
export async function releaseOrderDriverNotification(
  id: string,
  kind: "initial" | "verified",
  success: boolean,
  currentOrder?: Order
): Promise<void> {
  const now = Date.now();
  const mem = getMemoryStore();
  const memOrder = mem.orders.get(id);

  const finalState = success ? kind : kind === "verified" ? "initial" : undefined;
  const finalTime = success ? now : 0;

  if (memOrder) {
    memOrder.driverNotified = finalState;
    memOrder.driverNotifiedAt = finalTime;
  }
  if (currentOrder) {
    currentOrder.driverNotified = finalState;
    currentOrder.driverNotifiedAt = finalTime;
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      if (success) {
        await client.execute({
          sql: "UPDATE orders SET driver_notified = ?, driver_notified_at = ? WHERE id = ?",
          args: [kind, now, id],
        });
      } else {
        const revertVal = kind === "verified" ? "initial" : null;
        await client.execute({
          sql: "UPDATE orders SET driver_notified = ?, driver_notified_at = 0 WHERE id = ? AND driver_notified = ?",
          args: [revertVal, id, `sending_${kind}`],
        });
      }
    } catch (err) {
      console.warn("[store] releaseOrderDriverNotification error:", err);
    }
  }
}

export async function updateOrderDriverNotified(id: string, state: string): Promise<void> {
  const mem = getMemoryStore();
  const memOrder = mem.orders.get(id);
  if (memOrder) {
    memOrder.driverNotified = state;
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE orders SET driver_notified = ? WHERE id = ?",
        args: [state, id],
      });
    } catch (err) {
      console.warn("[store] updateOrderDriverNotified error:", err);
    }
  }
}

export async function updateOrderInvoice(
  id: string,
  invoiceNumber: string,
  invoiceId?: string,
  invoiceUrl?: string,
  invoicePdfUrl?: string
): Promise<void> {
  const mem = getMemoryStore();
  const memOrder = mem.orders.get(id);
  if (memOrder) {
    memOrder.invoiceNumber = invoiceNumber;
    memOrder.invoiceId = invoiceId;
    memOrder.invoiceUrl = invoiceUrl;
    memOrder.invoicePdfUrl = invoicePdfUrl;
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE orders SET invoice_number = ?, invoice_id = ?, invoice_url = ? WHERE id = ?",
        args: [invoiceNumber, invoiceId || null, invoiceUrl || null, id],
      });
    } catch (err) {
      console.error("[store] updateOrderInvoice error:", err);
    }
  }
}

export async function updateOrderAddress(id: string, newAddress: string): Promise<boolean> {
  const mem = getMemoryStore();
  const memOrder = mem.orders.get(id);
  if (memOrder) {
    memOrder.deliveryAddress = newAddress;
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: "UPDATE orders SET delivery_address = ? WHERE id = ?",
        args: [newAddress, id],
      });
      return true;
    } catch (err) {
      console.error("[store] updateOrderAddress error:", err);
      return false;
    }
  }
  return true;
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
      customerPhone: r.customer_phone ? String(r.customer_phone) : undefined,
      deliveryAddress: r.delivery_address ? String(r.delivery_address) : undefined,
      paymentMethod: r.payment_method ? String(r.payment_method) : undefined,
      itemsSummary: r.items_summary ? String(r.items_summary) : undefined,
      deliveryFee: r.delivery_fee != null ? Number(r.delivery_fee) : 0,
      changeAmount: r.change_amount ? String(r.change_amount) : undefined,
      deliveryNotes: r.delivery_notes ? String(r.delivery_notes) : undefined,
      status: (r.status as Order["status"]) || "confirmed",
      total: Number(r.total ?? r.amount ?? 0),
      invoiceNumber: r.invoice_number ? String(r.invoice_number) : undefined,
      invoiceId: r.invoice_id ? String(r.invoice_id) : undefined,
      invoiceUrl: r.invoice_url ? String(r.invoice_url) : undefined,
      driverNotified: r.driver_notified ? String(r.driver_notified) : undefined,
      driverNotifiedAt: r.driver_notified_at ? parseTimestamp(r.driver_notified_at) : undefined,
      createdAt: parseTimestamp(r.created_at),
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
    const res = await client.execute("SELECT * FROM org_settings LIMIT 1");
    if (!res.rows.length) return DEFAULT_SETTINGS;
    const r: any = res.rows[0];
    const settings: OrgSettings = {
      name: String(r.business_name || r.name || DEFAULT_SETTINGS.name),
      tone: String(r.tone || DEFAULT_SETTINGS.tone),
      welcomeMessage: String(r.welcome_message || r.welcomeMessage || DEFAULT_SETTINGS.welcomeMessage),
      rules: String(r.rules || DEFAULT_SETTINGS.rules),
      businessHoursEnabled: r.business_hours_enabled != null ? String(r.business_hours_enabled) : DEFAULT_SETTINGS.businessHoursEnabled,
      businessHoursStart: r.business_hours_start != null ? String(r.business_hours_start) : DEFAULT_SETTINGS.businessHoursStart,
      businessHoursEnd: r.business_hours_end != null ? String(r.business_hours_end) : DEFAULT_SETTINGS.businessHoursEnd,
      outOfHoursMessage: r.out_of_hours_message != null ? String(r.out_of_hours_message) : (r.after_hours_message ? String(r.after_hours_message) : DEFAULT_SETTINGS.outOfHoursMessage),
      extraPrompt: r.extra_prompt != null ? String(r.extra_prompt) : DEFAULT_SETTINGS.extraPrompt,
      botObjective: r.bot_objective != null ? String(r.bot_objective) : DEFAULT_SETTINGS.botObjective,
      transferQrImage: r.transfer_qr_image != null ? String(r.transfer_qr_image) : DEFAULT_SETTINGS.transferQrImage,
      nequiNumber: r.nequi_number != null ? String(r.nequi_number) : DEFAULT_SETTINGS.nequiNumber,
      brebKey: r.breb_key != null ? String(r.breb_key) : DEFAULT_SETTINGS.brebKey,
      deliveryFee: r.delivery_fee != null ? String(r.delivery_fee) : DEFAULT_SETTINGS.deliveryFee,
      freeDeliveryThreshold: r.free_delivery_threshold != null ? String(r.free_delivery_threshold) : DEFAULT_SETTINGS.freeDeliveryThreshold,
      businessCity: r.business_city != null ? String(r.business_city) : (DEFAULT_SETTINGS.businessCity || "Tocancipá, Cundinamarca"),
      coverageArea: r.coverage_area != null ? String(r.coverage_area) : (DEFAULT_SETTINGS.coverageArea || "Tocancipá y alrededores"),
      estimatedDeliveryTime: r.estimated_delivery_time != null ? String(r.estimated_delivery_time) : DEFAULT_SETTINGS.estimatedDeliveryTime,
      botEnabled: r.bot_enabled != null ? String(r.bot_enabled) : DEFAULT_SETTINGS.botEnabled,
      upsellDrinksEnabled: r.upsell_drinks_enabled != null ? String(r.upsell_drinks_enabled) : DEFAULT_SETTINGS.upsellDrinksEnabled,
      deliveryDriverPhone: r.delivery_driver_phone != null ? String(r.delivery_driver_phone) : (DEFAULT_SETTINGS.deliveryDriverPhone || ""),
      deliveryDriverNotifyEnabled: r.delivery_driver_notify_enabled != null ? String(r.delivery_driver_notify_enabled) : (DEFAULT_SETTINGS.deliveryDriverNotifyEnabled || "true"),
      autoPauseOnMobileReply: r.auto_pause_on_mobile_reply != null ? String(r.auto_pause_on_mobile_reply) : (DEFAULT_SETTINGS.autoPauseOnMobileReply || "true"),
    };
    return settings;
  } catch (err) {
    console.error("[store] getOrgSettings error:", err);
    return getMemoryStore().getOrgSettings();
  }
}

export async function updateOrgSettings(patch: Partial<OrgSettings>): Promise<OrgSettings> {
  const updated = getMemoryStore().updateOrgSettings(patch);
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: `INSERT OR IGNORE INTO org_settings (id, business_name, tone, welcome_message, rules, updated_at)
              VALUES (1, ?, ?, ?, ?, ?)`,
        args: [
          patch.name || DEFAULT_SETTINGS.name,
          patch.tone || DEFAULT_SETTINGS.tone,
          patch.welcomeMessage || DEFAULT_SETTINGS.welcomeMessage,
          patch.rules || DEFAULT_SETTINGS.rules,
          new Date().toISOString()
        ],
      });

      const sets: string[] = ["updated_at = ?"];
      const args: any[] = [new Date().toISOString()];

      if (patch.name !== undefined) { sets.push("business_name = ?"); args.push(patch.name); }
      if (patch.tone !== undefined) { sets.push("tone = ?"); args.push(patch.tone); }
      if (patch.welcomeMessage !== undefined) { sets.push("welcome_message = ?"); args.push(patch.welcomeMessage); }
      if (patch.businessCity !== undefined) { sets.push("business_city = ?"); args.push(patch.businessCity); }
      if (patch.coverageArea !== undefined) { sets.push("coverage_area = ?"); args.push(patch.coverageArea); }
      if (patch.rules !== undefined) { sets.push("rules = ?"); args.push(patch.rules); }
      if (patch.businessHoursEnabled !== undefined) { sets.push("business_hours_enabled = ?"); args.push(patch.businessHoursEnabled); }
      if (patch.businessHoursStart !== undefined) { sets.push("business_hours_start = ?"); args.push(patch.businessHoursStart); }
      if (patch.businessHoursEnd !== undefined) { sets.push("business_hours_end = ?"); args.push(patch.businessHoursEnd); }
      if (patch.outOfHoursMessage !== undefined) { sets.push("out_of_hours_message = ?"); args.push(patch.outOfHoursMessage); }
      if (patch.extraPrompt !== undefined) { sets.push("extra_prompt = ?"); args.push(patch.extraPrompt); }
      if (patch.botObjective !== undefined) { sets.push("bot_objective = ?"); args.push(patch.botObjective); }
      if (patch.transferQrImage !== undefined) { sets.push("transfer_qr_image = ?"); args.push(patch.transferQrImage); }
      if (patch.nequiNumber !== undefined) { sets.push("nequi_number = ?"); args.push(patch.nequiNumber); }
      if (patch.brebKey !== undefined) { sets.push("breb_key = ?"); args.push(patch.brebKey); }
      if (patch.deliveryFee !== undefined) { sets.push("delivery_fee = ?"); args.push(patch.deliveryFee); }
      if (patch.freeDeliveryThreshold !== undefined) { sets.push("free_delivery_threshold = ?"); args.push(patch.freeDeliveryThreshold); }
      if (patch.estimatedDeliveryTime !== undefined) { sets.push("estimated_delivery_time = ?"); args.push(patch.estimatedDeliveryTime); }
      if (patch.botEnabled !== undefined) { sets.push("bot_enabled = ?"); args.push(patch.botEnabled); }
      if (patch.upsellDrinksEnabled !== undefined) { sets.push("upsell_drinks_enabled = ?"); args.push(patch.upsellDrinksEnabled); }
      if (patch.deliveryDriverPhone !== undefined) { sets.push("delivery_driver_phone = ?"); args.push(patch.deliveryDriverPhone); }
      if (patch.deliveryDriverNotifyEnabled !== undefined) { sets.push("delivery_driver_notify_enabled = ?"); args.push(patch.deliveryDriverNotifyEnabled); }
      if (patch.autoPauseOnMobileReply !== undefined) { sets.push("auto_pause_on_mobile_reply = ?"); args.push(patch.autoPauseOnMobileReply); }

      args.push(1);
      await client.execute({
        sql: `UPDATE org_settings SET ${sets.join(", ")} WHERE id = ?`,
        args,
      });
    } catch (err) {
      console.error("[store] updateOrgSettings error:", err);
    }
  }
  return updated;
}
