import os
import re

with open('app/panel/OrdersView.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add th
code = code.replace('<th className="p-4 font-semibold">Fecha</th>\n                </tr>', 
'<th className="p-4 font-semibold">Fecha</th>\n                    <th className="p-4 font-semibold text-right">Acciones</th>\n                </tr>')

# Add td
td = '''<td className="p-4 text-slate-500 text-xs">
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteOrder(o.id); }}
                        className="text-slate-500 hover:text-red-500 transition p-2 rounded-md hover:bg-red-500/10"
                        title="Eliminar pedido"
                      >
                        <i className="ph ph-trash text-lg"></i>
                      </button>
                    </td>'''

code = re.sub(r'<td className="p-4 text-slate-500 text-xs">\s*\{new Date\(o\.createdAt\)\.toLocaleString\(\)\}\s*</td>', td, code)

# Add deleteOrder function
delete_fn = '''  const deleteOrder = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este pedido? Esta acción no se puede deshacer.")) return;
    
    try {
      const res = await fetch(`/api/panel/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setOrders(orders.filter(o => o.id !== id));
      } else {
        alert("Error al eliminar el pedido.");
      }
    } catch (err) {
      alert("Error de conexión al eliminar el pedido.");
    }
  };

  useEffect(() => {'''

code = code.replace('useEffect(() => {', delete_fn, 1)

with open('app/panel/OrdersView.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
