import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { WebFrame } from '@/components/web-frame';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

import type { BuddyView } from '../api';
import { BuddyAvatar } from './buddy-avatar';

const MAX_POOPS = 3; // server: BuddyRules.MAX_POOPS

type Props = {
  visible: boolean;
  buddy: BuddyView;
  // A care request is in flight.
  busy: boolean;
  onClose: () => void;
  onFeed: () => void;
  onClean: () => void;
};

// Buddy detail: stats and the two care actions (docs/product.md). A native page sheet on
// iOS, so it can be swiped down.
export function BuddySheet({ visible, buddy, busy, onClose, onFeed, onClean }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Web shows the sheet in the same frame as the app (components/web-frame.web.tsx). */}
      <WebFrame>
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          <View style={[styles.column, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.topBar}>
              <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
                <Text style={[styles.close, { color: colors.accent }]}>{t('common.close')}</Text>
              </Pressable>
            </View>

            <View style={styles.hero}>
              <BuddyAvatar stage={buddy.stage} size={96} />
              <Text style={[styles.name, { color: colors.text }]}>{buddy.name}</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                {t(`buddy.stage.${buddy.stage}`)} · {t('buddy.level', { level: buddy.level })}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Stat
                label={t('buddy.exp')}
                value={`${Math.round(buddy.levelProgress * 100)}%`}
                progress={buddy.levelProgress}
              />
              <Stat
                label={t('buddy.fullness')}
                value={
                  buddy.hungry
                    ? t('buddy.hungry')
                    : buddy.canFeed
                      ? t('buddy.peckish')
                      : t('buddy.full')
                }
                progress={buddy.fullness / 100}
                color={colors.fullness}
              />
              <Stat
                label={t('buddy.cleanliness')}
                value={buddy.poops > 0 ? '💩'.repeat(buddy.poops) : t('buddy.clean')}
                progress={1 - buddy.poops / MAX_POOPS}
                color={colors.cleanliness}
              />
            </View>

            <View style={styles.actions}>
              <CareButton
                label={t('buddy.feed')}
                emoji="🍚"
                onPress={onFeed}
                disabled={busy || !buddy.canFeed}
              />
              <CareButton
                label={t('buddy.cleanUp')}
                emoji="🧹"
                onPress={onClean}
                disabled={busy || !buddy.canClean}
              />
            </View>

            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('buddy.growthHint')}</Text>
          </View>
        </View>
      </WebFrame>
    </Modal>
  );
}

function Stat(props: { label: string; value: string; progress: number; color?: string }) {
  const colors = useColors();
  return (
    <View style={styles.stat}>
      <View style={styles.statHeader}>
        <Text style={[styles.statLabel, { color: colors.text }]}>{props.label}</Text>
        <Text style={[styles.statValue, { color: colors.textMuted }]}>{props.value}</Text>
      </View>
      <View style={styles.statBar}>
        <ProgressBar progress={props.progress} color={props.color} height={8} />
      </View>
    </View>
  );
}

function CareButton(props: {
  label: string;
  emoji: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.careButton,
        {
          backgroundColor: colors.accent,
          opacity: props.disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.careLabel, { color: colors.onAccent }]}>
        {props.emoji} {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    paddingHorizontal: 20,
    gap: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 16,
  },
  close: {
    fontSize: 16,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  stat: {
    gap: 6,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 13,
  },
  statBar: {
    flexDirection: 'row',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  careButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  careLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
  },
});
