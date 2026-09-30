import { StyleSheet, View } from 'react-native';

import type { AlbumEntry } from '@/features/room/api';

import { PixelSprite } from '../pixel/pixel-sprite';
import {
  BUDDY_PALETTE,
  type BowlTier,
  buddyFrame,
  PLANTS,
  type PlantTier,
  PROP_PALETTE,
  RUG,
} from '../pixel/sprites';

// The stage's decorations (docs/product.md, 무대 꾸미기). Levels bring a reward every five levels,
// mostly making what is already there finer, so the stage does not fill up. They belong to the
// room: once a buddy has gone its own way, everything stays, and its portrait hangs on the wall.

export type Reward = 'plant1' | 'bowl1' | 'plant2' | 'rug' | 'plant3' | 'bowl2';

// Shown in the guide and the buddy sheet ("next: Lv.10 silver bowl") as well.
export const REWARDS: readonly { level: number; reward: Reward }[] = [
  { level: 5, reward: 'plant1' },
  { level: 10, reward: 'bowl1' },
  { level: 15, reward: 'plant2' },
  { level: 20, reward: 'rug' },
  { level: 25, reward: 'plant3' },
  { level: 30, reward: 'bowl2' },
];

const FRAMES_SHOWN = 3;

export function decorFor(level: number, album: AlbumEntry[]) {
  const reached = album.length > 0 ? Infinity : level;
  const has = (reward: Reward) =>
    REWARDS.some((entry) => entry.reward === reward && reached >= entry.level);
  const plant: PlantTier | 0 = has('plant3') ? 3 : has('plant2') ? 2 : has('plant1') ? 1 : 0;
  const bowl: BowlTier = has('bowl2') ? 2 : has('bowl1') ? 1 : 0;
  return {
    plant,
    bowl,
    rug: has('rug'),
    // The latest ones, newest on the right.
    portraits: album.slice(-FRAMES_SHOWN),
  };
}

export type Decor = ReturnType<typeof decorFor>;

// The next reward to look forward to, if any.
export function nextReward(level: number, album: AlbumEntry[]) {
  if (album.length > 0) return null;
  return REWARDS.find((entry) => entry.level > level) ?? null;
}

const PLANT_SCALE = 3;

// Floor the plant takes in the corner, so poops and the walk stay clear of it.
export function plantRoom(tier: PlantTier | 0): number {
  return tier === 0 ? 0 : PLANTS[tier][0].length * PLANT_SCALE + 8;
}

// Behind the buddy: portraits of buddies gone their own way, and the rug. The plant and the bowl
// are drawn by the stage.
export function WallDecor({ decor, floor, top }: { decor: Decor; floor: number; top: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.passThrough]}>
      {decor.portraits.map((entry, i) => (
        <View
          key={entry.graduatedAt}
          style={[
            styles.frame,
            { top: top + 6, right: 14 + (decor.portraits.length - 1 - i) * 52 },
          ]}
          accessibilityLabel={entry.name}
        >
          <PixelSprite frame={buddyFrame('ADULT', 'idle')} palette={BUDDY_PALETTE} scale={1.5} />
        </View>
      ))}
      {decor.rug ? (
        <View style={[styles.rug, { bottom: floor - 5 }]}>
          <PixelSprite frame={RUG} palette={PROP_PALETTE} scale={3} />
        </View>
      ) : null}
    </View>
  );
}

export function Plant({ tier }: { tier: PlantTier }) {
  return <PixelSprite frame={PLANTS[tier]} palette={PROP_PALETTE} scale={PLANT_SCALE} />;
}

const styles = StyleSheet.create({
  passThrough: {
    pointerEvents: 'none',
  },
  frame: {
    position: 'absolute',
    padding: 2,
    borderWidth: 3,
    borderColor: '#A0673C',
    backgroundColor: '#FFF6E8',
  },
  rug: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
