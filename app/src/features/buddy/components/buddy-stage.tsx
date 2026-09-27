import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { useColors } from '@/theme';

import type { BuddyView } from '../api';
import { PixelSprite } from '../pixel/pixel-sprite';
import {
  BOWL_EMPTY,
  BOWL_FULL,
  BUDDY_PALETTE,
  buddyFrame,
  HEART,
  POOP,
  type Pose,
  PROP_PALETTE,
  STAGE_SIZE,
  ZZZ,
} from '../pixel/sprites';

// The buddy's stage above the chat (docs/product.md, 핵심 경험): the buddy walks around, waits by
// an empty bowl when hungry, leaves poops on the floor and sleeps at night. Tapping the bowl or a
// poop takes care of it right there. Folds into one row while typing or reading back.

const FLOOR = 22;
const PROP_SCALE = 3;
const TICK_MS = 450;
const HAPPY_MS = 1800;
const SLEEP_FROM = 23;
const SLEEP_UNTIL = 7;
// The web has no native animation driver (it would warn and fall back anyway).
const NATIVE_DRIVER = Platform.OS !== 'web';

type Props = {
  buddy: BuddyView;
  // A feed or clean request is in flight.
  busy: boolean;
  expanded: boolean;
  height: number;
  onExpand: () => void;
  onFeed: () => void;
  onClean: () => void;
  onOpenDetail: () => void;
};

export function BuddyStage(props: Props) {
  return props.expanded ? <ExpandedStage {...props} /> : <FoldedStage {...props} />;
}

// Local night hours, checked once a minute.
function useSleeping(): boolean {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return hour >= SLEEP_FROM || hour < SLEEP_UNTIL;
}

// A counter that drives frame changes (steps, blinks) at a toy-like pace.
function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return tick;
}

function ExpandedStage({ buddy, busy, height, onFeed, onClean, onOpenDetail }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const tick = useTick();
  const sleeping = useSleeping();
  const [width, setWidth] = useState(0);
  const [walking, setWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [happy, setHappy] = useState(false);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placed = useRef(false);
  const [x] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));

  const egg = buddy.stage === 'EGG';
  const scale = Math.round(5 * STAGE_SIZE[buddy.stage]);
  const spriteWidth = 16 * scale;
  const bowlWidth = 12 * PROP_SCALE;
  // The walkable strip: right of the bowl, left of the poops.
  const minX = 16 + bowlWidth + 8;
  const maxX = Math.max(minX, width - spriteWidth - 16);
  const settled = sleeping || buddy.hungry || egg;

  // Wander: walk to a random spot, look around, repeat. A hungry buddy waits by the bowl, a
  // sleeping one stays put, and an egg only wobbles.
  useEffect(() => {
    if (width === 0) return;
    let stopped = false;
    let current: Animated.CompositeAnimation | null = null;
    const home = buddy.hungry ? minX : (minX + maxX) / 2;
    const leg = (from: number) => {
      if (stopped) return;
      const to = settled ? home : minX + Math.random() * (maxX - minX);
      const distance = Math.abs(to - from);
      if (distance > 2) {
        setFacingLeft(to < from);
        setWalking(true);
      }
      current = Animated.sequence([
        Animated.timing(x, {
          toValue: to,
          duration: distance * 28,
          easing: Easing.linear,
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.delay(settled ? 60_000 : 1500 + Math.random() * 3500),
      ]);
      current.start(({ finished }) => {
        if (finished) leg(to);
      });
      // The walk part ends before the pause; stop stepping then.
      setTimeout(() => !stopped && setWalking(false), distance * 28);
    };
    x.stopAnimation((value) => {
      // The first time, appear where the buddy belongs instead of walking in from the edge.
      if (!placed.current) {
        placed.current = true;
        x.setValue(home);
        leg(home);
      } else {
        leg(value);
      }
    });
    return () => {
      stopped = true;
      current?.stop();
    };
  }, [width, settled, buddy.hungry, minX, maxX, x]);

  // The egg rocks in small, stepped moves now and then.
  useEffect(() => {
    if (!egg) return;
    const step = (to: number) =>
      Animated.timing(tilt, { toValue: to, duration: 1, useNativeDriver: NATIVE_DRIVER });
    const rock = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        step(-1),
        Animated.delay(220),
        step(1),
        Animated.delay(220),
        step(-1),
        Animated.delay(220),
        step(0),
      ]),
    );
    rock.start();
    return () => rock.stop();
  }, [egg, tilt]);

  useEffect(
    () => () => {
      if (happyTimer.current) clearTimeout(happyTimer.current);
    },
    [],
  );

  const cheer = () => {
    setHappy(true);
    if (happyTimer.current) clearTimeout(happyTimer.current);
    happyTimer.current = setTimeout(() => setHappy(false), HAPPY_MS);
  };

  const pose: Pose = sleeping
    ? 'sleep'
    : happy
      ? 'happy'
      : buddy.hungry
        ? 'hungry'
        : walking
          ? tick % 2 === 0
            ? 'step'
            : 'idle'
          : tick % 11 === 0
            ? 'blink'
            : 'idle';

  const feed = () => {
    if (!buddy.canFeed || busy) return;
    onFeed();
    cheer();
  };
  const clean = () => {
    if (!buddy.canClean || busy) return;
    onClean();
    cheer();
  };

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.stage, { height, backgroundColor: colors.stage }]}
    >
      <Pressable
        onPress={onOpenDetail}
        accessibilityRole="button"
        accessibilityLabel={t('buddy.open', { buddy: buddy.name })}
        style={styles.info}
      >
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {buddy.name}
        </Text>
        <Text style={[styles.level, { color: colors.textMuted }]}>
          {t('buddy.level', { level: buddy.level })}
        </Text>
        <View style={styles.bar}>
          <ProgressBar progress={buddy.levelProgress} />
        </View>
      </Pressable>

      <View
        style={[
          styles.floor,
          { height: FLOOR, backgroundColor: colors.stageFloor, borderTopColor: colors.stageLine },
        ]}
      />

      <Pressable
        onPress={feed}
        disabled={!buddy.canFeed || busy}
        accessibilityRole="button"
        accessibilityLabel={t('buddy.feed')}
        style={[styles.bowl, { bottom: FLOOR - 3 }]}
      >
        <PixelSprite
          frame={buddy.canFeed ? BOWL_EMPTY : BOWL_FULL}
          palette={PROP_PALETTE}
          scale={PROP_SCALE}
        />
      </Pressable>

      {Array.from({ length: buddy.poops }, (_, i) => (
        <Pressable
          key={i}
          onPress={clean}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('buddy.cleanUp')}
          style={[styles.poop, { bottom: FLOOR - 2, right: 16 + i * 30 }]}
        >
          <PixelSprite frame={POOP} palette={PROP_PALETTE} scale={PROP_SCALE} />
        </Pressable>
      ))}

      <Animated.View
        style={[
          styles.buddy,
          {
            bottom: FLOOR - scale,
            transform: [
              { translateX: x },
              {
                rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }),
              },
            ],
          },
        ]}
      >
        {happy ? (
          <View style={styles.above}>
            <PixelSprite frame={HEART} palette={PROP_PALETTE} scale={3} />
          </View>
        ) : sleeping && tick % 4 < 2 ? (
          <View style={styles.above}>
            <PixelSprite frame={ZZZ} palette={BUDDY_PALETTE} scale={3} />
          </View>
        ) : null}
        <Pressable
          onPress={cheer}
          accessibilityRole="button"
          accessibilityLabel={t('buddy.pet', { buddy: buddy.name })}
        >
          <PixelSprite
            frame={buddyFrame(buddy.stage, pose)}
            palette={BUDDY_PALETTE}
            scale={scale}
            flipped={facingLeft}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function FoldedStage({ buddy, onExpand }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onExpand}
      accessibilityRole="button"
      accessibilityLabel={t('buddy.showStage', { buddy: buddy.name })}
      style={({ pressed }) => [
        styles.folded,
        { backgroundColor: colors.stage, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <PixelSprite
        frame={buddyFrame(buddy.stage, buddy.hungry ? 'hungry' : 'idle')}
        palette={BUDDY_PALETTE}
        scale={2}
      />
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {buddy.name}
      </Text>
      <Text style={[styles.level, { color: colors.textMuted }]}>
        {t('buddy.level', { level: buddy.level })}
      </Text>
      <View style={styles.foldedBar}>
        <ProgressBar progress={buddy.levelProgress} />
      </View>
      {buddy.hungry ? <Text style={styles.status}>🍚</Text> : null}
      {buddy.poops > 0 ? <Text style={styles.status}>{'💩'.repeat(buddy.poops)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  info: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  level: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  // Row containers: the bar stretches with flex, which in a column would collapse its height.
  bar: {
    width: 72,
    flexDirection: 'row',
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 2,
  },
  bowl: {
    position: 'absolute',
    left: 16,
  },
  poop: {
    position: 'absolute',
  },
  buddy: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
  },
  above: {
    position: 'absolute',
    top: -22,
  },
  folded: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  foldedBar: {
    flex: 1,
    flexDirection: 'row',
  },
  status: {
    fontSize: 14,
  },
});
