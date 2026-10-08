const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// 1. Add toggleMobileMode
if (!code.includes('const toggleMobileMode = () => {')) {
  code = code.replace(
    'return (\n    <>',
    `const toggleMobileMode = () => {
    setIsMobileMode(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('crm_mobile_mode', String(next));
      return next;
    });
  };

  return (
    <>`
  );
}

// 2. Fix the initial state
const wrongRegex = /const \[isMobileMode, setIsMobileMode\] = useState\(false\);\s*useEffect\(\(\) => \{ if \(typeof window !== 'undefined' && window\.innerWidth < 768\) setIsMobileMode\(true\); \}, \[\]\);/;
if (wrongRegex.test(code)) {
  code = code.replace(wrongRegex, `const [isMobileMode, setIsMobileMode] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm_mobile_mode');
      if (saved !== null) {
        setIsMobileMode(saved === 'true');
      } else if (window.innerWidth < 768) {
        setIsMobileMode(true);
      }
    }
  }, []);`);
}

fs.writeFileSync('app/panel/page.tsx', code);
console.log('Fixed page.tsx');
