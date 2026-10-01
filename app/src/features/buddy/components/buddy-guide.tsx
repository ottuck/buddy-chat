import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

import { TOGETHER_EXP } from '../api';
import { type Frame, PixelSprite } from '../pixel/pixel-sprite';
import { bowl, PLANTS, PROP_PALETTE, RUG } from '../pixel/sprites';
import { type Reward, REWARDS } from './stage-decor';

// How the buddy grows and what comes with it (docs/product.md, 도움말): care, growth, the rewards
// every five levels, and going its own way. Opened from the chat header, settings, and once on
// arrival, so the goals are known from the start.

const REWARD_ICON: Record<Reward, Frame> = {
  plant1: PLANTS[1],
  bowl1: bowl(true, 1),
  plant2: PLANTS[2],
  rug: RUG,
  plant3: PLANTS[3],
  bowl2: bowl(true, 2),
};

export function rewardIcon(reward: Reward, size = 30) {
  const frame = REWARD_ICON[reward];
  const scale = Math.min(size / frame[0].length, size / frame.length);
  return <PixelSprite frame={frame} palette={PROP_PALETTE} scale={scale} />;
}

export function BuddyGuide() {
  const colors = useColors();
  const { t } = useTranslation();

  const section = (title: string, lines: string[]) => (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {lines.map((line) => (
        <Text
          key={line}
          lineBreakStrategyIOS="hangul-word"
          style={[styles.line, { color: colors.textMuted }]}
        >
          · {line}
        </Text>
      ))}
    </View>
  );

  return (
    <View style={styles.column}>
      {section(t('guide.care.title'), [
        t('guide.care.feed'),
        t('guide.care.clean'),
        t('guide.care.pet'),
      ])}
      {section(t('guide.grow.title'), [
        t('guide.grow.exp'),
        t('guide.grow.together', { exp: TOGETHER_EXP }),
        t('guide.grow.stages'),
      ])}

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('guide.rewards.title')}</Text>
        <Text lineBreakStrategyIOS="hangul-word" style={[styles.line, { color: colors.textMuted }]}>
          {t('guide.rewards.body')}
        </Text>
        {REWARDS.map(({ level, reward }) => (
          <View key={reward} style={styles.reward}>
            <View style={styles.icon}>{rewardIcon(reward)}</View>
            <Text style={[styles.level, { color: colors.accent }]}>Lv.{level}</Text>
            <Text style={[styles.rewardName, { color: colors.text }]}>
              {t(`buddy.reward.${reward}`)}
            </Text>
          </View>
        ))}
      </View>

      {section(t('guide.graduate.title'), [
        t('guide.graduate.top'),
        t('guide.graduate.album'),
        t('guide.graduate.keep'),
      ])}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  line: {
    fontSize: 14,
    lineHeight: 21,
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  level: {
    width: 44,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rewardName: {
    flex: 1,
    fontSize: 15,
  },
});
