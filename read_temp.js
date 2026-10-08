const fs = require('fs');
const code = fs.readFileSync('temp_old_page.tsx', 'utf8');

const startOrders = code.indexOf('{activeTab === "orders"');
if (startOrders > -1) {
    console.log("=== ORDERS ===");
    console.log(code.substring(startOrders, startOrders + 3000));
} else {
    console.log('No orders');
}

const startSettings = code.indexOf('{activeTab === "settings"');
if (startSettings > -1) {
    console.log("=== SETTINGS ===");
    console.log(code.substring(startSettings, startSettings + 3000));
} else {
    console.log('No settings');
}
