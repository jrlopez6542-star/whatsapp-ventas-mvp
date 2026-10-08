const { execSync } = require('child_process');
const out = execSync('git show 3fb11eb:app/panel/page.tsx').toString();

const ordersIndex = out.indexOf("tab === 'orders'");
const catalogIndex = out.indexOf("tab === 'catalog'");
const settingsIndex = out.indexOf("tab === 'settings'");

console.log("=== ORDERS ===");
console.log(out.substring(ordersIndex, ordersIndex + 1000));
console.log("=== SETTINGS ===");
console.log(out.substring(settingsIndex, settingsIndex + 1500));
