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
  paymentStatus?: "issued" | "paid" | "pending";
  isCashOnDelivery?: boolean;
  customerEmail?: string;
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

const CONTABILIDAD_PRODUCTION_API_URL =
  "https://contabilidad-app-fawn.vercel.app/api/invoices/create-from-order";

export function resolveContabilidadApiUrl(
  env: Partial<Pick<NodeJS.ProcessEnv, "CONTABILIDAD_API_URL" | "NODE_ENV" | "NODE_TEST_CONTEXT">> = process.env
): string {
  const isTestRuntime = env.NODE_ENV === "test" || Boolean(env.NODE_TEST_CONTEXT);
  const configuredUrl = env.CONTABILIDAD_API_URL?.trim();
  if (configuredUrl) {
    if (!isTestRuntime) return configuredUrl;
    return isLoopbackUrl(configuredUrl) ? configuredUrl : "";
  }
  if (isTestRuntime) return "";
  return env.NODE_ENV === "production" ? CONTABILIDAD_PRODUCTION_API_URL : "";
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function safeIntegrationErrorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error && typeof error.name === "string"
    ? error.name.slice(0, 40)
    : "IntegrationError";
}

const CONTABILIDAD_API_URL = resolveContabilidadApiUrl();

const BOT_INVOICE_SECRET =
  process.env.BOT_INVOICE_SECRET?.trim() ||
  (process.env.NODE_ENV !== "production" ? "bunuelandia-secret-bot-key-2026" : "");

/**
 * Llama a la API de Contabilidad para generar la factura legal/oficial automáticamente
 */
export async function createInvoiceInContabilidad(
  params: CreateInvoiceParams
): Promise<ContabilidadInvoiceResult> {
  if (!CONTABILIDAD_API_URL) {
    return {
      ok: false,
      error: "Integración con Contabilidad deshabilitada: falta CONTABILIDAD_API_URL.",
    };
  }

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
      console.warn(`[contabilidad] Error HTTP ${res.status} al crear factura`);
      return {
        ok: false,
        error: `HTTP ${res.status} de Contabilidad al crear factura.`,
      };
    }

    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: "Contabilidad rechazó la solicitud de factura." };
    }
    return {
      ok: true,
      invoiceNumber: data.invoiceNumber,
      invoiceId: data.invoiceId,
      invoiceUrl: data.invoiceUrl,
      invoicePdfUrl: data.invoicePdfUrl,
      total: data.total,
      customerName: data.customerName,
    };
  } catch (err: any) {
    console.warn("[contabilidad] Fallo de conexión al crear factura", {
      error: safeIntegrationErrorName(err),
    });
    return {
      ok: false,
      error: "Fallo de conexión al crear factura en Contabilidad.",
    };
  }
}

export interface RecordPaymentParams {
  orderId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  paymentMethod?: string;
  confirmedBy?: string;
  confirmedAt?: number;
  notes?: string;
}

export interface RecordPaymentResult {
  ok: boolean;
  alreadyPaid?: boolean;
  invoiceNumber?: string;
  invoiceId?: string;
  status?: string;
  paymentId?: string;
  error?: string;
}

/**
 * Registra el cobro contra entrega en la factura existente de Contabilidad
 */
export async function recordPaymentInContabilidad(
  params: RecordPaymentParams
): Promise<RecordPaymentResult> {
  try {
    let paymentUrl: string;
    if (process.env.CONTABILIDAD_RECORD_PAYMENT_URL?.trim()) {
      paymentUrl = process.env.CONTABILIDAD_RECORD_PAYMENT_URL.trim();
      if (isTestRuntime() && !isLoopbackUrl(paymentUrl)) {
        return { ok: false, error: "Integración externa deshabilitada durante las pruebas." };
      }
    } else {
      if (!CONTABILIDAD_API_URL) {
        return {
          ok: false,
          error: "Integración con Contabilidad deshabilitada: falta CONTABILIDAD_API_URL.",
        };
      }
      const baseApi = CONTABILIDAD_API_URL.replace(/\/create-from-order\/?$/, "");
      paymentUrl = `${baseApi}/record-payment`;
    }

    const res = await fetch(paymentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": BOT_INVOICE_SECRET,
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[contabilidad] Error HTTP ${res.status} al registrar pago`);
      return {
        ok: false,
        error: `HTTP ${res.status} de Contabilidad al registrar pago.`,
      };
    }

    const data = await res.json();
    return {
      ok: Boolean(data.ok),
      alreadyPaid: Boolean(data.alreadyPaid),
      invoiceNumber: data.invoiceNumber,
      invoiceId: data.invoiceId,
      status: data.status,
      paymentId: data.paymentId,
      error: data.ok ? undefined : "Contabilidad rechazó la solicitud de pago.",
    };
  } catch (err: any) {
    console.warn("[contabilidad] Fallo de conexión al registrar pago", {
      error: safeIntegrationErrorName(err),
    });
    return {
      ok: false,
      error: "Fallo de conexión al registrar pago en Contabilidad.",
    };
  }
}

// Deduplicación en memoria para envíos de facturas PDF (evita reenvíos ante reintentos de webhooks)
export const sentInvoicePdfsCache = new Map<string, number>();
export const SENT_PDF_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas
