import { StyleSheet, View } from 'react-native';

import type { AlbumEntry } from '@/features/room/api';

import { PixelSprite } from '../pixel/pixel-sprite';
import {
  BUDDY_PALETTE,
  buddyFrame,
  flag,
  PLANT,
  PROP_PALETTE,
  RUG,
  seasonMark,
} from '../pixel/sprites';

// The stage's decorations (docs/product.md, 무대 꾸미기). They belong to the room: things come with
// levels (a plant at 7, a rug at 15, a garland at 25) and stay once a buddy has gone its own way,
// whose portrait then hangs on the wall. A mark of the season is always up.

export const PLANT_FROM = 7;
export const RUG_FROM = 15;
export const GARLAND_FROM = 25;
const FRAMES_SHOWN = 3;
const FLAG_COLORS = ['r', 'y', 'a'] as const;

export function decorFor(level: number, album: AlbumEntry[]) {
  const grownBefore = album.length > 0;
  return {
    plant: grownBefore || level >= PLANT_FROM,
    rug: grownBefore || level >= RUG_FROM,
    garland: grownBefore || level >= GARLAND_FROM,
    // The latest ones, newest on the right.
    portraits: album.slice(-FRAMES_SHOWN),
  };
}

export type Decor = ReturnType<typeof decorFor>;

// Width of the plant on the floor, so poops and the walk stay clear of it.
export const PLANT_ROOM = 34;

// Behind the buddy: garland, season mark, portraits and the rug. The plant is drawn by the stage,
// on the floor next to the poops.
export function WallDecor({
  decor,
  width,
  floor,
  top,
}: {
  decor: Decor;
  width: number;
  floor: number;
  // Below the name and level row.
  top: number;
}) {
  const flags = Math.max(0, Math.floor((width - 24) / 22));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {decor.garland ? (
        <View style={[styles.garland, { top }]}>
          {Array.from({ length: flags }, (_, i) => (
            <PixelSprite
              key={i}
              frame={flag(FLAG_COLORS[i % FLAG_COLORS.length])}
              palette={PROP_PALETTE}
              scale={3}
            />
          ))}
        </View>
      ) : null}
      <View style={[styles.season, { top: top + (decor.garland ? 18 : 4) }]}>
        <PixelSprite frame={seasonMark(new Date().getMonth())} palette={PROP_PALETTE} scale={3} />
      </View>
      {decor.portraits.map((entry, i) => (
        <View
          key={entry.graduatedAt}
          style={[
            styles.frame,
            {
              top: top + (decor.garland ? 20 : 6),
              right: 14 + (decor.portraits.length - 1 - i) * 52,
            },
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

export function Plant() {
  return <PixelSprite frame={PLANT} palette={PROP_PALETTE} scale={3} />;
}

const styles = StyleSheet.create({
  garland: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: '#A0673C',
    paddingTop: 0,
  },
  season: {
    position: 'absolute',
    left: 16,
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
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
