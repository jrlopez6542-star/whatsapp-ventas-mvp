import re

with open('app/panel/OrdersView.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the component signature
code = code.replace(
    'export function OrdersView({ orders = [] }: { orders: any[] }) {',
    'export function OrdersView({ orders = [], onOrdersChange }: { orders: any[], onOrdersChange?: () => void }) {'
)

# Insert deleteOrder inside OrdersView
delete_fn = '''  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOrder = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este pedido? Esta acción no se puede deshacer.")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/panel/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (onOrdersChange) onOrdersChange();
      } else {
        alert("Error al eliminar el pedido.");
      }
    } catch (err) {
      alert("Error de conexión al eliminar el pedido.");
    } finally {
      setIsDeleting(false);
    }
  };
'''

code = code.replace(
    '  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);',
    '  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);\n' + delete_fn
)

with open('app/panel/OrdersView.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
