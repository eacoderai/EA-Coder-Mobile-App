import { shouldAllowCreation } from '../index.ts';

// Free users: allowed below 1, blocked at 1 and above
Deno.test('free user: allowed when count 0', () => {
  if (!shouldAllowCreation('free', 0)) throw new Error('Expected allowed');
});

Deno.test('free user: blocked at count 1', () => {
  if (shouldAllowCreation('free', 1)) throw new Error('Expected blocked');
});

Deno.test('free user: blocked above count 1', () => {
  if (shouldAllowCreation('free', 100)) throw new Error('Expected blocked');
});

// Pro users: allowed below 10, blocked at 10
Deno.test('pro user: allowed when count 9', () => {
  if (!shouldAllowCreation('pro', 9)) throw new Error('Expected allowed');
});

Deno.test('pro user: blocked at count 10', () => {
  if (shouldAllowCreation('pro', 10)) throw new Error('Expected blocked');
});

Deno.test('elite user: always allowed', () => {
  if (!shouldAllowCreation('elite', 100)) throw new Error('Expected allowed');
});
