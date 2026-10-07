const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// 1. Add fields to interface
if (!code.includes('extraPrompt?: string;')) {
  code = code.replace(
    'outOfHoursMessage?: string;\n}',
    'outOfHoursMessage?: string;\n  extraPrompt?: string;\n  botObjective?: string;\n}'
  );
}

// 2. Default state
code = code.replace(
  'outOfHoursMessage: "" });',
  'outOfHoursMessage: "", extraPrompt: "", botObjective: "" });'
);

// 3. Add fields to the settings UI!
const toneFieldTarget = `<div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Tono de Comunicación
                </label>
                <input
                  type="text"
                  value={settings.tone}
                  onChange={(e) => setSettings({ ...settings, tone: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>`;

const newFields = `<div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Objetivo Principal del Bot (Opcional)
                </label>
                <input
                  type="text"
                  value={settings.botObjective || ""}
                  onChange={(e) => setSettings({ ...settings, botObjective: e.target.value })}
                  placeholder="Ej: Vender la mayor cantidad de buñuelos."
                  style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Instrucciones Especiales / Extra Prompt (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={settings.extraPrompt || ""}
                  onChange={(e) => setSettings({ ...settings, extraPrompt: e.target.value })}
                  placeholder="Ej: Si te preguntan por promociones, diles que mañana hay descuento."
                  style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>`;

// Wait, tone target might have different spaces or encodings. I'll use regex.
const toneRegex = /<div>\s*<label[^>]*>\s*Tono de Comunicación\s*<\/label>\s*<input[^>]*value=\{settings\.tone\}[^>]*\/>\s*<\/div>/is;

code = code.replace(toneRegex, (match) => {
  return match + '\n              ' + newFields;
});

// Also, the user wants "haz una prueba de apis". I will add a button to the bottom of the Settings form to "Test APIs".
const formEndTarget = /<button type="submit" disabled=\{savingSettings\}[^>]*>\s*\{savingSettings \? "Guardando\.\.\." : "Guardar Cambios"\}\s*<\/button>/s;
const apiTestButton = `<div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                <button type="submit" disabled={savingSettings} className="lp-btn lp-btn-primary">
                  {savingSettings ? "Guardando..." : "Guardar Cambios"}
                </button>
                <button 
                  type="button" 
                  className="ghost"
                  onClick={async () => {
                    alert("Probando conexión con Gemini y OpenAI...");
                    const res = await fetch("/api/panel/test-ai");
                    const data = await res.json();
                    if (data.ok) {
                      alert("✅ API funcionando correctamente: " + JSON.stringify(data.results));
                    } else {
                      alert("❌ Error en la prueba de API: " + data.error);
                    }
                  }}
                  style={{ padding: "0.75rem 1.5rem", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", fontWeight: 600 }}
                >
                  🧪 Probar APIs
                </button>
              </div>`;

code = code.replace(formEndTarget, apiTestButton);

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Updated app/panel/page.tsx with AI fields and Test API button");
