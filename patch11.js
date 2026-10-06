const fs = require('fs');
let c = fs.readFileSync('app/panel/page.tsx', 'utf8');

c = c.replace(
  /await fetch\(`\/api\/panel\/conversations\/\$\{encodeURIComponent\(selectedConvId\)\}\/messages`\)/g,
  'await fetch(`/api/panel/conversations/${encodeURIComponent(selectedConvId)}/messages`, { cache: "no-store" })'
);

c = c.replace(
  /await fetch\(`\/api\/panel\/conversations\/\$\{encodeURIComponent\(convId\)\}`/g,
  'await fetch(`/api/panel/conversations/${encodeURIComponent(convId)}`, { cache: "no-store", ...'
);

// wait, the second one is a DELETE request, it already has method: "DELETE" inside an object, so no need to touch it.

fs.writeFileSync('app/panel/page.tsx', c);
