import type { BuddyEvent } from '@/features/chat/types';

// The "take a look first" tour (docs/product.md, 구경하기): a scripted conversation of about 50
// seconds in which the buddy hatches, dances, gets hungry, eats, poops, is cleaned, levels up,
// talks, sings and grows up. It runs in
// the app only, with no account or server, so a first-time visitor sees what the app is about
// right away.

export const DEMO_ME = 'demo-me';
export const DEMO_PARTNER = 'demo-partner';

export type Who = typeof DEMO_ME | typeof DEMO_PARTNER;

// Keys under demo.lines in the translations.
export type Line =
  | 'hello'
  | 'talk'
  | 'hatched'
  | 'hungry'
  | 'pooped'
  | 'cleaned'
  | 'grown'
  | 'leaves'
  | 'weekend'
  | 'ok'
  | 'flower';

export type Step = { at: number } & (
  | { kind: 'typing' }
  | { kind: 'text'; from: Who; line: Line }
  | { kind: 'event'; event: BuddyEvent; actor?: Who }
  | { kind: 'act'; act: 'dance' | 'sing' }
  | { kind: 'end' }
);

export const SCRIPT: Step[] = [
  { at: 400, kind: 'typing' },
  { at: 1600, kind: 'text', from: DEMO_PARTNER, line: 'hello' },
  { at: 3400, kind: 'text', from: DEMO_ME, line: 'talk' },
  { at: 4800, kind: 'event', event: 'EVOLVED' },
  { at: 6800, kind: 'typing' },
  { at: 7800, kind: 'text', from: DEMO_PARTNER, line: 'hatched' },
  { at: 8800, kind: 'act', act: 'dance' },
  { at: 12000, kind: 'event', event: 'HUNGRY' },
  { at: 13600, kind: 'text', from: DEMO_ME, line: 'hungry' },
  { at: 14600, kind: 'event', event: 'FED', actor: DEMO_ME },
  { at: 17800, kind: 'event', event: 'LEVELED_UP' },
  { at: 19600, kind: 'event', event: 'POOPED' },
  { at: 21000, kind: 'typing' },
  { at: 22000, kind: 'text', from: DEMO_PARTNER, line: 'pooped' },
  { at: 23400, kind: 'event', event: 'CLEANED', actor: DEMO_PARTNER },
  { at: 25000, kind: 'text', from: DEMO_PARTNER, line: 'cleaned' },
  { at: 26000, kind: 'event', event: 'LEVELED_UP' },
  { at: 27400, kind: 'text', from: DEMO_ME, line: 'grown' },
  { at: 28400, kind: 'event', event: 'EVOLVED' },
  // A child now: it talks back.
  { at: 31400, kind: 'event', event: 'POOPED' },
  { at: 32800, kind: 'event', event: 'CLEANED', actor: DEMO_ME },
  { at: 35000, kind: 'typing' },
  { at: 35800, kind: 'text', from: DEMO_PARTNER, line: 'leaves' },
  { at: 37200, kind: 'act', act: 'sing' },
  { at: 40600, kind: 'text', from: DEMO_ME, line: 'weekend' },
  { at: 41400, kind: 'event', event: 'LEVELED_UP' },
  { at: 42400, kind: 'typing' },
  { at: 43200, kind: 'text', from: DEMO_PARTNER, line: 'ok' },
  { at: 44400, kind: 'event', event: 'EVOLVED' },
  { at: 47400, kind: 'typing' },
  { at: 48200, kind: 'text', from: DEMO_PARTNER, line: 'flower' },
  { at: 49200, kind: 'act', act: 'dance' },
  { at: 52400, kind: 'end' },
];

// The partner answers whatever the visitor types, in turn (demo.replies in the translations).
export const REPLIES = ['r1', 'r2', 'r3'] as const;
