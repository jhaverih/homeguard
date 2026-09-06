import { describe, it, expect } from 'vitest';
import { generateStrongPassword, PASSWORD_RULES } from './password-policy';

describe('PASSWORD_RULES', () => {
  it('rejects a weak password on every rule it actually fails', () => {
    const weak = 'abc';
    const failed = PASSWORD_RULES.filter((r) => !r.test(weak));
    expect(failed.length).toBeGreaterThan(0);
  });

  it('accepts a password that satisfies every rule', () => {
    const strong = 'Abcdef1!ghij';
    for (const rule of PASSWORD_RULES) {
      expect(rule.test(strong)).toBe(true);
    }
  });
});

describe('generateStrongPassword', () => {
  it('always generates a password that satisfies every one of PASSWORD_RULES', () => {
    // Randomized generator — run many iterations so this isn't just luck.
    for (let i = 0; i < 200; i++) {
      const pwd = generateStrongPassword();
      for (const rule of PASSWORD_RULES) {
        expect(rule.test(pwd)).toBe(true);
      }
    }
  });

  it('generates a password of the requested length', () => {
    expect(generateStrongPassword(14)).toHaveLength(14);
    expect(generateStrongPassword(20)).toHaveLength(20);
  });

  it('never generates the visually ambiguous characters excluded from its own character sets (0, 1, O, o, l, but NOT the still-included i/L)', () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generateStrongPassword(30);
      expect(pwd).not.toMatch(/[01Ool]/);
    }
  });

  it('produces different passwords across calls (not a fixed/deterministic output)', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateStrongPassword()));
    expect(passwords.size).toBeGreaterThan(1);
  });
});
