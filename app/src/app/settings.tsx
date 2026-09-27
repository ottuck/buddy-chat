import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { signOut } from '@/features/auth/actions';
import { useAuth } from '@/features/auth/auth-provider';
import { leaveRoom, type Room } from '@/features/room/api';
import { errorMessage } from '@/features/room/error-message';
import { useRoom } from '@/features/room/room-provider';
import { confirm } from '@/lib/confirm';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

// Who is signed in, the room, and leaving or signing out (docs/product.md, MVP 범위).
export default function SettingsScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { state } = useRoom();
  const name = user?.displayName ?? (user?.isAnonymous ? t('settings.guest') : '');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.column}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.profile')}</Text>
          <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
          {user?.email ? (
            <Text style={[styles.email, { color: colors.textMuted }]}>{user.email}</Text>
          ) : null}
        </View>

        {state.status === 'ready' ? <RoomCard room={state.room} myId={state.me.id} /> : null}

        {/* For someone who started solo and got a friend's code later. */}
        <Pressable
          onPress={() => router.push('/join')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.row, { color: colors.text }]}>{t('settings.joinWithCode')}</Text>
        </Pressable>

        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.signOut, { color: colors.accent }]}>{t('settings.signOut')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function RoomCard({ room, myId }: { room: Room; myId: string }) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const { reload } = useRoom();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const partner = room.members.find((member) => member.id !== myId);
  const since = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(room.createdAt),
  );

  const leave = async () => {
    const ok = await confirm({
      title: t('settings.leaveTitle'),
      message: partner
        ? t('settings.leaveDuo', {
            buddy: room.buddy.name,
            partner: partner.displayName ?? t('chat.guestName'),
          })
        : t('settings.leaveSolo', { buddy: room.buddy.name }),
      confirmLabel: t('settings.leaveConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveRoom();
      // No room now: the route guards move on to the welcome screen.
      await reload();
    } catch (e) {
      setError(errorMessage(t, e));
      setLeaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.room')}</Text>
      <Text style={[styles.name, { color: colors.text }]}>{room.buddy.name}</Text>
      <Text style={[styles.email, { color: colors.textMuted }]}>
        {t('settings.since', { date: since })}
      </Text>
      <Text style={[styles.label, styles.section, { color: colors.textMuted }]}>
        {t('settings.members')}
      </Text>
      {room.members.map((member) => (
        <Text key={member.id} style={[styles.row, { color: colors.text }]}>
          {member.displayName ?? t('chat.guestName')}
        </Text>
      ))}
      <Pressable
        onPress={leave}
        disabled={leaving}
        accessibilityRole="button"
        style={({ pressed }) => [styles.leave, { opacity: pressed || leaving ? 0.6 : 1 }]}
      >
        {leaving ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={[styles.signOut, { color: colors.accent }]}>{t('settings.leave')}</Text>
        )}
      </Pressable>
      {error ? <Text style={[styles.email, { color: colors.accent }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
  },
  leave: {
    marginTop: 16,
    minHeight: 24,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 16,
  },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  label: {
    fontSize: 13,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
  },
  email: {
    fontSize: 14,
  },
  row: {
    fontSize: 16,
  },
  signOut: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
