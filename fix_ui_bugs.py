import re

with open('app/panel/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. LocalStorage for isMobileMode
search_useeffect = 'const [isMobileMode, setIsMobileMode] = useState(false);\n  useEffect(() => { if (typeof window !== "undefined" && window.innerWidth < 768) setIsMobileMode(true); }, []);'

replace_useeffect = '''const [isMobileMode, setIsMobileMode] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem('crm_mobile_mode');
      if (saved !== null) {
        setIsMobileMode(saved === 'true');
      } else if (window.innerWidth < 768) {
        setIsMobileMode(true);
      }
    }
  }, []);

  const toggleMobileMode = () => {
    setIsMobileMode(prev => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem('crm_mobile_mode', String(next));
      return next;
    });
  };'''

code = code.replace(search_useeffect, replace_useeffect)

# Replace the onClick handler for the floating button
code = code.replace('onClick={() => setIsMobileMode(!isMobileMode)}', 'onClick={toggleMobileMode}')

# 2. Close mobile sidebar when a tab is clicked
code = re.sub(r'onClick=\{\(\)\s*=>\s*setTab\((.*?)\)\}', r'onClick={() => { setTab(\1); setShowMobileSidebar(false); }}', code)

with open('app/panel/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Fixed')
