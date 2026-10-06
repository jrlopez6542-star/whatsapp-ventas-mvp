import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/store/db';

export async function GET(req: Request) {
  try {
    const client = getTursoClient();
    let msg = "";
    try {
      await client.execute({
        sql: `INSERT INTO messages (conversation_id, role, content, at, created_at) VALUES (?, ?, ?, "", ?)`,
        args: ["test_conv", "user", "Test Content", Date.now()],
      });
      msg = "Inserted successfully!";
    } catch (e: any) {
      msg = "Insert error: " + e.message;
    }
    
    const res = await client.execute("SELECT * FROM messages ORDER BY rowid DESC LIMIT 5");
    return NextResponse.json({ ok: true, msg, rows: res.rows });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
