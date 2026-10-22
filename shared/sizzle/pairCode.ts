/**
 * Phone pairing codes (TASK-040): short enough to type into the home-screen
 * app, which can't see what Safari stored. 8 characters from 31 (no 0/O, 1/I/L)
 * ≈ 8.5 × 10¹¹ codes; single-use, 10 minutes, rate-limited on the server.
 */

export const PAIR_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIR_LENGTH = 8;

/** "k7qm 3xrp" or "K7QM-3XRP" → "K7QM3XRP"; anything else → null. */
export function normalizePairCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  return s.length === PAIR_LENGTH && [...s].every((ch) => PAIR_ALPHABET.includes(ch)) ? s : null;
}

/** "K7QM3XRP" → "K7QM-3XRP". */
export function formatPairCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
