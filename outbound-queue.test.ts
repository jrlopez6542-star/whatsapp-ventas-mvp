1
import assert from "node:assert/strict";
2
import test from "node:test";
3
import {
4
  getReplyDelayConfig,
5
  randomReplyDelayMs,
6
  runSerializedConversation,
7
} from "./outbound-queue";
8


9
test("reply delay defaults to 2.5–5.5 seconds", () => {
10
  assert.deepEqual(getReplyDelayConfig({}), { minMs: 2500, maxMs: 5500 });
11
});
12


13
test("reply delay config clamps and sorts bounds", () => {
14
  assert.deepEqual(
15
    getReplyDelayConfig({
16
      WHATSAPP_REPLY_DELAY_MIN_MS: "9000",
17
      WHATSAPP_REPLY_DELAY_MAX_MS: "1000",
18
    }),
19
    { minMs: 1000, maxMs: 9000 }
20
  );
21
  assert.deepEqual(
22
    getReplyDelayConfig({
23
      WHATSAPP_REPLY_DELAY_MIN_MS: "invalid",
24
      WHATSAPP_REPLY_DELAY_MAX_MS: "999999",
25
    }),
26
    { minMs: 2500, maxMs: 30000 }
27
  );
28
});
29


30
test("random delay includes both configured endpoints", () => {
31
  const config = { minMs: 2500, maxMs: 5500 };
32
  assert.equal(randomReplyDelayMs(config, () => 0), 2500);
33
  assert.equal(randomReplyDelayMs(config, () => 1), 5500);
34
  for (let i = 0; i < 100; i += 1) {
35
    const value = randomReplyDelayMs(config);
