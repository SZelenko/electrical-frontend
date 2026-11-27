/** SVG text attributes that squeeze a string into `maxWidth` (drawing units) instead of overflowing it. */
export function fitText(text: string, size: number, maxWidth: number) {
  const natural = [...text].length * size * 0.6
  return natural > maxWidth
    ? { textLength: Math.max(10, Math.floor(maxWidth)), lengthAdjust: 'spacingAndGlyphs' as const }
    : {}
}
