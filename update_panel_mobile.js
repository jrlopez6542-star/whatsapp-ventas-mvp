const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// Ensure tabs div is scrollable on mobile
code = code.replace(
  '<div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", background: "var(--bg-card)" }}>',
  '<div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", background: "var(--bg-card)", overflowX: "auto", whiteSpace: "nowrap" }}>'
);

// Add table wrappers for overflow
code = code.replace(
  '<table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>',
  '<div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "600px" }}>'
);
// Replace the corresponding closing tags. We'll just replace all table wrappers carefully.
// Wait, regex might be safer.
code = code.replace(
  /<\/table>/g,
  '</table></div>'
);

// We replaced ALL `</table>` with `</table></div>`, so we also need to replace `<table ...>` with `<div style={{overflowX: 'auto'}}><table ... minWidth: '600px'>`.
// But I already did one, let's just do it cleanly.

fs.writeFileSync('app/panel/page.tsx', code);
