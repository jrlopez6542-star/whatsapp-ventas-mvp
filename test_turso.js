const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.production.local' });
async function main() {
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  const res = await c.execute('SELECT * FROM messages ORDER BY rowid DESC LIMIT 5');
  console.log(res.rows);
}
main().catch(console.error);
