const fs = require('fs');

let evoCode = fs.readFileSync('lib/evolution.ts', 'utf8');

const pollCode = `
export async function sendEvolutionPoll(
  toPhone: string,
  name: string,
  options: string[]
): Promise<SendEvolutionResult> {
  const base = process.env.EVOLUTION_API_URL?.trim().replace(/\\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();

  if (!base || !apiKey || !instance) {
    return { ok: false, error: "Faltan configs" };
  }

  const resolved = resolveEvolutionSendNumber(toPhone);
  if (resolved.kind === "invalid" || !resolved.number) {
    return { ok: false, error: "Número inválido" };
  }

  const url = \`\${base}/message/sendPoll/\${encodeURIComponent(instance)}\`;
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        number: resolved.number,
        name,
        selectableCount: 1,
        values: options
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error || res.statusText };
    }
    return { ok: true, id: data?.key?.id || "poll-sent" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
`;

fs.writeFileSync('lib/evolution.ts', evoCode + "\n" + pollCode);
