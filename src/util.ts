/** Strips control characters (terminal escapes, newlines, bidi overrides) from untrusted text and caps its length. */
export function sanitize(text: string, max = 200): string {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, " ")
    .trim()
    .slice(0, max);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function errorName(err: unknown): string | undefined {
  return err instanceof Error ? err.name : undefined;
}
