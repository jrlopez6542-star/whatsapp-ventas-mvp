with open('app/panel/SettingsView.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

test_ai = """
      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden max-w-2xl mt-8">
        <div className="p-6">
          <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <i className="ph-fill ph-flask text-purple-400"></i> Pruebas de APIs (Test IA)
          </h2>
          <p className="text-sm text-slate-400 mb-6">Herramientas para desarrolladores para comprobar conexiones con Gemini y Evolution API.</p>
          
          <div className="space-y-3">
            <button onClick={() => window.open('/api/test', '_blank')} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-slate-300 font-medium px-4 py-3 rounded-lg border border-[#2a3942] transition flex items-center gap-3">
              <i className="ph-fill ph-robot text-emerald-400 text-lg"></i> Probar Conexión con Gemini AI
            </button>
            <button onClick={() => window.open('/api/test2', '_blank')} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-slate-300 font-medium px-4 py-3 rounded-lg border border-[#2a3942] transition flex items-center gap-3">
              <i className="ph-fill ph-whatsapp-logo text-green-500 text-lg"></i> Probar Envio a Evolution API
            </button>
            <button onClick={() => window.open('/api/test-order', '_blank')} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-slate-300 font-medium px-4 py-3 rounded-lg border border-[#2a3942] transition flex items-center gap-3">
              <i className="ph-fill ph-package text-blue-400 text-lg"></i> Simular Pedido Terminado (Test AI)
            </button>
          </div>
        </div>
      </div>
"""

code = code.replace(
    '    </div>\n  );\n}',
    test_ai + '\n    </div>\n  );\n}'
)

with open('app/panel/SettingsView.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
