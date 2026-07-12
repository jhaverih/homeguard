import { Raw } from 'typeorm';

// Emails are treated as case-insensitive everywhere — use this for any
// `where: { email: ... }` lookup so it matches regardless of how the caller
// or a pre-existing row happens to be cased.
export function emailEquals(email: string) {
  return Raw((alias) => `LOWER(${alias}) = LOWER(:email)`, { email });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
