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
  /**
   * Clasificación del resultado remoto: evita confundir un rechazo explícito con
   * un fallo incierto (posible factura ya creada en el remoto).
   */
  remoteOutcome?: "created" | "rejected" | "ambiguous" | "not_attempted";
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

export function isProductionContabilidadUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.trim().toLowerCase();
  return (
    lower.includes("contabilidad-app-fawn.vercel.app") ||
    lower.includes("contabilidad-prod") ||
    lower.includes("contabilidad_prod")
  );
}

export interface ContabilidadEnv {
  CONTABILIDAD_API_URL?: string;
  CONTABILIDAD_API_URL_PREVIEW?: string;
  CONTABILIDAD_RECORD_PAYMENT_URL?: string;
  CONTABILIDAD_RECORD_PAYMENT_URL_PREVIEW?: string;
  VERCEL_ENV?: string;
  VERCEL?: string;
  NODE_ENV?: string;
  NODE_TEST_CONTEXT?: string;
  [key: string]: string | undefined;
}

export function isPreviewEnvironment(
  env: ContabilidadEnv = process.env
): boolean {
  return (
    env.VERCEL_ENV === "preview" ||
    (Boolean(env.VERCEL) && env.VERCEL_ENV !== "production")
  );
}

export function resolveContabilidadApiUrl(
  env: ContabilidadEnv = process.env
): string {
  const isTestRuntime = env.NODE_ENV === "test" || Boolean(env.NODE_TEST_CONTEXT);
  const isPreview = isPreviewEnvironment(env);

  // 1. En runtime de pruebas: Bloqueo estricto de endpoints públicos; solo admitir loopback
  if (isTestRuntime) {
    const configuredUrl = isPreview
      ? env.CONTABILIDAD_API_URL_PREVIEW?.trim()
      : (env.CONTABILIDAD_API_URL_PREVIEW?.trim() || env.CONTABILIDAD_API_URL?.trim());
    if (configuredUrl) {
      return isLoopbackUrl(configuredUrl) ? configuredUrl : "";
    }
    return "";
  }

  // 2. En entorno Preview: NUNCA usar la URL de producción por defecto
  // Permitir únicamente una variable dedicada CONTABILIDAD_API_URL_PREVIEW que no apunte a producción
  if (isPreview) {
    const previewUrl = env.CONTABILIDAD_API_URL_PREVIEW?.trim();
    if (!previewUrl) {
      return "";
    }
    if (isProductionContabilidadUrl(previewUrl)) {
      console.warn(
        "[contabilidad][SECURITY FATAL] CONTABILIDAD_API_URL_PREVIEW apunta a la aplicación de producción. Conexión rechazada por fallo seguro."
      );
      return "";
    }
    return previewUrl;
  }

  // 3. Fuera de Preview (producción y desarrollo local estándar)
  const configuredUrl = env.CONTABILIDAD_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }
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
/**
 * Normaliza un campo de la respuesta remota: `null`, tipos inesperados y cadenas
 * vacías se convierten en `undefined` (ausente). Un `null` del JSON no debe
 * borrar una referencia ya persistida.
 */
export function normalizarTexto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

export async function createInvoiceInContabilidad(
  params: CreateInvoiceParams
): Promise<ContabilidadInvoiceResult> {
  const apiUrl = resolveContabilidadApiUrl();
  if (!apiUrl) {
    return {
      ok: false,
      error: "Integración con Contabilidad deshabilitada: falta CONTABILIDAD_API_URL.",
      remoteOutcome: "not_attempted",
    };
  }

  try {
    const res = await fetch(apiUrl, {
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
        // 4xx = el servidor rechazó la petición; 5xx = pudo crearla y fallar después.
        remoteOutcome: res.status >= 400 && res.status < 500 ? "rejected" : "ambiguous",
      };
    }

    const data = await res.json();
    if (data && typeof data === "object" && data.ok === false) {
      return {
        ok: false,
        error: "Contabilidad rechazó la solicitud de factura.",
        remoteOutcome: "rejected",
      };
    }
    if (!data || typeof data !== "object" || data.ok !== true) {
      return {
        ok: false,
        error: "Respuesta de Contabilidad no concluyente al crear factura.",
        remoteOutcome: "ambiguous",
      };
    }
    const invoiceNumber = normalizarTexto(data.invoiceNumber);
    const invoiceId = normalizarTexto(data.invoiceId);
    if (!invoiceNumber || !invoiceId) {
      return {
        ok: false,
        invoiceNumber,
        invoiceId,
        invoiceUrl: normalizarTexto(data.invoiceUrl),
        invoicePdfUrl: normalizarTexto(data.invoicePdfUrl),
        error: "Respuesta de Contabilidad incompleta; no se puede confirmar la referencia de factura.",
        remoteOutcome: "ambiguous",
      };
    }
    return {
      ok: true,
      invoiceNumber,
      invoiceId,
      invoiceUrl: normalizarTexto(data.invoiceUrl),
      invoicePdfUrl: normalizarTexto(data.invoicePdfUrl),
      total: data.total,
      customerName: data.customerName,
      remoteOutcome: "created",
    };
  } catch (err: any) {
    console.warn("[contabilidad] Fallo de conexión al crear factura", {
      error: safeIntegrationErrorName(err),
    });
    return {
      ok: false,
      error: "Fallo de conexión al crear factura en Contabilidad.",
      // La petición pudo llegar y crear la factura: no es un rechazo demostrado.
      remoteOutcome: "ambiguous",
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
  orderId?: string;
  invoiceNumber?: string;
  invoiceId?: string;
  /** Importe aplicado al pago persistido; independiente del total de factura. */
  amount?: number;
  /** Total de la factura devuelto por Contabilidad. */
  total?: number;
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
    const isPreview = isPreviewEnvironment();
    let paymentUrl: string;
    const explicitPaymentUrl = isPreview
      ? process.env.CONTABILIDAD_RECORD_PAYMENT_URL_PREVIEW?.trim()
      : (process.env.CONTABILIDAD_RECORD_PAYMENT_URL_PREVIEW?.trim() || process.env.CONTABILIDAD_RECORD_PAYMENT_URL?.trim());

    if (explicitPaymentUrl) {
      if (isTestRuntime() && !isLoopbackUrl(explicitPaymentUrl)) {
        return { ok: false, error: "Integración externa deshabilitada durante las pruebas." };
      }
      if (isPreview && isProductionContabilidadUrl(explicitPaymentUrl)) {
        console.warn("[contabilidad][SECURITY FATAL] URL de pago apunta a producción en Preview. Conexión rechazada por fallo seguro.");
        return { ok: false, error: "Conexión a Contabilidad de producción rechazada en Preview por seguridad." };
      }
      paymentUrl = explicitPaymentUrl;
    } else {
      const apiUrl = resolveContabilidadApiUrl();
      if (!apiUrl) {
        return {
          ok: false,
          error: "Integración con Contabilidad deshabilitada: falta CONTABILIDAD_API_URL.",
        };
      }
      const baseApi = apiUrl.replace(/\/create-from-order\/?$/, "");
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
      ok: data.ok === true,
      alreadyPaid: typeof data.alreadyPaid === "boolean" ? data.alreadyPaid : undefined,
      orderId: typeof data.orderId === "string" ? data.orderId : undefined,
      invoiceNumber: data.invoiceNumber,
      invoiceId: data.invoiceId,
      amount: typeof data.amount === "number" ? data.amount : undefined,
      total: typeof data.total === "number" ? data.total : undefined,
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
