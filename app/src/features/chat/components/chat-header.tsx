import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

type Props = {
  // null in a solo room: an invite button takes the partner's place.
  partnerName: string | null;
  partnerOnline: boolean;
  partnerTyping: boolean;
  connected: boolean;
  onPressInvite: () => void;
  onPressSettings: () => void;
};

export function ChatHeader({
  partnerName,
  partnerOnline,
  partnerTyping,
  connected,
  onPressInvite,
  onPressSettings,
}: Props) {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <View style={styles.partnerRow}>
        {partnerName !== null ? (
          <>
            <View
              accessibilityLabel={t(partnerOnline ? 'chat.online' : 'chat.offline')}
              style={[
                styles.presence,
                { backgroundColor: partnerOnline ? colors.online : colors.border },
              ]}
            />
            <Text style={[styles.partnerName, { color: colors.text }]} numberOfLines={1}>
              {partnerName}
            </Text>
            {partnerTyping ? (
              <Text style={[styles.typing, { color: colors.textMuted }]}>{t('chat.typing')}</Text>
            ) : null}
          </>
        ) : (
          <Pressable
            onPress={onPressInvite}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.inviteButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.inviteLabel, { color: colors.onAccent }]}>
              {t('invite.button')}
            </Text>
          </Pressable>
        )}
        {/* Our own connection to the server. Without it the partner's presence is unknown. */}
        {!connected ? (
          <Text style={[styles.connecting, { color: colors.textMuted }]}>
            {t('chat.connecting')}
          </Text>
        ) : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  presence: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typing: {
    fontSize: 12,
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
  inviteButton: {
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
  },
  inviteLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  connecting: {
    fontSize: 12,
  },
});
