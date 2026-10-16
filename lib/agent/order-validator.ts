import { getProducts } from "@/lib/store";

export interface CatalogPriceItem {
  sku: string;
  name: string;
  price: number;
  category: "boxes" | "singles" | "drinks";
}

export const OFFICIAL_PRICES: CatalogPriceItem[] = [
  { sku: "C8S", name: "Caja x8 Buñuelos Surtidos", price: 34000, category: "boxes" },
  { sku: "C8T", name: "Caja x8 Buñuelos Tradicionales", price: 32000, category: "boxes" },
  { sku: "C4S", name: "Caja x4 Buñuelos Surtidos", price: 18000, category: "boxes" },
  { sku: "C4T", name: "Caja x4 Buñuelos Tradicionales", price: 16000, category: "boxes" },
  { sku: "BM", name: "Buñuelo Relleno Mora", price: 4500, category: "singles" },
  { sku: "BA", name: "Buñuelo Relleno Arequipe", price: 4500, category: "singles" },
  { sku: "BQ", name: "Buñuelo Relleno Queso", price: 4500, category: "singles" },
  { sku: "BC", name: "Buñuelo Tradicional Costeño", price: 4000, category: "singles" },
  { sku: "BEB_CAFE", name: "Café campesino", price: 3500, category: "drinks" },
  { sku: "BEB_CHOC", name: "Chocolate caliente", price: 4000, category: "drinks" },
  { sku: "BEB_GAS", name: "Gaseosa", price: 4500, category: "drinks" },
  { sku: "BEB_JUGO", name: "Jugo de mora", price: 6000, category: "drinks" },
  { sku: "BEB_AGUA", name: "Agua", price: 3000, category: "drinks" },
];

/**
 * Retorna el catálogo oficial con precios actualizados de Turso o fallbacks predeterminados.
 */
export async function getCatalogWithPrices(): Promise<CatalogPriceItem[]> {
  try {
    const dbProducts = await getProducts(true);
    if (dbProducts && dbProducts.length > 0) {
      return dbProducts.map((p) => {
        const fallback = OFFICIAL_PRICES.find((f) => f.sku === p.sku);
        const prodCat = (p as { category?: string }).category;
        return {
          sku: p.sku,
          name: p.name,
          price: p.price ?? fallback?.price ?? 0,
          category: (prodCat as "boxes" | "singles" | "drinks") || fallback?.category || "boxes",
        };
      });
    }
  } catch (err) {
    console.warn("[order-validator] Error cargando productos de base de datos:", err);
  }
  return OFFICIAL_PRICES;
}

/**
 * Valida si el cliente ha indicado salsas válidas en el historial de mensajes.
 */
export function hasValidSauceSelection(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const patterns = [
    /\bmora\b/i,
    /\barequipe\b/i,
    /\bbocadillo\b/i,
    /\bsuero\b/i,
    /\bcoste[ñn]o\b/i,
    /\btodas\b/i,
    /\bde todas\b/i,
    /\bde todos\b/i,
    /\bcombinad[ao]s?\b/i,
    /\bsin salsa\b/i,
    /\bninguna salsa\b/i,
    /\bsurtid[ao] de todo\b/i,
    /\btodos los sabores\b/i,
  ];
  return patterns.some((p) => p.test(lower));
}

/**
 * Candado determinista: Si hay caja surtida en la orden y no hay salsas elegidas en el historial,
 * pero la IA intenta avanzar a pedir dirección, pedir medio de pago o mostrar el resumen, interceptar.
 */
export function shouldInterceptMissingSauces(
  hasSurtida: boolean,
  historyText: string,
  assistantReply: string
): boolean {
  if (!hasSurtida) return false;
  if (hasValidSauceSelection(historyText)) return false;

  const a = (assistantReply || "").toLowerCase();
  const advancesFlow =
    a.includes("direcci") ||
    a.includes("dirección") ||
    a.includes("dónde") ||
    a.includes("donde te lo") ||
    a.includes("medio de pago") ||
    a.includes("cómo deseas pagar") ||
    a.includes("resumen de tu pedido") ||
    a.includes("1️⃣") ||
    a.includes("confirmar pedido");

  return advancesFlow;
}

export const MISSING_SAUCES_INTERCEPT_MESSAGE =
  "¡Excelente elección con tu caja surtida! 🤤 ¿Qué salsas prefieres para acompañar tus buñuelos? Tenemos Mora, Arequipe, Bocadillo y Suero Costeño (puedes combinarlas como prefieras o pedir de todas).";

/**
 * Candado matemático: Recalcula estrictamente el total del pedido multiplicando cantidad * precio oficial.
 * Garantiza tarifa de domicilio $0 (deliveryFee = 0) y descarta alucinaciones numéricas del LLM.
 */
export function recalculateOrderTotal(
  items: Array<{ sku: string; quantity: number; unitPrice?: number; name?: string }>,
  catalog: CatalogPriceItem[] = OFFICIAL_PRICES
): { items: Array<{ sku: string; quantity: number; unitPrice: number; name?: string }>; total: number; deliveryFee: number } {
  let total = 0;
  const recalculatedItems = items.map((item) => {
    const catalogItem = catalog.find((c) => c.sku.toUpperCase() === item.sku.toUpperCase()) ||
      OFFICIAL_PRICES.find((f) => f.sku.toUpperCase() === item.sku.toUpperCase());
    
    const unitPrice = catalogItem ? catalogItem.price : (item.unitPrice || 0);
    const quantity = Math.max(1, item.quantity || 1);
    total += unitPrice * quantity;

    return {
      sku: item.sku,
      quantity,
      unitPrice,
      name: item.name || catalogItem?.name || item.sku,
    };
  });

  return {
    items: recalculatedItems,
    total,
    deliveryFee: 0,
  };
}

/**
 * Detecta si una dirección o texto de usuario especifica explícitamente una ciudad o departamento
 * fuera de la zona de cobertura oficial de Tocancipá y alrededores.
 */
export function checkCoverageLocation(text: string): {
  isOutOfCoverage: boolean;
  detectedLocation?: string;
  isAmbiguous: boolean;
} {
  if (!text || typeof text !== "string") {
    return { isOutOfCoverage: false, isAmbiguous: true };
  }

  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Ciudades y departamentos explícitamente fuera de cobertura de Tocancipá
  const outOfCoveragePatterns: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /\bneiva\b/i, name: "Neiva" },
    { pattern: /\bhuila\b/i, name: "Huila" },
    { pattern: /\bmedell[ií]n\b/i, name: "Medellín" },
    { pattern: /\bantioquia\b/i, name: "Antioquia" },
    { pattern: /\bcali\b/i, name: "Cali" },
    { pattern: /\bvalle\s+del\s+cauca\b/i, name: "Valle del Cauca" },
    { pattern: /\bbarranquilla\b/i, name: "Barranquilla" },
    { pattern: /\batl[aá]ntico\b/i, name: "Atlántico" },
    { pattern: /\bbucaramanga\b/i, name: "Bucaramanga" },
    { pattern: /\bsantander\b/i, name: "Santander" },
    { pattern: /\bcartagena\b/i, name: "Cartagena" },
    { pattern: /\bpereira\b/i, name: "Pereira" },
    { pattern: /\brisaralda\b/i, name: "Risaralda" },
    { pattern: /\bmanizales\b/i, name: "Manizales" },
    { pattern: /\bcaldas\b/i, name: "Caldas" },
    { pattern: /\bibagu[eé]\b/i, name: "Ibagué" },
    { pattern: /\btolima\b/i, name: "Tolima" },
    { pattern: /\bvillavicencio\b/i, name: "Villavicencio" },
    { pattern: /\bmeta\b/i, name: "Meta" },
    { pattern: /\bc[uú]cuta\b/i, name: "Cúcuta" },
    { pattern: /\bsanta\s+marta\b/i, name: "Santa Marta" },
    { pattern: /\bpasto\b/i, name: "Pasto" },
    { pattern: /\bnari[ñn]o\b/i, name: "Nariño" },
    { pattern: /\barmenia\b/i, name: "Armenia" },
    { pattern: /\bquind[ií]o\b/i, name: "Quindío" },
    { pattern: /\bpopay[aá]n\b/i, name: "Popayán" },
    { pattern: /\bcauca\b/i, name: "Cauca" },
    { pattern: /\bmonter[ií]a\b/i, name: "Montería" },
    { pattern: /\bc[oó]rdoba\b/i, name: "Córdoba" },
    { pattern: /\bvalledupar\b/i, name: "Valledupar" },
    { pattern: /\bcesar\b/i, name: "Cesar" },
    { pattern: /\bsincelejo\b/i, name: "Sincelejo" },
    { pattern: /\bsucre\b/i, name: "Sucre" },
    { pattern: /\briohacha\b/i, name: "Riohacha" },
    { pattern: /\bla\s+guajira\b/i, name: "La Guajira" },
    { pattern: /\bflorencia\b/i, name: "Florencia" },
    { pattern: /\byopal\b/i, name: "Yopal" },
    { pattern: /\bcasanare\b/i, name: "Casanare" },
    { pattern: /\bquibd[oó]\b/i, name: "Quibdó" },
    { pattern: /\bchoc[oó]\b/i, name: "Chocó" },
  ];

  for (const item of outOfCoveragePatterns) {
    if (item.pattern.test(lower)) {
      return { isOutOfCoverage: true, detectedLocation: item.name, isAmbiguous: false };
    }
  }

  // 2. Detección de ambigüedad si no contiene ninguna estructura de dirección, conjunto, vereda, o coordenadas
  const hasStreetIndicator =
    /\b(?:calle|cll|cl|carrera|cra|cr|kra|kr|diagonal|diag|dg|transversal|trans|tv|avenida|av|autopista|circular|circunvalar)\b/i.test(
      lower
    ) ||
    /\b(?:conjunto|condominio|urbanizaci[oó]n|urb|edificio|edif|ciudadela|reserva|altos|portales|bosques|villas|terrazas|barrio|manzana|mz|lote|casa|apto|torre)\b/i.test(
      lower
    ) ||
    /\b(?:vereda|vda|finca|granja|hacienda|sector|km|kil[oó]metro)\b/i.test(lower) ||
    /\b(?:tocancip[aá]|gachancip[aá]|sop[oó]|brice[ñn]o|zipaquir[aá]|chia|ch[ií]a|cajic[aá])\b/i.test(lower) ||
    /https?:\/\/(?:maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(lower) ||
    /[-+]?\d{1,2}\.\d+,\s*[-+]?\d{1,3}\.\d+/.test(clean);

  // Palabras comunes no-dirección (ej: "si", "ok", "bueno", "gracias", etc.)
  const trivialWords = ["si", "sí", "ok", "vale", "bueno", "gracias", "hola", "buenas", "no", "dale", "listo", "ya"];
  const isTrivial = trivialWords.includes(lower.replace(/[.!?,]/g, "").trim());

  if (!hasStreetIndicator && (isTrivial || clean.length < 5)) {
    return { isOutOfCoverage: false, isAmbiguous: true };
  }

  return { isOutOfCoverage: false, isAmbiguous: false };
}

export function getOutOfCoverageMessage(
  detectedCity: string,
  businessCity = "Tocancipá, Cundinamarca",
  coverageArea = "Tocancipá y alrededores"
): string {
  return `¡Hola! Te cuento que en *BUÑUELANDIA* nuestros buñuelos recién hechos se hornean y despachan exclusivamente desde *${businessCity}* (cobertura: ${coverageArea}). Actualmente no tenemos cobertura directa de domicilio hasta ${detectedCity}. Te he comunicado con un asesor humano para evaluar opciones o pedidos especiales. 🥟🛵`;
}
