import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { WebFrame } from '@/components/web-frame';
import type { AlbumEntry } from '@/features/room/api';
import { errorMessage } from '@/features/room/error-message';
import { confirm } from '@/lib/confirm';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

import type { BuddyView } from '../api';
import { BuddyAvatar } from './buddy-avatar';
import { rewardIcon } from './buddy-guide';
import { nextReward } from './stage-decor';

const MAX_POOPS = 3; // server: BuddyRules.MAX_POOPS

type Props = {
  visible: boolean;
  buddy: BuddyView;
  // A care request is in flight.
  busy: boolean;
  onClose: () => void;
  onFeed: () => void;
  onClean: () => void;
  // Buddies gone their own way; none in the tour.
  album?: AlbumEntry[];
  // At the top level: the buddy goes into the album and a new egg with this name arrives.
  onGraduate?: (newName: string) => Promise<void>;
};

const MAX_NAME_LENGTH = 12; // server: Buddy.MAX_NAME_LENGTH

// Buddy detail: stats, the two care actions, going its own way once grown, and the album
// (docs/product.md). A native page sheet on iOS, so it can be swiped down.
export function BuddySheet({
  visible,
  buddy,
  busy,
  onClose,
  onFeed,
  onClean,
  album,
  onGraduate,
}: Props) {
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
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.column, { paddingBottom: 16 + insets.bottom }]}
          >
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

            <NextReward level={buddy.level} album={album ?? []} />

            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('buddy.growthHint')}</Text>

            {buddy.grown && onGraduate ? (
              <GraduateCard buddyName={buddy.name} onGraduate={onGraduate} />
            ) : null}
            {album && album.length > 0 ? <AlbumCard album={album} /> : null}
          </ScrollView>
        </View>
      </WebFrame>
    </Modal>
  );
}

// Something to look forward to: the next reward and how far it is.
function NextReward({ level, album }: { level: number; album: AlbumEntry[] }) {
  const colors = useColors();
  const { t } = useTranslation();
  const next = nextReward(level, album);
  if (!next) return null;
  return (
    <View style={[styles.card, styles.nextReward, { backgroundColor: colors.surface }]}>
      {rewardIcon(next.reward)}
      <Text style={[styles.body, styles.nextText, { color: colors.text }]}>
        {t('buddy.nextReward', {
          level: next.level,
          reward: t(`buddy.reward.${next.reward}`),
          count: next.level - level,
        })}
      </Text>
    </View>
  );
}

function GraduateCard({
  buddyName,
  onGraduate,
}: {
  buddyName: string;
  onGraduate: (newName: string) => Promise<void>;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newName = name.trim();

  const graduate = async () => {
    const ok = await confirm({
      title: t('buddy.graduate.confirmTitle', { buddy: buddyName }),
      message: t('buddy.graduate.confirmMessage', { buddy: buddyName, name: newName }),
      confirmLabel: t('buddy.graduate.confirm'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await onGraduate(newName);
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        🎓 {t('buddy.graduate.title')}
      </Text>
      <Text lineBreakStrategyIOS="hangul-word" style={[styles.body, { color: colors.textMuted }]}>
        {t('buddy.graduate.body', { buddy: buddyName })}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('buddy.graduate.namePlaceholder')}
        placeholderTextColor={colors.textMuted}
        maxLength={MAX_NAME_LENGTH}
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        ]}
      />
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Pressable
          onPress={graduate}
          disabled={!newName}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.careButton,
            { backgroundColor: colors.accent, opacity: !newName ? 0.4 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.careLabel, { color: colors.onAccent }]}>
            {t('buddy.graduate.button')}
          </Text>
        </Pressable>
      )}
      {error ? <Text style={[styles.body, { color: colors.accent }]}>{error}</Text> : null}
    </View>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Newest first: the one who just left is on top.
function AlbumCard({ album }: { album: AlbumEntry[] }) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' });
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>📖 {t('buddy.album.title')}</Text>
      {[...album].reverse().map((entry) => {
        const born = new Date(entry.bornAt);
        const left = new Date(entry.graduatedAt);
        const days = Math.max(1, Math.ceil((left.getTime() - born.getTime()) / DAY_MS));
        return (
          <View key={entry.graduatedAt} style={styles.albumRow}>
            <View style={[styles.portrait, { borderColor: colors.border }]}>
              <BuddyAvatar stage="ADULT" size={36} />
            </View>
            <View style={styles.albumText}>
              <Text style={[styles.statLabel, { color: colors.text }]}>{entry.name}</Text>
              <Text style={[styles.statValue, { color: colors.textMuted }]}>
                {t('buddy.album.together', {
                  from: date.format(born),
                  to: date.format(left),
                  count: days,
                })}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
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
  scroll: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  column: {
    paddingHorizontal: 20,
    gap: 20,
  },
  nextReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  portrait: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
  },
  albumText: {
    flex: 1,
    gap: 2,
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
