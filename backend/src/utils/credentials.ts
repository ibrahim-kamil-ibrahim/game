import crypto from 'node:crypto';

const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*';

/** Cryptographically strong random integer in [0, max). */
function randomInt(max: number): number {
  return crypto.randomInt(0, max);
}

export function generateTemporaryPassword(length = 14): string {
  const chars: string[] = [];
  // Guarantee at least one letter and one digit; add a symbol for strength.
  chars.push(SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)]);
  chars.push(DIGITS[randomInt(DIGITS.length)]);
  chars.push(SYMBOLS[randomInt(SYMBOLS.length)]);
  const all = `${SAFE_ALPHABET}${DIGITS}${SYMBOLS}`;
  while (chars.length < length) {
    chars.push(all[randomInt(all.length)]);
  }
  // Fisher-Yates shuffle so the guaranteed characters are not always first.
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join('');
}

export function slugifyName(fullName: string): string {
  const slug = fullName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 20);
  return slug || 'employer';
}

/** Generates a username suffix that is safe to expose to the admin. */
export function generateUsername(fullName: string): string {
  const suffix = Array.from({ length: 5 })
    .map(() => SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)].toLowerCase())
    .join('');
  return `${slugifyName(fullName)}-${suffix}`;
}
