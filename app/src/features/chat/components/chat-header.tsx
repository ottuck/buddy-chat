import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { BuddyAvatar } from '@/features/buddy/components/buddy-avatar';
import {
  type Buddy,
  canClean,
  canFeed,
  levelOf,
  levelProgress,
  stageOf,
} from '@/features/buddy/rules';
import { useColors } from '@/theme';

type Props = {
  partnerName: string;
  online: boolean;
  buddy: Buddy;
  onPressBuddy: () => void;
  onPressSettings: () => void;
};

export function ChatHeader({ partnerName, online, buddy, onPressBuddy, onPressSettings }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const level = levelOf(buddy.exp);

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <View style={styles.partnerRow}>
        <Text style={[styles.partnerName, { color: colors.text }]} numberOfLines={1}>
          {partnerName}
        </Text>
        <View
          style={[styles.presenceDot, { backgroundColor: online ? colors.online : colors.border }]}
          accessibilityLabel={online ? t('chat.online') : t('chat.offline')}
        />
        <Pressable
          onPress={onPressSettings}
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          hitSlop={12}
          style={styles.settingsButton}
        >
          <Text style={[styles.settingsIcon, { color: colors.textMuted }]}>⚙︎</Text>
        </Pressable>
      </View>

      {/* Compact buddy status; tapping opens the buddy detail (docs/project-plan.md §32). */}
      <Pressable
        onPress={onPressBuddy}
        accessibilityRole="button"
        accessibilityLabel={t('buddy.open', { buddy: buddy.name })}
        style={({ pressed }) => [
          styles.buddyRow,
          { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <BuddyAvatar stage={stageOf(level)} size={18} />
        <Text style={[styles.buddyName, { color: colors.text }]} numberOfLines={1}>
          {buddy.name}
        </Text>
        <Text style={[styles.buddyLevel, { color: colors.textMuted }]}>
          {t('buddy.level', { level })}
        </Text>
        <ProgressBar progress={levelProgress(buddy.exp)} />
        {canFeed(buddy) ? <Text style={styles.status}>🍚</Text> : null}
        {canClean(buddy) ? <Text style={styles.status}>💩</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  settingsButton: {
    marginLeft: 'auto',
  },
  settingsIcon: {
    fontSize: 20,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buddyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  buddyName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  buddyLevel: {
    fontSize: 12,
  },
  status: {
    fontSize: 14,
  },
});
