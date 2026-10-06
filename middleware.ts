1
import { NextRequest, NextResponse } from "next/server";
2


3
const PANEL_COOKIE = "panel_session";
4


5
function getPassword(): string {
6
  return (process.env.PANEL_PASSWORD || "").trim();
7
}
8


9
async function sha256Hex(text: string): Promise<string> {
10
  const data = new TextEncoder().encode(text);
11
  const hash = await crypto.subtle.digest("SHA-256", data);
12
  return Array.from(new Uint8Array(hash))
13
    .map((b) => b.toString(16).padStart(2, "0"))
14
    .join("");
15
}
16


17
async function sessionToken(password: string): Promise<string> {
18
  return sha256Hex(`whatsapp-ventas-panel:${password}`);
19
}
20


21
function timingSafeEqualStr(a: string, b: string): boolean {
22
  if (a.length !== b.length) return false;
23
  let out = 0;
24
  for (let i = 0; i < a.length; i++) {
25
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
26
  }
27
  return out === 0;
28
}
29


30
export async function middleware(request: NextRequest) {
31
  const { pathname } = request.nextUrl;
32
  const password = getPassword();
33


34
  // Sin password: panel abierto (preview warning se muestra en UI)
