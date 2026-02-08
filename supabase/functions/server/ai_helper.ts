
// Helper to build system prompt for manual plans
function buildManualPlanMessages(description: string, risk: string, instrument: string, indicators: string[]) {
  const prompt = `You are an expert trading mentor. Create a structured manual trading plan for the following strategy description:
"${description}"
Instrument: ${instrument}
Risk Management Preferences: ${risk}
Indicators: ${indicators.join(', ')}

Format the output with the following sections using clear bold headers (e.g. **Section**) and bullet points:
- **Strategy Overview** 🎯: Brief summary of the logic.
- **Entry Rules** ✅: Exact conditions to enter a trade (Long/Short).
- **Exit Rules** 🛑: Exact conditions to take profit or stop loss.
- **Risk Management** ⚖️: Position sizing, R:R ratio, and risk rules.
- **Psychology & Tips** 🧠: Mental cues and what to watch out for.

Use icons (✅, 🛑, 🎯, etc.) and keep it scannable. Do NOT generate code. Just the manual plan.`;

  return [
    { role: 'system', content: 'You are an expert trading mentor helping a trader define a manual strategy.' },
    { role: 'user', content: prompt }
  ] as ClaudeMessage[];
}

// Helper to build system prompt for code
function buildCodeMessages(platform: string, description: string, risk: string, instrument: string, indicators: string[]) {
  const prompt = `Generate ${platform} code for: "${description}". Instrument: ${instrument}. Risk: ${risk}. Indicators: ${indicators.join(', ')}. Return ONLY the code inside markdown code blocks.`;
  return [
    { role: 'system', content: `You are an expert ${platform} developer.` },
    { role: 'user', content: prompt }
  ] as ClaudeMessage[];
}

async function generateCodeWithAI(platform: string, description: string, riskManagement: string, instrument: string, extras?: { indicators?: string[]; indicator_mode?: 'single' | 'multiple'; strategy_type?: string }): Promise<string> {
  const indicators = extras?.indicators || [];
  const isManual = extras?.strategy_type === 'manual';

  let messages: ClaudeMessage[] = [];
  
  if (isManual) {
    messages = buildManualPlanMessages(description, riskManagement, instrument, indicators);
  } else {
    // Legacy automated code generation
    messages = buildCodeMessages(platform, description, riskManagement, instrument, indicators);
  }

  const raw = await callClaudeAPI(messages, 0.25, 4000);
  
  if (isManual) {
    return raw || 'Failed to generate manual plan.';
  }

  // For code, extract from markdown
  const codeOnly = extractPrimaryCode((raw || '').trim(), platform);
  return codeOnly || '// No code generated';
}

function extractPrimaryCode(text: string, platform: string): string {
  const match = text.match(/```(?:mql4|mql5|pinescript|c\+\+|pine)?\n([\s\S]*?)```/i);
  return match ? match[1] : text;
}
