1
import { ensureTursoReady, getTursoClient, isTursoConfigured } from "@/lib/store/db";
2


3
const DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
4
const DEDUPE_MAX = 4_000;
5


6
declare global {
7
  var __whatsappSeenWebhookIds: Map<string, number> | undefined;
8
}
9


10
function memoryClaim(id: string): boolean {
11
  if (!globalThis.__whatsappSeenWebhookIds) {
12
    globalThis.__whatsappSeenWebhookIds = new Map();
13
  }
14
  const seen = globalThis.__whatsappSeenWebhookIds;
15
  const now = Date.now();
16
  const previous = seen.get(id);
17
  if (previous && now - previous < DEDUPE_TTL_MS) return false;
18
  seen.set(id, now);
19
  if (seen.size > DEDUPE_MAX) {
20
    for (const [key, at] of seen) {
21
      if (now - at >= DEDUPE_TTL_MS) seen.delete(key);
22
    }
23
  }
24
  return true;
25
}
26


27
/** Atomically claims a provider event; false means another invocation handled it. */
28
export async function claimWebhookEvent(id: string): Promise<boolean> {
29
  if (!id) return true;
30
  if (!isTursoConfigured()) return memoryClaim(id);
31


32
  try {
