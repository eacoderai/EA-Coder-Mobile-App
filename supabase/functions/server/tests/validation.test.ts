
import { validateStrategyData } from '../index.ts';

Deno.test('validateStrategyData: accepts valid manual strategy', () => {
  const body = {
    strategy_name: 'My Strategy',
    description: 'This is a valid strategy description that is long enough.',
    strategy_type: 'manual',
    platform: 'manual' // optional for manual
  };
  const errors = validateStrategyData(body);
  if (errors.length !== 0) throw new Error(`Expected no errors, got: ${errors.join(', ')}`);
});

Deno.test('validateStrategyData: accepts valid automated strategy', () => {
  const body = {
    strategy_name: 'My Auto Strategy',
    description: 'This is a valid strategy description that is long enough.',
    strategy_type: 'automated',
    platform: 'mql5'
  };
  const errors = validateStrategyData(body);
  if (errors.length !== 0) throw new Error(`Expected no errors, got: ${errors.join(', ')}`);
});

Deno.test('validateStrategyData: rejects short description', () => {
  const body = {
    strategy_name: 'Short Desc',
    description: 'Too short',
    strategy_type: 'manual'
  };
  const errors = validateStrategyData(body);
  if (!errors.some(e => e.includes('Description must be at least 20 characters'))) {
    throw new Error('Expected description length error');
  }
});

Deno.test('validateStrategyData: rejects invalid platform for automated', () => {
  const body = {
    strategy_name: 'Bad Platform',
    description: 'This is a valid strategy description that is long enough.',
    strategy_type: 'automated',
    platform: 'invalid_platform'
  };
  const errors = validateStrategyData(body);
  if (!errors.some(e => e.includes('Platform must be one of'))) {
    throw new Error('Expected platform error');
  }
});

Deno.test('validateStrategyData: rejects missing platform for automated', () => {
  const body = {
    strategy_name: 'No Platform',
    description: 'This is a valid strategy description that is long enough.',
    strategy_type: 'automated'
  };
  const errors = validateStrategyData(body);
  if (!errors.some(e => e.includes('Platform must be one of'))) {
    throw new Error('Expected platform error');
  }
});

Deno.test('validateStrategyData: rejects long strategy name', () => {
  const body = {
    strategy_name: 'a'.repeat(121),
    description: 'This is a valid strategy description that is long enough.',
    strategy_type: 'manual'
  };
  const errors = validateStrategyData(body);
  if (!errors.some(e => e.includes('Strategy name must be 120 characters or less'))) {
    throw new Error('Expected strategy name length error');
  }
});

Deno.test('validateStrategyData: handles null/undefined body', () => {
  const errors = validateStrategyData(null);
  if (errors.length === 0) throw new Error('Expected errors for null body');
});
