const ESC = String.fromCharCode(27);

const STYLES = {
  bold: [1, 22],
  dim: [2, 22],
  red: [31, 39],
  yellow: [33, 39],
  green: [32, 39],
} as const;

let enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/** For tests, and for callers that know better than the terminal. */
export function setColorEnabled(value: boolean): void {
  enabled = value;
}

function paint(style: keyof typeof STYLES, text: string): string {
  if (!enabled) return text;

  const [open, close] = STYLES[style];
  return `${ESC}[${open}m${text}${ESC}[${close}m`;
}

export const bold = (text: string): string => paint('bold', text);
export const dim = (text: string): string => paint('dim', text);
export const red = (text: string): string => paint('red', text);
export const yellow = (text: string): string => paint('yellow', text);
export const green = (text: string): string => paint('green', text);
