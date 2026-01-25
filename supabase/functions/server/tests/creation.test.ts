import { shouldAllowCreation } from '../index.ts';

// Verify creation is allowed for free users (limit 1)
Deno.test('free: allowed when usage 0', () => {
  if (!shouldAllowCreation('free', 0)) throw new Error('Expected creation allowed for free at 0');
});

Deno.test('free: blocked when usage equals cap (1)', () => {
  if (shouldAllowCreation('free', 1)) throw new Error('Expected blocked for free at 1');
});

Deno.test('free: blocked when usage exceeds cap', () => {
  if (shouldAllowCreation('free', 10)) throw new Error('Expected blocked for free above cap');
});

// Pro users (limit 10)
Deno.test('pro: allowed when usage < 10', () => {
  if (!shouldAllowCreation('pro', 9)) throw new Error('Expected creation allowed for pro at 9');
});

Deno.test('pro: blocked when usage equals cap (10)', () => {
  if (shouldAllowCreation('pro', 10)) throw new Error('Expected blocked for pro at 10');
});

// Elite users always allowed
Deno.test('elite: allowed regardless of usage', () => {
  if (!shouldAllowCreation('elite', 100)) throw new Error('Expected creation allowed for elite');
});
