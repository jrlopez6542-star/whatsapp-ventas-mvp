const fs = require('fs');
const dotenv = fs.readFileSync('.env.production.local', 'utf8');
const lines = dotenv.split('\n');
for (const line of lines) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const { createClient } = require('@libsql/client');
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  try {
    const convs = await client.execute('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 10');
    console.log('Conversations:');
    for (const row of convs.rows) {
      console.log(row.id, row.phone, row.status, new Date(row.updated_at).toLocaleString());
    }
    const msgs = await client.execute('SELECT * FROM messages ORDER BY created_at DESC LIMIT 10');
    console.log('\nRecent Messages:');
    for (const row of msgs.rows) {
      console.log(`[${row.role}] (${row.conversation_id}): ${row.body?.slice(0, 50)}...`);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
main();
