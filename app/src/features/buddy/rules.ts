// Buddy growth rules. The numbers are placeholders until they are tuned (docs/project-plan.md §62);
// the server will own these rules, this copy only drives the UI before it exists.

export type BuddyStage = 'EGG' | 'BABY' | 'CHILD' | 'ADULT';

export type Buddy = {
  name: string;
  exp: number; // total, never decreases
  fullness: number; // 0 (hungry) .. 100 (full)
  cleanliness: number; // 0 (dirty) .. 100 (clean)
};

export const EXP_PER_LEVEL = 20;
export const EXP_REWARD = { FEED: 2, CLEAN: 2 } as const; // docs/project-plan.md §25

// Below these the buddy counts as hungry / dirty, and caring for it is possible.
const HUNGRY_BELOW = 80;
const DIRTY_BELOW = 100;

const STAGE_FROM_LEVEL: [minLevel: number, stage: BuddyStage][] = [
  [10, 'ADULT'],
  [5, 'CHILD'],
  [2, 'BABY'],
  [1, 'EGG'],
];

export function levelOf(exp: number): number {
  return Math.floor(exp / EXP_PER_LEVEL) + 1;
}

// Progress within the current level, 0..1.
export function levelProgress(exp: number): number {
  return (exp % EXP_PER_LEVEL) / EXP_PER_LEVEL;
}

export function stageOf(level: number): BuddyStage {
  return STAGE_FROM_LEVEL.find(([minLevel]) => level >= minLevel)?.[1] ?? 'EGG';
}

export const canFeed = (buddy: Buddy) => buddy.fullness < HUNGRY_BELOW;
export const canClean = (buddy: Buddy) => buddy.cleanliness < DIRTY_BELOW;

export function feed(buddy: Buddy): Buddy {
  if (!canFeed(buddy)) return buddy;
  return { ...buddy, fullness: 100, exp: buddy.exp + EXP_REWARD.FEED };
}

export function clean(buddy: Buddy): Buddy {
  if (!canClean(buddy)) return buddy;
  return { ...buddy, cleanliness: 100, exp: buddy.exp + EXP_REWARD.CLEAN };
}
