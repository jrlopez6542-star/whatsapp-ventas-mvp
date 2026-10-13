"use client";

import React, { useState, useEffect } from "react";

interface Product {
  sku: string;
  name: string;
  price: number;
  active: boolean;
  description?: string;
}

export function CatalogView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "bunuelos" | "bebidas">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states for new/edit
  const [formSku, setFormSku] = useState("");
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Upsell Drinks state
  const [upsellDrinks, setUpsellDrinks] = useState(true);
  const [togglingUpsell, setTogglingUpsell] = useState(false);

  const loadProducts = async () => {
    try {
      const res = await fetch("/api/panel/products", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && Array.isArray(data.products)) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error("Error loading products:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    fetch("/api/panel/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.settings) {
          setUpsellDrinks(d.settings.upsellDrinksEnabled !== "false");
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleUpsellDrinks = async (enabled: boolean) => {
    setTogglingUpsell(true);
    setUpsellDrinks(enabled);
    try {
      await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upsellDrinksEnabled: enabled ? "true" : "false" }),
      });
    } catch {
      alert("Error al actualizar la configuración de bebidas.");
    } finally {
      setTogglingUpsell(false);
    }
  };

  const handleToggleActive = async (sku: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/panel/products/${encodeURIComponent(sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        setProducts(prev =>
          prev.map(p => (p.sku === sku ? { ...p, active: !currentActive } : p))
        );
      } else {
        alert("No se pudo actualizar el estado del producto.");
      }
    } catch {
      alert("Error de conexión al actualizar el producto.");
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSku.trim() || !formName.trim() || !formPrice) {
      alert("Por favor completa el código SKU, nombre y precio.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/panel/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: formSku.trim().toUpperCase(),
          name: formName.trim(),
          price: Number(formPrice),
          description: formDesc.trim(),
          active: true,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setEditingProduct(null);
        setFormSku("");
        setFormName("");
        setFormPrice("");
        setFormDesc("");
        loadProducts();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Error al guardar el producto.");
      }
    } catch {
      alert("Error de conexión al guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormSku(p.sku);
    setFormName(p.name);
    setFormPrice(String(p.price));
    setFormDesc(p.description || "");
    setShowAddModal(true);
  };

  const openCreateModal = (type: "bunuelo" | "bebida") => {
    setEditingProduct(null);
    if (type === "bebida") {
      setFormSku("BEB_");
      setFormName("");
      setFormPrice("4000");
      setFormDesc("Bebida fría o caliente para acompañar.");
    } else {
      setFormSku("C");
      setFormName("");
      setFormPrice("18000");
      setFormDesc("Caja de buñuelos calientes.");
    }
    setShowAddModal(true);
  };

  const isBeverage = (p: Product) => {
    const s = p.sku.toUpperCase();
    const n = p.name.toLowerCase();
    return (
      s.startsWith("BEB_") ||
      n.includes("café") ||
      n.includes("cafe") ||
      n.includes("chocolate") ||
      n.includes("gaseosa") ||
      n.includes("jugo") ||
      n.includes("agua")
    );
  };

  const bunuelosList = products.filter(p => !isBeverage(p));
  const bebidasList = products.filter(p => isBeverage(p));

  const filteredProducts =
    filter === "all"
      ? products
      : filter === "bunuelos"
      ? bunuelosList
      : bebidasList;

  return (
    <div className="p-6 pt-16 md:pt-6 text-slate-300 w-full h-full overflow-y-auto">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <i className="ph-fill ph-coffee text-amber-400"></i> Menú de Productos y Bebidas
          </h1>
          <p className="text-sm text-slate-400">
            Controla las cajas de buñuelos y bebidas que el bot ofrece automáticamente en WhatsApp.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => openCreateModal("bebida")}
            className="bg-[#202c33] hover:bg-[#2a3942] border border-[#2a3942] text-amber-400 px-4 py-2 rounded-lg transition flex items-center gap-2 text-sm font-medium"
          >
            <i className="ph ph-plus"></i> + Agregar Bebida
          </button>
          <button
            onClick={() => openCreateModal("bunuelo")}
            className="bg-[#007aff] hover:bg-[#005bb5] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            <i className="ph ph-plus"></i> + Agregar Caja
          </button>
        </div>
      </div>

      {/* BANNER INTERRUPTOR BEBIDAS */}
      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
              upsellDrinks ? "bg-amber-500/10 text-amber-400" : "bg-slate-500/10 text-slate-500"
            }`}
          >
            <i className="ph-fill ph-coffee"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-sm">
                Ofrecer Bebidas en WhatsApp (Upselling de Venta)
              </h3>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                  upsellDrinks
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                }`}
              >
                {upsellDrinks ? "ACTIVADO" : "APAGADO"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {upsellDrinks
                ? "El bot sugiere bebidas frías o calientes a los clientes automáticamente después de elegir buñuelos."
                : "El bot NO sugerirá bebidas. Pasará directamente a pedir la dirección de entrega."}
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={upsellDrinks}
            disabled={togglingUpsell}
            onChange={(e) => handleToggleUpsellDrinks(e.target.checked)}
          />
          <div className="w-11 h-6 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
        </label>
      </div>

      {/* TABS FILTER */}
      <div className="flex gap-2 mb-6 border-b border-[#1f2c34] pb-3">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            filter === "all"
              ? "bg-[#007aff] text-white"
              : "bg-[#121b22] text-slate-400 hover:text-white border border-[#1f2c34]"
          }`}
        >
          Todos ({products.length})
        </button>
        <button
          onClick={() => setFilter("bebidas")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
            filter === "bebidas"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"
              : "bg-[#121b22] text-slate-400 hover:text-white border border-[#1f2c34]"
          }`}
        >
          ☕🥤 Bebidas ({bebidasList.length})
        </button>
        <button
          onClick={() => setFilter("bunuelos")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
            filter === "bunuelos"
              ? "bg-[#007aff]/20 text-[#53bdeb] border border-[#007aff]/30 font-semibold"
              : "bg-[#121b22] text-slate-400 hover:text-white border border-[#1f2c34]"
          }`}
        >
          🥟 Buñuelos ({bunuelosList.length})
        </button>
      </div>

      {/* PRODUCTS GRID */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <i className="ph ph-spinner animate-spin text-3xl mb-2"></i>
          <p>Cargando catálogo...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl p-12 text-center text-slate-500">
          <i className="ph ph-package text-5xl mb-3 text-slate-600"></i>
          <p className="font-semibold text-slate-300">No hay productos en esta categoría.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(p => {
            const isBeb = isBeverage(p);

            return (
              <div
                key={p.sku}
                className={`bg-[#121b22] border rounded-xl p-5 transition flex flex-col justify-between ${
                  p.active
                    ? isBeb
                      ? "border-[#1f2c34] hover:border-amber-500/30"
                      : "border-[#1f2c34] hover:border-[#007aff]/30"
                    : "border-[#1f2c34]/50 opacity-60 bg-[#0f171d]"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
                          isBeb
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-[#007aff]/10 text-[#007aff]"
                        }`}
                      >
                        <i className={isBeb ? "ph-fill ph-coffee" : "ph-fill ph-package"}></i>
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base leading-snug">{p.name}</h3>
                        <span className="text-[11px] font-mono text-slate-500 uppercase">
                          SKU: {p.sku}
                        </span>
                      </div>
                    </div>

                    {/* SWITCH ACTIVO */}
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={p.active}
                        onChange={() => handleToggleActive(p.sku, p.active)}
                      />
                      <div className="w-9 h-5 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  <p className="text-xs text-slate-400 mt-2 mb-4 leading-relaxed line-clamp-2">
                    {p.description || "Sin descripción"}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#1f2c34] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">
                      PRECIO COP
                    </span>
                    <span className="text-lg font-bold text-emerald-400">
                      ${p.price.toLocaleString("es-CO")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                        p.active
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                      }`}
                    >
                      {p.active ? "En Menú" : "Agotado"}
                    </span>
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-300 hover:text-white transition"
                      title="Editar precio o descripción"
                    >
                      <i className="ph ph-pencil-simple text-base"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CREAR / EDITAR PRODUCTO */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4">
          <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="p-5 border-b border-[#1f2c34] flex justify-between items-center bg-[#162128] rounded-t-xl">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <i className="ph-fill ph-package text-[#007aff]"></i>
                {editingProduct ? "Editar Producto" : "Nuevo Producto o Bebida"}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingProduct(null);
                }}
                className="text-slate-400 hover:text-white transition"
              >
                <i className="ph ph-x text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  CÓDIGO SKU (ÚNICO)
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingProduct)}
                  value={formSku}
                  onChange={e => setFormSku(e.target.value)}
                  placeholder="Ej. BEB_CHOC o C4S"
                  className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none font-mono disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  NOMBRE DEL PRODUCTO
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ej. Chocolate Caliente Tradicional"
                  className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  PRECIO EN COP ($)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="500"
                  value={formPrice}
                  onChange={e => setFormPrice(e.target.value)}
                  placeholder="Ej. 4000"
                  className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  DESCRIPCIÓN
                </label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="Ej. Bebida caliente espumosa ideal para acompañar buñuelos."
                  className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none resize-none"
                />
              </div>

              <div className="pt-3 border-t border-[#1f2c34] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-300 text-sm font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-[#007aff] hover:bg-[#005bb5] disabled:opacity-50 text-white text-sm font-semibold transition flex items-center gap-2"
                >
                  {saving && <i className="ph ph-spinner animate-spin"></i>}
                  {saving ? "Guardando..." : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
