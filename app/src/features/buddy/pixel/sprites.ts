import type { BuddyStage } from '../api';
import type { Frame, Palette } from './pixel-sprite';

// The buddy's pixel art, in the spirit of GitAnimals: a small grid, few colors, a thick outline
// and a big head (docs/product.md, Buddy). An original character, a round mochi whose sprout
// shows how far it has grown: a small sprout, then two leaves, then a flower.

export const BUDDY_PALETTE: Palette = {
  k: '#3A2E2A', // outline, eyes
  e: '#FFF3DD', // egg shell
  d: '#EBD5B5', // egg shade
  o: '#F4A261', // egg spots
  b: '#FFD9AE', // body
  l: '#FFEDD5', // body highlight
  s: '#F2B27E', // body shade
  p: '#FF9E90', // cheeks
  g: '#8BCB6B', // leaf
  G: '#5DA14E', // leaf shade, stem
  f: '#FF9EB5', // petals
  y: '#FFD166', // flower center
};

// prettier-ignore
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

// prettier-ignore
const BABY: Frame = [
  '.......gg.......',
  '......gGgg......',
  '........G.......',
  '.....kkkkkk.....',
  '...kkbbbbbbkk...',
  '..kbllbbbbbbbk..',
  '.kbllbbbbbbbbbk.',
  '.kbbkbbbbbbkbbk.',
  '.kbbkbbbbbbkbbk.',
  '.kbpbbbkkbbbpbk.',
  '.kbbbbbbbbbbbbk.',
  '.ksbbbbbbbbbbsk.',
  '..ksbbbbbbbbsk..',
  '...kksssssskk...',
  '...kbk....kbk...',
  '...kkk....kkk...',
];

// prettier-ignore
const CHILD: Frame = [
  '......gg....gg......',
  '.....gGgg..ggGg.....',
  '......ggGggGgg......',
  '.........GG.........',
  '......kkkkkkkk......',
  '....kkbbbbbbbbkk....',
  '...kbllbbbbbbbbbk...',
  '..kbllbbbbbbbbbbbk..',
  '..kbbbbbbbbbbbbbbk..',
  '.kbbbkbbbbbbbbkbbbk.',
  '.kbbbkbbbbbbbbkbbbk.',
  '.kbpbbbbbkkbbbbbpbk.',
  '.kbbbbbbbbbbbbbbbbk.',
  'kbkbbbbbbbbbbbbbbkbk',
  '.kksbbbbbbbbbbbbskk.',
  '...ksbbbbbbbbbbsk...',
  '....kksssssssskk....',
  '.....kbk....kbk.....',
  '.....kkk....kkk.....',
  '....................',
];

// prettier-ignore
const ADULT: Frame = [
  '..........ffff..........',
  '.........ffyyff.........',
  '.........ffyyff.........',
  '..........ffff..........',
  '.......gg..GG..gg.......',
  '........ggGGGGgg........',
  '...........GG...........',
  '.......kkkkkkkkkk.......',
  '.....kkbbbbbbbbbbkk.....',
  '....kbllbbbbbbbbbbbk....',
  '...kbllbbbbbbbbbbbbbk...',
  '..kbbbbbbbbbbbbbbbbbbk..',
  '..kbbbbkbbbbbbbbkbbbbk..',
  '..kbbbbkbbbbbbbbkbbbbk..',
  '..kbbpbbbbbkkbbbbbpbbk..',
  '..kbbbbbbbbbbbbbbbbbbk..',
  '.kbkbbbbbbbbbbbbbbbbkbk.',
  '.kbkbbbbbbbbbbbbbbbbkbk.',
  '..kksbbbbbbbbbbbbbbskk..',
  '....ksbbbbbbbbbbbbsk....',
  '.....kksssssssssskk.....',
  '......kbk......kbk......',
  '......kkk......kkk......',
  '........................',
];

// Where the face and feet are in each hatched stage's grid, so every pose is made from one drawing
// and the character stays the same across poses.
type Anatomy = {
  base: Frame;
  eyes: [top: number, bottom: number, left: number, right: number];
  mouth: [row: number, from: number, to: number];
  feet: number; // first of the two feet rows
  feetStep: [string, string]; // those rows mid-step
};

const ANATOMY: Record<Exclude<BuddyStage, 'EGG'>, Anatomy> = {
  BABY: {
    base: BABY,
    eyes: [7, 8, 4, 11],
    mouth: [9, 7, 8],
    feet: 14,
    feetStep: ['..kbk......kbk..', '..kkk......kkk..'],
  },
  CHILD: {
    base: CHILD,
    eyes: [9, 10, 5, 14],
    mouth: [11, 9, 10],
    feet: 17,
    feetStep: ['....kbk......kbk....', '....kkk......kkk....'],
  },
  ADULT: {
    base: ADULT,
    eyes: [12, 13, 7, 16],
    mouth: [14, 11, 12],
    feet: 21,
    feetStep: ['.....kbk........kbk.....', '.....kkk........kkk.....'],
  },
};

export type Pose = 'idle' | 'step' | 'blink' | 'happy' | 'sleep' | 'hungry' | 'eat' | 'strain';

type Pixel = [row: number, col: number, key: string];

function paint(frame: Frame, pixels: Pixel[]): Frame {
  const rows = frame.map((row) => row.split(''));
  for (const [r, c, key] of pixels) rows[r][c] = key;
  return rows.map((row) => row.join(''));
}

function makePoses({ base, eyes, mouth, feet, feetStep }: Anatomy): Record<Pose, Frame> {
  const [top, bottom, left, right] = eyes;
  const [mouthRow, m1, m2] = mouth;
  const open: Pixel[] = [
    [top, left, 'b'],
    [top, right, 'b'],
  ];
  return {
    idle: base,
    step: base.map((row, i) => (i === feet ? feetStep[0] : i === feet + 1 ? feetStep[1] : row)),
    // Eyes as short lines.
    blink: paint(base, [...open, [bottom, left - 1, 'k'], [bottom, right + 1, 'k']]),
    // ^ ^
    happy: paint(base, [
      [bottom, left, 'b'],
      [bottom, left - 1, 'k'],
      [bottom, left + 1, 'k'],
      [bottom, right, 'b'],
      [bottom, right - 1, 'k'],
      [bottom, right + 1, 'k'],
    ]),
    sleep: paint(base, [...open, [bottom, left - 1, 'k'], [bottom, right - 1, 'k']]),
    // A small, lowered mouth.
    hungry: paint(base, [
      [mouthRow, m1, 'b'],
      [mouthRow, m2, 'b'],
      [mouthRow + 1, m1, 'k'],
      [mouthRow + 1, m2, 'k'],
    ]),
    // Mouth wide open (alternated with idle, it chews).
    eat: paint(base, [
      [mouthRow + 1, m1, 'k'],
      [mouthRow + 1, m2, 'k'],
      [mouthRow, m1 - 1, 'k'],
      [mouthRow, m2 + 1, 'k'],
    ]),
    // > <, squeezing out a poop.
    strain: paint(base, [
      [top, left, 'b'],
      [top, left - 1, 'k'],
      [top, right, 'b'],
      [top, right + 1, 'k'],
    ]),
  };
}

const POSES: Record<Exclude<BuddyStage, 'EGG'>, Record<Pose, Frame>> = {
  BABY: makePoses(ANATOMY.BABY),
  CHILD: makePoses(ANATOMY.CHILD),
  ADULT: makePoses(ANATOMY.ADULT),
};

export function buddyFrame(stage: BuddyStage, pose: Pose): Frame {
  return stage === 'EGG' ? EGG : POSES[stage][pose];
}

export const STAGE_ORDER: readonly BuddyStage[] = ['EGG', 'BABY', 'CHILD', 'ADULT'];

export const PROP_PALETTE: Palette = {
  k: '#3A2E2A',
  c: '#A0673C', // poop
  h: '#C98D5A', // poop highlight
  w: '#FFFFFF', // rice, sparkles
  a: '#7FB3D5', // bowl
  r: '#FF6B81', // heart
  y: '#FFD166', // sparkles
  u: '#F07A4A', // level up, autumn leaf
  g: '#8BCB6B', // plant
  G: '#5DA14E', // plant shade
  o: '#E0875F', // flower pot
  m: '#F4B8A8', // rug
  n: '#FFF1E6', // rug stripes
  f: '#FF9EB5', // blossom
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

// prettier-ignore
export const SPARKLE: Frame = [
  '..y..',
  '..y..',
  'yywyy',
  '..y..',
  '..y..',
];

// prettier-ignore
export const EXCLAIM: Frame = [
  'kk',
  'kk',
  'kk',
  'kk',
  '..',
  'kk',
];

// "LV ▲" over the buddy's head on a new level.
// prettier-ignore
export const LEVEL_UP: Frame = [
  'u....u...u....u..',
  'u....u...u...uuu.',
  'u.....u.u...uuuuu',
  'u.....u.u....uuu.',
  'uuuu...u.....uuu.',
];

// ♪ rising from a singing buddy.
// prettier-ignore
export const NOTE: Frame = [
  '...kk',
  '...kk',
  '...k.',
  '...k.',
  '.kkk.',
  'kkkk.',
  '.kk..',
];

// --- Decorations (docs/product.md, 무대 꾸미기) ---

// prettier-ignore
export const PLANT: Frame = [
  '..g...g..',
  '.gGg.gGg.',
  '.gGGgGGg.',
  '..gGGGg..',
  '...gGg...',
  '....G....',
  '.kkkkkkkk',
  '.kooooook',
  '..kooook.',
  '..kkkkkk.',
];

export const RUG: Frame = [
  '..' + 'm'.repeat(26) + '..',
  '.' + 'mmn'.repeat(9) + 'm.',
  '.' + 'nmm'.repeat(9) + 'm.',
  '..' + 'm'.repeat(26) + '..',
];

// One flag of the garland, in the given color key.
export function flag(color: 'r' | 'y' | 'a'): Frame {
  return [color.repeat(5), '.' + color.repeat(3) + '.', '..' + color + '..'];
}

// prettier-ignore
const LEAF: Frame = [
  '...u...',
  '.u.u.u.',
  '.uuuuu.',
  'uuuuuuu',
  '.uuuuu.',
  '...c...',
  '...c...',
];

// prettier-ignore
const SNOW: Frame = [
  '...a...',
  '.a.a.a.',
  '..aaa..',
  'aaaaaaa',
  '..aaa..',
  '.a.a.a.',
  '...a...',
];

// prettier-ignore
const BLOSSOM: Frame = [
  '..f.f..',
  '.fffff.',
  'ffyyyff',
  '.fyyyf.',
  'ffyyyff',
  '.fffff.',
  '..f.f..',
];

// prettier-ignore
const SUN: Frame = [
  'y..y..y',
  '.y.y.y.',
  '..uuu..',
  'yyuuuyy',
  '..uuu..',
  '.y.y.y.',
  'y..y..y',
];

// The season's mark on the wall, by month (0 = January).
export function seasonMark(month: number): Frame {
  if (month >= 2 && month <= 4) return BLOSSOM;
  if (month >= 5 && month <= 7) return SUN;
  if (month >= 8 && month <= 10) return LEAF;
  return SNOW;
}
