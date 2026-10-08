import sys

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

search = '''{tab === ("qr" as any) && <div className="text-white p-4">QR / Vincular - En desarrollo</div>}
          </main>
        )}

      </div>
    </>
  );'''

replace = '''{tab === ("qr" as any) && <div className="text-white p-4">QR / Vincular - En desarrollo</div>}
          </main>
        )}
        
        </div>

      </div>
    </>
  );'''

code = code.replace(search, replace)
with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed")
