with open('lib/evolution.ts', 'r', encoding='utf-8') as f:
    code = f.read()

new_buttons = '''\nexport async function sendEvolutionButtons(
  toPhone: string,
  text: string,
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
    return { ok: false, error: "Nǧmero invǭlido" };
  }

  const url = `${base}/message/sendButtons/${encodeURIComponent(instance)}`;
  
  const buttons = options.map((opt, i) => ({
    type: "reply",
    reply: {
      id: `btn_${i}`,
      title: opt
    }
  }));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        number: resolved.number,
        text,
        buttons
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error || res.statusText };
    }
    return { ok: true, id: data?.key?.id || "buttons-sent" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}'''

if 'sendEvolutionButtons' not in code:
    with open('lib/evolution.ts', 'a', encoding='utf-8') as f:
        f.write(new_buttons)

print("Appended sendEvolutionButtons")
