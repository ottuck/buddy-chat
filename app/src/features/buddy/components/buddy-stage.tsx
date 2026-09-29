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
  EXCLAIM,
  HEART,
  LEVEL_UP,
  POOP,
  type Pose,
  PROP_PALETTE,
  SPARKLE,
  STAGE_ORDER,
  ZZZ,
} from '../pixel/sprites';
import type { Reaction, ReactionKind } from '../reactions';

// The buddy's stage above the chat (docs/product.md, 핵심 경험): the buddy walks around, waits by
// an empty bowl when hungry, leaves poops on the floor and sleeps at night. Tapping the bowl or a
// poop takes care of it right there, and it reacts to what happens in the room: eating when fed,
// straining when it poops, sparkling when cleaned, hopping at a new message, and evolving.
// Folds into one row while typing or reading back.

const FLOOR = 22;
const PROP_SCALE = 3;
const TICK_MS = 450;
// While evolving the old and new looks swap this fast.
const FAST_TICK_MS = 90;
const PET_MS = 1800;
// Floor kept free at the right end for the tour's egg.
const EGG_ROOM = 72;
const SLEEP_FROM = 23;
const SLEEP_UNTIL = 7;
// How long each reaction plays.
const REACTION_MS: Record<ReactionKind, number> = {
  message: 1400,
  fed: 3200,
  cleaned: 1800,
  pooped: 1400,
  levelUp: 1600,
  evolved: 2600,
};
// Of 'fed', the part spent chewing; the rest is a happy heart.
const CHEW_MS = 2400;
// Of 'evolved', the transformation (rings of light, old and new looks flickering); the rest shows
// off the new look with a burst of sparkles.
const EVOLVE_MS = 1400;
const GLOW_MS = 450;
// Where the burst's sparkles fly, from the buddy's middle.
const BURST = [
  [-1, -1],
  [1, -1],
  [-1, 0.3],
  [1, 0.3],
] as const;
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
  // The latest live event to react to.
  reaction: Reaction | null;
  // An egg resting at the far end: the tour's ending, "yours is next".
  companionEgg?: boolean;
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

// A counter that drives frame changes (steps, blinks, chewing) at a toy-like pace.
function useTick(ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return tick;
}

// The reaction playing now, and how far into it (in ticks of the phase that matters). A new event
// replaces the one playing.
function useActiveReaction(reaction: Reaction | null) {
  const [active, setActive] = useState<{ kind: ReactionKind; phase: 'main' | 'after' } | null>(
    null,
  );
  useEffect(() => {
    if (!reaction) return;
    const timers = [setTimeout(() => setActive({ kind: reaction.kind, phase: 'main' }), 0)];
    const main =
      reaction.kind === 'fed' ? CHEW_MS : reaction.kind === 'evolved' ? EVOLVE_MS : undefined;
    if (main !== undefined) {
      timers.push(setTimeout(() => setActive({ kind: reaction.kind, phase: 'after' }), main));
    }
    timers.push(setTimeout(() => setActive(null), REACTION_MS[reaction.kind]));
    return () => timers.forEach(clearTimeout);
  }, [reaction]);
  return active;
}

function gridScale(height: number, gridHeight: number): number {
  // Up to 5 points per pixel, smaller on short screens so the grown-up buddy still fits.
  return Math.max(3, Math.min(5, Math.floor((height - 84) / gridHeight)));
}

function ExpandedStage({
  buddy,
  busy,
  height,
  onFeed,
  onClean,
  onOpenDetail,
  reaction: latest,
  companionEgg,
}: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  // The stage mounts again each time it unfolds; what happened before that is not news. Without
  // this, focusing the composer and leaving it replayed the last evolution every time.
  const [mountedAfter] = useState(latest?.id);
  const reaction = latest && latest.id !== mountedAfter ? latest : null;
  const active = useActiveReaction(reaction);
  const evolving = active?.kind === 'evolved' && active.phase === 'main';
  const tick = useTick(evolving ? FAST_TICK_MS : TICK_MS);
  const night = useSleeping();
  const [width, setWidth] = useState(0);
  const [walking, setWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [petted, setPetted] = useState(false);
  const petTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placed = useRef(false);
  const [x] = useState(() => new Animated.Value(0));
  const [hop] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const [flash] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));

  const egg = buddy.stage === 'EGG';
  // A reaction wakes a sleeping buddy for a moment.
  const sleeping = night && !active && !petted;
  const idleFrame = buddyFrame(buddy.stage, 'idle');
  const scale = gridScale(height, idleFrame.length);
  const spriteWidth = idleFrame[0].length * scale;
  const spriteHeight = idleFrame.length * scale;
  const glowSize = Math.round(spriteWidth * 1.5);
  const bowlWidth = 12 * PROP_SCALE;
  // The walkable strip: right of the bowl, left of the poops.
  const minX = 16 + bowlWidth + 8;
  const maxX = Math.max(minX, width - spriteWidth - 16 - (companionEgg ? EGG_ROOM : 0));
  const eating = active?.kind === 'fed';
  const settled = sleeping || buddy.hungry || egg || eating || evolving;

  // Wander: walk to a random spot, look around, repeat. A hungry or eating buddy stays by the bowl,
  // a sleeping one stays put, and an egg only wobbles.
  useEffect(() => {
    if (width === 0) return;
    let stopped = false;
    let current: Animated.CompositeAnimation | null = null;
    const home = buddy.hungry || eating ? minX : (minX + maxX) / 2;
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
          duration: distance * (eating ? 12 : 28),
          easing: Easing.linear,
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.delay(settled ? 60_000 : 1500 + Math.random() * 3500),
      ]);
      current.start(({ finished }) => {
        if (finished) leg(to);
      });
      // The walk part ends before the pause; stop stepping then.
      setTimeout(() => !stopped && setWalking(false), distance * (eating ? 12 : 28));
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
  }, [width, settled, eating, buddy.hungry, minX, maxX, x]);

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

  // Movement that goes with a reaction: hops for a message or a new level, a shudder while
  // straining. Evolving: rings of light spread from the buddy while it changes, a quick flash as the
  // new look settles, then a burst of sparkles.
  useEffect(() => {
    if (!reaction) return;
    const jump = (h: number) =>
      Animated.sequence([
        Animated.timing(hop, { toValue: -h, duration: 140, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(hop, { toValue: 0, duration: 140, useNativeDriver: NATIVE_DRIVER }),
      ]);
    const shake = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 2, duration: 60, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(hop, { toValue: 0, duration: 60, useNativeDriver: NATIVE_DRIVER }),
      ]),
      { iterations: 10 },
    );
    const transform = Animated.sequence([
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 0, duration: 0, useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(glow, {
            toValue: 1,
            duration: GLOW_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: NATIVE_DRIVER,
          }),
        ]),
        { iterations: Math.floor(EVOLVE_MS / GLOW_MS) },
      ),
      Animated.timing(flash, { toValue: 0.6, duration: 60, useNativeDriver: NATIVE_DRIVER }),
      Animated.parallel([
        Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: NATIVE_DRIVER }),
        jump(12),
        Animated.sequence([
          Animated.timing(burst, { toValue: 0, duration: 0, useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(burst, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: NATIVE_DRIVER,
          }),
        ]),
      ]),
    ]);
    const moves: Partial<Record<ReactionKind, Animated.CompositeAnimation>> = {
      message: Animated.sequence([jump(14), jump(8)]),
      cleaned: jump(10),
      pooped: shake,
      levelUp: Animated.sequence([jump(10), jump(6)]),
      evolved: transform,
    };
    const move = moves[reaction.kind];
    move?.start();
    return () => {
      move?.stop();
      glow.setValue(0);
      burst.setValue(1);
      flash.setValue(0);
    };
  }, [reaction, hop, flash, glow, burst]);

  useEffect(
    () => () => {
      if (petTimer.current) clearTimeout(petTimer.current);
    },
    [],
  );

  const pet = () => {
    setPetted(true);
    if (petTimer.current) clearTimeout(petTimer.current);
    petTimer.current = setTimeout(() => setPetted(false), PET_MS);
  };

  const pose: Pose = eating
    ? active?.phase === 'main'
      ? tick % 2 === 0
        ? 'eat'
        : 'idle'
      : 'happy'
    : active?.kind === 'pooped'
      ? 'strain'
      : active?.kind === 'cleaned' ||
          active?.kind === 'levelUp' ||
          (active?.kind === 'evolved' && !evolving) ||
          petted
        ? 'happy'
        : sleeping
          ? 'sleep'
          : buddy.hungry
            ? 'hungry'
            : walking
              ? tick % 2 === 0
                ? 'step'
                : 'idle'
              : tick % 11 === 0
                ? 'blink'
                : 'idle';

  // While evolving, the old and new looks take turns quickly.
  const previousStage = STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(buddy.stage) - 1)];
  const frame =
    evolving && tick % 2 === 0 ? buddyFrame(previousStage, 'idle') : buddyFrame(buddy.stage, pose);

  const showHeart = petted || (eating && active?.phase === 'after');
  const sparkling = active?.kind === 'cleaned';
  const bursting = active?.kind === 'evolved' && active.phase === 'after';
  const levelingUp = active?.kind === 'levelUp';

  const feed = () => {
    if (!buddy.canFeed || busy) return;
    onFeed();
  };
  const clean = () => {
    if (!buddy.canClean || busy) return;
    onClean();
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
        <Text
          style={[
            styles.level,
            levelingUp ? styles.levelUp : null,
            { color: levelingUp ? colors.accent : colors.textMuted },
          ]}
        >
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

      {companionEgg ? (
        <View style={[styles.poop, { bottom: FLOOR - 2, right: 20 }]}>
          <PixelSprite frame={buddyFrame('EGG', 'idle')} palette={BUDDY_PALETTE} scale={3} />
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.buddy,
          {
            bottom: FLOOR - scale,
            transform: [
              { translateX: x },
              { translateY: hop },
              {
                rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }),
              },
            ],
          },
        ]}
      >
        {evolving ? (
          <Animated.View
            style={[
              styles.glow,
              {
                width: glowSize,
                height: glowSize,
                borderRadius: glowSize / 2,
                left: (spriteWidth - glowSize) / 2,
                top: (spriteHeight - glowSize) / 2,
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
                transform: [
                  { scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.3] }) },
                ],
              },
            ]}
          />
        ) : null}
        {levelingUp ? (
          <View style={styles.above}>
            <PixelSprite frame={LEVEL_UP} palette={PROP_PALETTE} scale={3} />
          </View>
        ) : showHeart ? (
          <View style={styles.above}>
            <PixelSprite frame={HEART} palette={PROP_PALETTE} scale={3} />
          </View>
        ) : active?.kind === 'message' ? (
          <View style={styles.above}>
            <PixelSprite frame={EXCLAIM} palette={BUDDY_PALETTE} scale={3} />
          </View>
        ) : sleeping && tick % 4 < 2 ? (
          <View style={styles.above}>
            <PixelSprite frame={ZZZ} palette={BUDDY_PALETTE} scale={3} />
          </View>
        ) : null}
        {sparkling && tick % 2 === 0 ? (
          <>
            <View style={[styles.sparkle, { left: -14, top: 6 }]}>
              <PixelSprite frame={SPARKLE} palette={PROP_PALETTE} scale={3} />
            </View>
            <View style={[styles.sparkle, { right: -14, top: 18 }]}>
              <PixelSprite frame={SPARKLE} palette={PROP_PALETTE} scale={3} />
            </View>
          </>
        ) : null}
        {bursting
          ? BURST.map(([dx, dy], i) => (
              <Animated.View
                key={i}
                style={[
                  styles.sparkle,
                  styles.passThrough,
                  {
                    left: spriteWidth / 2 - 7,
                    top: spriteHeight / 2 - 7,
                    opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                    transform: [
                      {
                        translateX: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, dx * (spriteWidth / 2 + 18)],
                        }),
                      },
                      {
                        translateY: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, dy * (spriteHeight / 2 + 12)],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <PixelSprite frame={SPARKLE} palette={PROP_PALETTE} scale={3} />
              </Animated.View>
            ))
          : null}
        <Pressable
          onPress={pet}
          accessibilityRole="button"
          accessibilityLabel={t('buddy.pet', { buddy: buddy.name })}
        >
          <PixelSprite frame={frame} palette={BUDDY_PALETTE} scale={scale} flipped={facingLeft} />
        </Pressable>
      </Animated.View>

      {/* The evolution's quick flash as the new look settles, over the whole stage. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />
    </View>
  );
}

function FoldedStage({ buddy, onExpand }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const frame = buddyFrame(buddy.stage, buddy.hungry ? 'hungry' : 'idle');
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
      {/* About 32 points tall whatever the stage's grid size. */}
      <PixelSprite frame={frame} palette={BUDDY_PALETTE} scale={32 / frame.length} />
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
    top: -24,
  },
  sparkle: {
    position: 'absolute',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 244, 196, 0.85)',
    borderWidth: 4,
    borderColor: '#FFD166',
    pointerEvents: 'none',
  },
  passThrough: {
    pointerEvents: 'none',
  },
  levelUp: {
    fontWeight: '700',
  },
  flash: {
    backgroundColor: '#FFFFFF',
    pointerEvents: 'none',
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
