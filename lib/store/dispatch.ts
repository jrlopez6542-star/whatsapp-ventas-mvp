import {
  appendMessage,
  createOrder,
  decodeWhatsappIdentifier,
  deleteConversation,
  getConversation,
  getMessages,
  getOrCreateConversation,
  getOrders,
  getOrgSettings,
  getProduct,
  getProducts,
  parseTimestamp,
  setConversationStatus,
  updateOrderStatus,
  updateOrgSettings,
  upsertProduct,
  type Conversation,
  type ConversationStatus,
  type Message,
  type Order,
  type OrderItem,
  type OrderStatus,
  type OrgSettings,
  type Product,
} from "./index";
import { ensureTursoReady, getTursoClient, isTursoConfigured } from "./db";

export interface IStore {
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  getOrCreateConversation(id: string): Promise<Conversation>;
  deleteConversation(id: string): Promise<boolean>;
  setConversationStatus(id: string, status: ConversationStatus): Promise<void>;
  appendMessage(conversationId: string, role: "user" | "assistant" | "system", content: string): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;
  getProducts(activeOnly?: boolean): Promise<Product[]>;
  getProduct(sku: string): Promise<Product | null>;
  upsertProduct(product: Product): Promise<void>;
  createOrder(conversationId: string, items: OrderItem[], total: number): Promise<Order>;
  getOrders(): Promise<Order[]>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null>;
  getOrgSettings(): Promise<OrgSettings>;
  updateOrgSettings(patch: Partial<OrgSettings>): Promise<OrgSettings>;
}

export async function getStore(): Promise<IStore> {
  return {
    async listConversations(): Promise<Conversation[]> {
      if (!isTursoConfigured()) {
        const mem = (globalThis as any).__whatsappMemoryStore;
        if (!mem) return [];
        return (Array.from(mem.conversations.values()) as Conversation[]).sort(
          (a: Conversation, b: Conversation) => b.updatedAt - a.updatedAt
        );
      }
      try {
        await ensureTursoReady();
        const client = getTursoClient();
        const res = await client.execute(`
          SELECT c.id, c.phone, c.from_wa, c.customer_name, c.status, c.created_at, c.updated_at,
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
          FROM conversations c
          UNION
          SELECT m.conversation_id as id, m.conversation_id as phone, m.conversation_id as from_wa, NULL as customer_name, 'bot' as status, MIN(m.created_at) as created_at, MAX(m.created_at) as updated_at,
            (SELECT content FROM messages WHERE conversation_id = m.conversation_id ORDER BY created_at DESC LIMIT 1) as last_message
          FROM messages m
          WHERE m.conversation_id NOT IN (SELECT id FROM conversations)
          GROUP BY m.conversation_id
          ORDER BY updated_at DESC
        `);
        return res.rows.map((r: any) => {
          const rawId = String(r.id);
          const rawPhone = String(r.phone || r.from_wa || r.id);
          const phone = decodeWhatsappIdentifier(rawPhone) || rawPhone;
          return {
            id: rawId,
            phone,
            customerName: r.customer_name ? String(r.customer_name) : undefined,
            status: (r.status as ConversationStatus) || "bot",
            createdAt: parseTimestamp(r.created_at),
            updatedAt: parseTimestamp(r.updated_at),
            lastMessage: r.last_message ? String(r.last_message) : undefined,
          };
        });
      } catch (err) {
        console.error("[store] listConversations Turso error:", err);
        const mem = (globalThis as any).__whatsappMemoryStore;
        if (!mem) return [];
        return Array.from(mem.conversations.values());
      }
    },
    getConversation,
    getOrCreateConversation,
    deleteConversation,
    setConversationStatus,
    appendMessage,
    getMessages,
    getProducts,
    getProduct,
    upsertProduct,
    createOrder,
    getOrders,
    updateOrderStatus,
    getOrgSettings,
    updateOrgSettings,
  };
}
