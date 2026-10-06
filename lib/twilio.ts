1
import { createHmac, timingSafeEqual } from "crypto";
2


3
/**
4
 * TODO (MVP): Signature validation is optional.
5
 * Enable it in production by setting TWILIO_AUTH_TOKEN.
6
 * Docs: https://www.twilio.com/docs/usage/security#validating-requests
7
 */
8
export function validateTwilioSignature(
9
  authToken: string,
10
  signature: string | null,
11
  url: string,
12
  params: Record<string, string>
13
): boolean {
14
  if (!signature) return false;
15


16
  const data =
17
    url +
18
    Object.keys(params)
19
      .sort()
20
      .reduce((acc, key) => acc + key + params[key], "");
21


22
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
23


24
  try {
25
    const a = Buffer.from(expected);
26
    const b = Buffer.from(signature);
27
    if (a.length !== b.length) return false;
28
    return timingSafeEqual(a, b);
29
  } catch {
30
    return false;
31
  }
32
}
33


34
export function escapeXml(text: string): string {
