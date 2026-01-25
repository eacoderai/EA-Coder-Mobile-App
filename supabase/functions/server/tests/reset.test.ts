import { isStrongPassword, validateResetToken, requestPasswordReset, confirmPasswordReset } from '../index.ts';
import * as kv from '../kv_store.ts';

Deno.test('password strength enforcement', () => {
  const weak = ['abc', 'Password1', 'password!', 'PASSWORD1!', 'Passw1!'];
  const strong = ['Str0ng!Pass', 'My$ecureP4ss', 'Abcdef1!'];
  for (const w of weak) {
    if (isStrongPassword(w)) throw new Error('Expected weak password to fail');
  }
  for (const s of strong) {
    if (!isStrongPassword(s)) throw new Error('Expected strong password to pass');
  }
});

Deno.test('token expiration validation', async () => {
  const token = crypto.randomUUID();
  const now = Date.now();
  await kv.set(`reset:${token}`, { email: 'a@b.com', userId: 'uid', expires_at: now + 1000, used: false });
  const valid1 = await validateResetToken(token);
  if (!valid1) throw new Error('Expected token valid');
  await kv.set(`reset:${token}`, { email: 'a@b.com', userId: 'uid', expires_at: now - 1000, used: false });
  const valid2 = await validateResetToken(token);
  if (valid2) throw new Error('Expected token expired');
});

Deno.test('email delivery and token creation', async () => {
  const { token, href } = await requestPasswordReset('user@example.com');
  if (!token || !href.includes(token)) throw new Error('Expected token and href with token');
  const valid = await validateResetToken(token);
  if (!valid) throw new Error('Expected newly issued token valid');
});

Deno.test('successful password update flow', async () => {
  const token = crypto.randomUUID();
  await kv.set(`reset:${token}`, { email: 'a@b.com', userId: 'uid', expires_at: Date.now() + 60_000, used: false });
  const ok = await confirmPasswordReset(token, 'Str0ng!Pass');
  if (!ok) throw new Error('Expected reset OK');
  const rec = await kv.get(`reset:${token}`);
  if (!rec?.used) throw new Error('Expected token marked used');
});
