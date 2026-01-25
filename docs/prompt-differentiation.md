# Prompt Differentiation Logic (Claude API)

## Versioning
- Version tag: v2.0-strategy-diff
- KV keys: `prompt_version:<kind>:<type>:<timestamp>`
- Kinds tracked: analyze, metrics, codegen, chat

## Strategy Type Derivation
- Heuristics on description, code, timeframe:
  - trend_following, mean_reversion, breakout, scalping, grid_martingale, news_event, other

## Templates
- Analyze: instrument/timeframe/platform + type-specific focus; JSON array output
- Metrics: instrument/timeframe/platform + type-specific focus; strict JSON schema
- Codegen: platform-tailored generation with type-specific requirements
- Chat: platform/instrument/timeframe + type-specific focus for edit guidance

## Differentiation Criteria
- Each template embeds type-specific focus to enforce distinct outputs
- Required references to instrument/timeframe/platform in responses
- Suggestions constrained to ≤ 140 chars and non-duplicative (analyze)

## QA & Thresholds
- Jaccard similarity on prompt user content across sample strategies
- Threshold: < 0.65 between different types
- Test file: `src/__tests__/prompt-variation.spec.ts`

## Files Updated
- `src/utils/promptTemplates.ts` (templates, type derivation, version)
- `supabase/functions/server/index.ts` (Deno server prompts usage + version recording)
- `src/supabase/functions/server/index.ts` (Node server prompts usage + version recording)

## Running Tests
- `npx vitest run src/__tests__/prompt-variation.spec.ts --reporter=dot`

