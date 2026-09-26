import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

type Props = {
  partnerName: string;
  online: boolean;
  buddy: { name: string; level: number; expProgress: number };
};

export function ChatHeader({ partnerName, online, buddy }: Props) {
  const colors = useColors();
  const { t } = useTranslation();

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
      </View>

      {/* Compact buddy status; opens the buddy detail later (docs/project-plan.md §32). */}
      <View style={[styles.buddyRow, { backgroundColor: colors.surface }]}>
        <Text style={styles.buddyAvatar}>🥚</Text>
        <Text style={[styles.buddyName, { color: colors.text }]} numberOfLines={1}>
          {buddy.name}
        </Text>
        <Text style={[styles.buddyLevel, { color: colors.textMuted }]}>
          {t('buddy.level', { level: buddy.level })}
        </Text>
        <View style={[styles.expTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.expFill,
              { backgroundColor: colors.accent, width: `${buddy.expProgress * 100}%` },
            ]}
          />
        </View>
      </View>
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
  buddyAvatar: {
    fontSize: 18,
  },
  buddyName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  buddyLevel: {
    fontSize: 12,
  },
  expTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  expFill: {
    height: '100%',
    borderRadius: 3,
  },
});
