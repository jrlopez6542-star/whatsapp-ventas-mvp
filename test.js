const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

console.log('URL:', process.env.TURSO_DATABASE_URL ? 'YES' : 'NO');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  try {
    const res = await client.execute('SELECT * FROM messages ORDER BY rowid DESC LIMIT 5');
    console.log('MESSAGES COUNT:', res.rows.length);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  }
}
main();
