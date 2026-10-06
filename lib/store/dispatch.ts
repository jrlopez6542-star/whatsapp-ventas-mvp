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
  updateOrgSettings,
  upsertProduct,
  type Conversation,
  type ConversationStatus,
  type Message,
  type Order,
  type OrderItem,
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
        const res = await client.execute(
          "SELECT * FROM conversations ORDER BY updated_at DESC"
        );
        return res.rows.map((r: any) => {
          const rawId = String(r.id);
          const rawPhone = String(r.phone || r.from_wa || r.id);
          const phone = decodeWhatsappIdentifier(rawPhone) || rawPhone;
          return {
            id: rawId,
            phone,
            status: (r.status as ConversationStatus) || "bot",
            createdAt: parseTimestamp(r.created_at),
            updatedAt: parseTimestamp(r.updated_at),
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
    getOrgSettings,
    updateOrgSettings,
  };
}
