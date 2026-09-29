import type { BuddyEvent } from '@/features/chat/types';

// The "take a look first" tour (docs/product.md, 구경하기): a scripted conversation of about 40
// seconds in which the buddy hatches, gets hungry, eats, poops, is cleaned and grows up. It runs in
// the app only, with no account or server, so a first-time visitor sees what the app is about
// right away (and the server can wake from scale-to-zero meanwhile).

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
  | { kind: 'end' }
);

export const SCRIPT: Step[] = [
  { at: 400, kind: 'typing' },
  { at: 1600, kind: 'text', from: DEMO_PARTNER, line: 'hello' },
  { at: 3400, kind: 'text', from: DEMO_ME, line: 'talk' },
  { at: 4800, kind: 'event', event: 'EVOLVED' },
  { at: 6800, kind: 'typing' },
  { at: 7800, kind: 'text', from: DEMO_PARTNER, line: 'hatched' },
  { at: 10000, kind: 'event', event: 'HUNGRY' },
  { at: 11800, kind: 'text', from: DEMO_ME, line: 'hungry' },
  { at: 12800, kind: 'event', event: 'FED', actor: DEMO_ME },
  { at: 16600, kind: 'event', event: 'POOPED' },
  { at: 18400, kind: 'typing' },
  { at: 19400, kind: 'text', from: DEMO_PARTNER, line: 'pooped' },
  { at: 21000, kind: 'event', event: 'CLEANED', actor: DEMO_PARTNER },
  { at: 22600, kind: 'text', from: DEMO_PARTNER, line: 'cleaned' },
  { at: 24800, kind: 'text', from: DEMO_ME, line: 'grown' },
  { at: 26000, kind: 'event', event: 'EVOLVED' },
  { at: 29800, kind: 'typing' },
  { at: 30800, kind: 'text', from: DEMO_PARTNER, line: 'leaves' },
  { at: 32600, kind: 'text', from: DEMO_ME, line: 'weekend' },
  { at: 33800, kind: 'typing' },
  { at: 34600, kind: 'text', from: DEMO_PARTNER, line: 'ok' },
  { at: 36200, kind: 'event', event: 'EVOLVED' },
  { at: 40000, kind: 'typing' },
  { at: 41000, kind: 'text', from: DEMO_PARTNER, line: 'flower' },
  { at: 43000, kind: 'end' },
];

// The partner answers whatever the visitor types, in turn (demo.replies in the translations).
export const REPLIES = ['r1', 'r2', 'r3'] as const;
