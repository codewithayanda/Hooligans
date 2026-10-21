const ESC = String.fromCharCode(27);
const ANSI_SEQUENCE = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g');

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, '');
}

/** Removes control characters, keeping line breaks and tabs. */
export function stripControlCharacters(text: string): string {
  let clean = '';

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (!isControl || char === '\n' || char === '\t') clean += char;
  }

  return clean;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
}

/** For text from the app under test: no escape sequences, no control characters, bounded size. */
export function cleanText(text: string, max = 2000): string {
  return truncate(stripControlCharacters(stripAnsi(text)), max);
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
