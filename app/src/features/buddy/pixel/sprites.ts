import type { BuddyStage } from '../api';
import type { Frame, Palette } from './pixel-sprite';

// Placeholder pixel art, drawn by hand in the spirit of GitAnimals: a small grid, few colors, a
// thick outline and a big head (docs/product.md, Buddy). An original character: a round mochi with
// a sprout. The final art will replace these grids; the frame names are what the stage uses.

export const BUDDY_PALETTE: Palette = {
  k: '#3A2E2A', // outline, eyes
  e: '#FFF3DD', // egg shell
  d: '#EBD5B5', // egg shade
  o: '#F4A261', // egg spots
  b: '#FFD9AE', // body
  s: '#F2B27E', // body shade
  p: '#FF9E90', // cheeks
  g: '#8BCB6B', // sprout
  G: '#5DA14E', // sprout shade
};

const EGG: Frame = [
  '................',
  '......kkkk......',
  '.....keeeek.....',
  '....keeeeeek....',
  '...keeooeeeek...',
  '...keooooeeek...',
  '..keeeooeeeeek..',
  '..keeeeeeeooek..',
  '..keeeeeeoooek..',
  '..keooeeeeooek..',
  '..koooeeeeeedk..',
  '..keooeeeeeddk..',
  '...keeeeeeddk...',
  '....keeedddk....',
  '.....kkkkkk.....',
  '................',
];

// Rows shared by the mochi's frames; only the face (rows 7–10) and the feet (14–15) change.
const TOP = [
  '.......gg.......',
  '......gGgg......',
  '........G.......',
  '.....kkkkkk.....',
  '...kkbbbbbbkk...',
  '..kbbbbbbbbbbk..',
  '.kbbbbbbbbbbbbk.',
];
const BOTTOM = ['.ksbbbbbbbbbbsk.', '..ksbbbbbbbbsk..', '...kksssssskk...'];
const FEET = ['...kbk....kbk...', '...kkk....kkk...'];
const FEET_STEP = ['..kbk......kbk..', '..kkk......kkk..'];

const face = (eyesTop: string, eyesBottom: string, mouth: string, below: string): Frame => [
  ...TOP,
  eyesTop,
  eyesBottom,
  mouth,
  below,
  ...BOTTOM,
  ...FEET,
];

const EYES_OPEN = '.kbbkbbbbbbkbbk.';
const PLAIN = '.kbbbbbbbbbbbbk.';
const SMILE = '.kbpbbbkkbbbpbk.';

const MOCHI_IDLE = face(EYES_OPEN, EYES_OPEN, SMILE, PLAIN);
const MOCHI_STEP: Frame = [...MOCHI_IDLE.slice(0, 14), ...FEET_STEP];
const MOCHI_BLINK = face(PLAIN, '.kbbkkbbbbkkbbk.', SMILE, PLAIN);
const MOCHI_HAPPY = face(EYES_OPEN, '.kbkbkbbbbkbkbk.', SMILE, PLAIN);
const MOCHI_SLEEP = face(PLAIN, '.kbkkbbbbbbkkbk.', '.kbpbbbbbbbbpbk.', PLAIN);
const MOCHI_HUNGRY = face(EYES_OPEN, EYES_OPEN, '.kbpbbbbbbbbpbk.', '.kbbbbbkkbbbbbk.');

export type Pose = 'idle' | 'step' | 'blink' | 'happy' | 'sleep' | 'hungry';

const MOCHI: Record<Pose, Frame> = {
  idle: MOCHI_IDLE,
  step: MOCHI_STEP,
  blink: MOCHI_BLINK,
  happy: MOCHI_HAPPY,
  sleep: MOCHI_SLEEP,
  hungry: MOCHI_HUNGRY,
};

// Until each stage has its own art, the hatched stages share the mochi and grow in size.
export function buddyFrame(stage: BuddyStage, pose: Pose): Frame {
  return stage === 'EGG' ? EGG : MOCHI[pose];
}

export const STAGE_SIZE: Record<BuddyStage, number> = { EGG: 1, BABY: 1, CHILD: 1.2, ADULT: 1.4 };

export const PROP_PALETTE: Palette = {
  k: '#3A2E2A',
  c: '#A0673C', // poop
  h: '#C98D5A', // poop highlight
  w: '#FFFFFF', // rice
  a: '#7FB3D5', // bowl
  r: '#FF6B81', // heart
};

// prettier-ignore
export const POOP: Frame = [
  '....k...',
  '...kck..',
  '..kchck.',
  '.kcchcck',
  'kcccccck',
  'kkkkkkkk',
];

// prettier-ignore
const BOWL_BASE = [
  'kkkkkkkkkkkk',
  '.kaaaaaaaak.',
  '..kaaaaaak..',
  '...kkkkkk...',
];
export const BOWL_FULL: Frame = ['...wwwwww...', '..wwwwwwww..', ...BOWL_BASE];
export const BOWL_EMPTY: Frame = ['............', '............', ...BOWL_BASE];

// prettier-ignore
export const HEART: Frame = [
  '.rr.rr.',
  'rrrrrrr',
  'rrrrrrr',
  '.rrrrr.',
  '..rrr..',
  '...r...',
];

// prettier-ignore
export const ZZZ: Frame = [
  'kkkk',
  '..k.',
  '.k..',
  'kkkk',
];
