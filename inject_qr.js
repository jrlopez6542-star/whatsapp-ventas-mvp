const fs = require('fs');

let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

const importStatement = `import { QrModal } from "./QrModal";\n`;
code = code.replace(`import { OrdersView } from "./OrdersView";\n`, `import { OrdersView } from "./OrdersView";\n` + importStatement);

const renderBlock = `{/* QR MODAL */}
        {showQrModal && <QrModal onClose={() => setShowQrModal(false)} />}
        
        {/* HAMBURGER MENU (MOBILE ONLY) */}`;
code = code.replace(`{/* HAMBURGER MENU (MOBILE ONLY) */}`, renderBlock);

// Remove the old unused state variables from page.tsx to clean it up
code = code.replace(/const \[qrStatus, setQrStatus\].*?\n/g, '');
code = code.replace(/const \[qrLoading, setQrLoading\].*?\n/g, '');
code = code.replace(/const \[qrError, setQrError\].*?\n/g, '');
code = code.replace(/const \[secondsRemaining, setSecondsRemaining\].*?\n/g, '');
code = code.replace(/const \[isRenewing, setIsRenewing\].*?\n/g, '');
code = code.replace(/const \[selectedInstance, setSelectedInstance\].*?\n/g, '');

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Injected QrModal");
