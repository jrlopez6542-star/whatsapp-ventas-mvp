import assert from "node:assert/strict";
import test from "node:test";
import {
  getReplyDelayConfig,
  randomReplyDelayMs,
  runSerializedConversation,
} from "./outbound-queue";

test("reply delay defaults to 2.5–5.5 seconds", () => {
  assert.deepEqual(getReplyDelayConfig({}), { minMs: 2500, maxMs: 5500 });
});

test("reply delay config clamps and sorts bounds", () => {
  assert.deepEqual(
    getReplyDelayConfig({
      WHATSAPP_REPLY_DELAY_MIN_MS: "9000",
      WHATSAPP_REPLY_DELAY_MAX_MS: "1000",
    }),
    { minMs: 1000, maxMs: 9000 }
  );
  assert.deepEqual(
    getReplyDelayConfig({
      WHATSAPP_REPLY_DELAY_MIN_MS: "invalid",
      WHATSAPP_REPLY_DELAY_MAX_MS: "999999",
    }),
    { minMs: 2500, maxMs: 30000 }
  );
});

test("random delay includes both configured endpoints", () => {
  const config = { minMs: 2500, maxMs: 5500 };
  assert.equal(randomReplyDelayMs(config, () => 0), 2500);
  assert.equal(randomReplyDelayMs(config, () => 1), 5500);
  for (let i = 0; i < 100; i += 1) {
    const value = randomReplyDelayMs(config);
    assert.ok(value >= 2500 && value <= 5500);
  }
});

test("tasks for one conversation never overlap and remain FIFO", async () => {
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const task = (label: string, wait: number) =>
    runSerializedConversation("whatsapp:+57000", async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      order.push(`end:${label}`);
      active -= 1;
    });

  await Promise.all([task("a", 20), task("b", 1), task("c", 1)]);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, [
    "start:a",
    "end:a",
    "start:b",
    "end:b",
    "start:c",
    "end:c",
  ]);
});

test("different conversations may proceed concurrently", async () => {
  let active = 0;
  let maxActive = 0;
  const task = (key: string) =>
    runSerializedConversation(key, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    });
  await Promise.all([task("one"), task("two")]);
  assert.equal(maxActive, 2);
});