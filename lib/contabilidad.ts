/**
 * Integración con el sistema de Facturación & Contabilidad de Buñuelandia
 * Genera facturas oficiales (FV-XXXX), deduce inventario/empaques y registra pagos.
 */

export interface ContabilidadInvoiceResult {
  ok: boolean;
  invoiceNumber?: string;
  invoiceId?: string;
  invoiceUrl?: string;
  invoicePdfUrl?: string;
  total?: number;
  customerName?: string;
  error?: string;
}

export interface CreateInvoiceParams {
  orderId: string;
  customerName?: string;
  phone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  paymentMethod?: string;
  changeAmount?: string;
  items: Array<{
    sku?: string;
    name?: string;
    quantity: number;
    unitPrice: number;
  }>;
  deliveryFee?: number;
  total: number;
}

const CONTABILIDAD_API_URL =
  process.env.CONTABILIDAD_API_URL ||
  "https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order";

const BOT_INVOICE_SECRET =
  process.env.BOT_INVOICE_SECRET || "bunuelandia-secret-bot-key-2026";

/**
 * Llama a la API de Contabilidad para generar la factura legal/oficial automáticamente
 */
export async function createInvoiceInContabilidad(
  params: CreateInvoiceParams
): Promise<ContabilidadInvoiceResult> {
  try {
    const res = await fetch(CONTABILIDAD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": BOT_INVOICE_SECRET,
      },
      body: JSON.stringify(params),
      // Timeout de 15 segundos para dar margen al registro y cálculo
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `[contabilidad] Error HTTP ${res.status} al crear factura:`,
        errText
      );
      return {
        ok: false,
        error: `HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    }

    const data = await res.json();
    return {
      ok: Boolean(data.ok),
      invoiceNumber: data.invoiceNumber,
      invoiceId: data.invoiceId,
      invoiceUrl: data.invoiceUrl,
      invoicePdfUrl: data.invoicePdfUrl,
      total: data.total,
      customerName: data.customerName,
      error: data.error,
    };
  } catch (err: any) {
    console.error("[contabilidad] Fallo de conexión con la app de facturación:", err?.message || err);
    return {
      ok: false,
      error: err?.message || "Error de red al conectar con facturación",
    };
  }
}
