const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

const str = `        {/* ========================================================= */}
        </div>
      </div>

      {/* OTHER TABS */} 
      <div className="crm-main-content" style={{ display: tab !== "chats" ? "block" : "none" }}>
        </div>
      </div>

      {/* OTHER TABS */} 
      <div className="crm-main-content" style={{ display: tab !== "chats" ? "block" : "none", width: "100%" }}>`;

const fixed = `        {/* ========================================================= */}
        </div>
      </div>

      {/* OTHER TABS */} 
      <div className="crm-main-content" style={{ display: tab !== "chats" ? "block" : "none", width: "100%" }}>`;

code = code.replace(str, fixed);

fs.writeFileSync('app/panel/page.tsx', code);
console.log('Fixed');
