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
  // Absent in the tour, which has no settings.
  onPressSettings?: () => void;
  // How to raise the buddy (the guide).
  onPressHelp?: () => void;
};

export function ChatHeader({
  partnerName,
  partnerOnline,
  partnerTyping,
  connected,
  onPressInvite,
  onPressSettings,
  onPressHelp,
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
        {onPressHelp ? (
          <Pressable
            onPress={onPressHelp}
            accessibilityRole="button"
            accessibilityLabel={t('guide.title')}
            hitSlop={12}
            style={styles.settingsButton}
          >
            <Text style={[styles.help, { color: colors.textMuted, borderColor: colors.textMuted }]}>
              ?
            </Text>
          </Pressable>
        ) : null}
        {onPressSettings ? (
          <Pressable
            onPress={onPressSettings}
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            hitSlop={12}
            style={onPressHelp ? styles.nextToHelp : styles.settingsButton}
          >
            <Text style={[styles.settingsIcon, { color: colors.textMuted }]}>⚙︎</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  help: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },
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
  // The "?" takes the push to the right; settings sits beside it.
  nextToHelp: {
    marginLeft: 16,
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
