const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

const target = `    const candidateGeminiModels = [
      rawEnvModel === "gemini-2.5-flash" ? "gemini-3.5-flash-lite" : rawEnvModel,
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
    ].filter(Boolean) as string[];`;

const replacement = `    const candidateGeminiModels = [
      rawEnvModel === "gemini-2.5-flash" ? "gemini-3.5-flash-lite" : rawEnvModel,
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter(Boolean) as string[];`;

code = code.replace(target, replacement);
fs.writeFileSync('lib/agent/sales-agent.ts', code);
console.log("Updated lib/agent/sales-agent.ts properly");
