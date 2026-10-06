1
import { randomUUID } from "crypto";
2
import { ensureTursoReady, getTursoClient, isTursoConfigured } from "@/lib/store/db";
3
import {
4
  sendOutboundWhatsApp,
5
  type OutboundWhatsAppResult,
6
} from "@/lib/whatsapp-send";
7


8
const DEFAULT_MIN_DELAY_MS = 2_500;
9
const DEFAULT_MAX_DELAY_MS = 5_500;
10
const MAX_CONFIGURED_DELAY_MS = 30_000;
11
const LOCK_WAIT_MS = 45_000;
12
const LOCK_POLL_MS = 150;
13


14
export type ReplyDelayConfig = {
15
  minMs: number;
16
  maxMs: number;
17
};
18


19
function envMilliseconds(
20
  value: string | undefined,
21
  fallback: number
22
): number {
23
  if (value == null || value.trim() === "") return fallback;
24
  const parsed = Number(value);
25
  if (!Number.isFinite(parsed)) return fallback;
26
  return Math.min(MAX_CONFIGURED_DELAY_MS, Math.max(0, Math.round(parsed)));
27
}
28


29
/** Optional env overrides; invalid values safely fall back and reversed bounds are sorted. */
30
export function getReplyDelayConfig(
31
  env: Record<string, string | undefined> = process.env
32
): ReplyDelayConfig {
33
  const a = envMilliseconds(
