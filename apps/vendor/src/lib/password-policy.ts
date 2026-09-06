// Pulled out of app/reset-password/page.tsx into its own module because
// Next.js's App Router only allows a page.tsx file to export its own
// special names (default, metadata, generateStaticParams, etc.); any other
// named export fails the route's generated type-check (.next/types/app/**/
// page.ts) and breaks `next build`. Living here also makes this importable
// from tests without needing to render the page component at all.

export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One number', test: (p) => /\d/.test(p) },
  { label: 'One special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function generateStrongPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*-_=+';
  const all = upper + lower + digits + special;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const pwd = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = pwd.length; i < length; i++) pwd.push(pick(all));
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}
