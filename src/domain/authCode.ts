export const CODE_LENGTH = 8
export const RESEND_COOLDOWN_SECONDS = 60

/** Normalises user input of a one-time code: uppercase, only A-Z and 0-9, max 8 characters. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH)
}

export function isCompleteCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code)
}
