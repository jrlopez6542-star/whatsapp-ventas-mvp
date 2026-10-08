const fs = require('fs');
const https = require('http');

const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v) acc[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const base = env.EVOLUTION_API_URL.replace(/\/$/, '');
const apiKey = env.EVOLUTION_API_KEY;

const req = https.request(`${base}/swagger-json`, {
  headers: { 'apikey': apiKey }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      const paths = Object.keys(data.paths).filter(p => p.toLowerCase().includes('button') || p.toLowerCase().includes('list') || p.toLowerCase().includes('interactive'));
      console.log('Available button paths:', paths);
    } catch(e) {
      console.log('Parse error', e.message);
    }
  });
});
req.end();
