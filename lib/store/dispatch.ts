import {
  appendMessage,
  createOrder,
  getConversation,
  getMessages,
  getOrCreateConversation,
  getOrders,
  getOrgSettings,
  getProduct,
  getProducts,
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
import { getTursoClient, isTursoConfigured } from "./db";

export interface IStore {
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  getOrCreateConversation(id: string): Promise<Conversation>;
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
        const client = getTursoClient();
        const res = await client.execute(
          "SELECT id, phone, status, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
        );
        return res.rows.map((r: any) => ({
          id: String(r.id),
          phone: String(r.phone),
          status: (r.status as ConversationStatus) || "bot",
          createdAt: Number(r.created_at),
          updatedAt: Number(r.updated_at),
        }));
      } catch {
        const mem = (globalThis as any).__whatsappMemoryStore;
        if (!mem) return [];
        return Array.from(mem.conversations.values());
      }
    },
    getConversation,
    getOrCreateConversation,
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
