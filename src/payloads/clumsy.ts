/** What a field takes. Text fields and number fields get different clumsy input. */
export type FieldKind = 'text' | 'number';

export type ClumsyInput = {
  id: string;
  /** What typing this finds out, in plain words. */
  proves: string;
  /** How it reads at the start of a sentence. */
  says: string;
  kinds: readonly FieldKind[];
  /** The text to type. */
  value: () => string;
};

/** The ways a tired person fills in a form. Nothing here is an attack: it only finds out what breaks. */
export const CLUMSY: readonly ClumsyInput[] = [
  {
    id: 'empty',
    proves: 'whether the app copes with a field that was left blank',
    says: 'An empty value',
    kinds: ['text', 'number'],
    value: () => '',
  },
  {
    id: 'spaces',
    proves: 'whether the app copes with a field that holds only spaces',
    says: 'A value of only spaces',
    kinds: ['text'],
    value: () => '   ',
  },
  {
    id: 'long',
    proves: 'whether a very long value is cut off, refused or crashes the app',
    says: 'A value of 2,000 characters',
    kinds: ['text'],
    value: () => 'a'.repeat(2_000),
  },
  {
    id: 'emoji',
    proves: 'whether the app copes with characters beyond plain letters',
    says: 'A value with emoji',
    kinds: ['text'],
    value: () => String.fromCodePoint(0x1f600, 0x1f680, 0x1f4a9),
  },
  {
    id: 'accents',
    proves: 'whether the app copes with accented letters in a name',
    says: 'A name with accents',
    kinds: ['text'],
    value: () => `Zo${String.fromCodePoint(0xeb)} M${String.fromCodePoint(0xfc)}ller`,
  },
  {
    id: 'negative',
    proves: 'whether a negative number is accepted where it makes no sense',
    says: 'A negative number',
    kinds: ['number'],
    value: () => '-1',
  },
  {
    id: 'zero',
    proves: 'whether the app copes with zero where a quantity or an amount is expected',
    says: 'Zero',
    kinds: ['number'],
    value: () => '0',
  },
  {
    id: 'huge-number',
    proves: 'whether a very large number is refused or crashes the app',
    says: 'A very large number',
    kinds: ['number'],
    value: () => '9'.repeat(25),
  },
  {
    id: 'not-a-number',
    proves: 'whether letters in a number field are refused',
    says: 'Letters in a number field',
    kinds: ['number'],
    value: () => 'abc',
  },
];

export function clumsyFor(kind: FieldKind): ClumsyInput[] {
  return CLUMSY.filter((input) => input.kinds.includes(kind));
}
