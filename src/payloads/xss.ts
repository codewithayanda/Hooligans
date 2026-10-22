export type XssProbe = {
  id: string;
  /** What it finds out, in plain words. */
  proves: string;
  /** The text to type. It is built around a marker and only ever names an unknown element. */
  value: (marker: string) => string;
};

/**
 * Harmless on purpose. If the page shows one of these back as it was typed, the browser would
 * read it as markup, and that is the whole proof. Nothing here runs a script.
 */
export const XSS_PROBES: readonly XssProbe[] = [
  {
    id: 'tag',
    proves: 'the page puts what you type into its HTML as markup, not as text',
    value: (marker) => `<hg-${marker}>`,
  },
  {
    id: 'attribute',
    proves: 'what you type can break out of a quoted HTML attribute',
    value: (marker) => `"><hg-${marker}>`,
  },
  {
    id: 'single-quote-attribute',
    proves: 'what you type can break out of a single quoted HTML attribute',
    value: (marker) => `'><hg-${marker}>`,
  },
];
