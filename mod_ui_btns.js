const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

const replacement = `
                            <div className="crm-bubble">
                              {(() => {
                                const btnRegex = /\\[BOTONES:\\s*(.+?)\\]/i;
                                const match = m.content.match(btnRegex);
                                if (!match) return m.content;
                                const text = m.content.replace(btnRegex, '').trim();
                                const buttons = match[1].split('|').map(b => b.trim()).filter(b => b);
                                return (
                                  <>
                                    <div>{text}</div>
                                    {buttons.length > 0 && (
                                      <div className="crm-interactive-btns">
                                        {buttons.map((b, i) => (
                                          <button key={i} className="crm-interactive-btn">
                                            {b}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
`;

code = code.replace(/<div className="crm-bubble">\s*\{m\.content\}\s*\{\/\* TODO: Render Interactive buttons here if any \*\/\}\s*<\/div>/g, replacement);

fs.writeFileSync('app/panel/page.tsx', code);
