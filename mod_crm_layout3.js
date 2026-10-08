const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

code = code.replace(
  /\{\/\* ========================================================= \*\/\}\r?\n\s*\{\/\* TAB 2: PEDIDOS/,
  `</div>\n      </div>\n\n      {/* OTHER TABS */} \n      <div className="crm-main-content" style={{ display: tab !== "chats" ? "block" : "none", width: "100%" }}>\n        {/* ========================================================= */}\n        {/* TAB 2: PEDIDOS`
);

code = code.replace(
  '</main>',
  '      </div>\n    </div>'
);

fs.writeFileSync('app/panel/page.tsx', code);
