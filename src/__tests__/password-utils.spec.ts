import { describe, it, expect } from 'vitest';
import { clientStrongPassword, clientPasswordsMatch } from '../components/AuthScreen';

describe('Password utilities', () => {
  it('enforces strong password rules', () => {
    expect(clientStrongPassword('abc')).toBe(false);
    expect(clientStrongPassword('Password1')).toBe(false);
    expect(clientStrongPassword('Str0ng!Pass')).toBe(true);
  });

  it('detects mismatched passwords', () => {
    expect(clientPasswordsMatch('a', 'b')).toBe(false);
    expect(clientPasswordsMatch('same', 'same')).toBe(true);
  });
});
