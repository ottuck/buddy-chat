import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { PageTitle } from '@/components/page-title';
import { deleteAccount, isCancelledSignIn, signOut, switchAccount } from '@/features/auth/actions';
import { useAuth } from '@/features/auth/auth-provider';
import { useGuestDaysLeft } from '@/features/auth/guest-expiry';
import {
  GoogleAccountInUseError,
  googleSignInSupported,
  linkGoogle,
  switchToGoogle,
} from '@/features/auth/google-sign-in';
import {
  pushEnabled,
  type PushState,
  pushSupported,
  setPushEnabled,
} from '@/features/notifications/push';
import { leaveRoom, type Room } from '@/features/room/api';
import { errorMessage } from '@/features/room/error-message';
import { useRoom } from '@/features/room/room-provider';
import { confirm } from '@/lib/confirm';
import { setLanguagePreference, setThemePreference, usePreferences } from '@/lib/preferences';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

// Who you are, your account, notifications, the room, and leaving, signing out or deleting the
// account (docs/product.md, MVP 범위).
export default function SettingsScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { state } = useRoom();
  const me = state.status === 'ready' ? state.me : null;
  const guest = !!user?.isAnonymous;
  const daysLeft = useGuestDaysLeft(user);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // A guest who signs out can never come back to this account; say so first.
  const onSignOut = async () => {
    if (guest) {
      const ok = await confirm({
        title: t('settings.guestSignOutTitle'),
        message: t('settings.guestSignOutMessage'),
        confirmLabel: t('settings.signOut'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    await signOut();
  };

  const onDelete = async () => {
    const room = state.status === 'ready' ? state.room : null;
    const partner = room?.members.find((member) => member.id !== me?.id);
    const ok = await confirm({
      title: t('settings.deleteTitle'),
      message: !room
        ? t('settings.deleteNoRoom')
        : partner
          ? t('settings.deleteDuo', {
              buddy: room.buddy.name,
              partner: partner.displayName ?? t('chat.guestName'),
            })
          : t('settings.deleteSolo', { buddy: room.buddy.name }),
      confirmLabel: t('settings.deleteConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Signed out at the end: the route guards move on to the sign-in screen.
      await deleteAccount();
    } catch (e) {
      if (!isCancelledSignIn(e)) {
        console.warn(e);
        setDeleteError(t('settings.deleteFailed'));
      }
      setDeleting(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <PageTitle title={t('settings.title')} />
      <View style={styles.column}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.profile')}</Text>
          <Text style={[styles.name, { color: colors.text }]}>{me?.displayName ?? ''}</Text>
          <Pressable
            onPress={() => router.push('/name')}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.linkLabel, { color: colors.accent }]}>
              {t('settings.changeName')}
            </Text>
          </Pressable>
        </View>

        <AccountCard guest={guest} daysLeft={daysLeft} email={user?.email ?? null} />

        <DisplayCard />

        {pushSupported ? <NotificationsCard /> : null}

        {state.status === 'ready' ? <RoomCard room={state.room} myId={state.me.id} /> : null}

        <Pressable
          onPress={() => router.push('/guide')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.row, { color: colors.text }]}>{t('guide.title')}</Text>
        </Pressable>

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
          onPress={onSignOut}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.signOut, { color: colors.accent }]}>{t('settings.signOut')}</Text>
        </Pressable>

        {/* Quiet, at the very end: needed, but not something to press by accident. */}
        <Pressable
          onPress={onDelete}
          disabled={deleting}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.delete, { opacity: pressed || deleting ? 0.6 : 1 }]}
        >
          {deleting ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <Text style={[styles.deleteLabel, { color: colors.textMuted }]}>
              {t('settings.deleteAccount')}
            </Text>
          )}
        </Pressable>
        {deleteError ? (
          <Text style={[styles.email, styles.centered, { color: colors.accent }]}>
            {deleteError}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

// Language and light or dark, for this device (lib/preferences).
function DisplayCard() {
  const colors = useColors();
  const { t } = useTranslation();
  const { theme, language } = usePreferences();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.display')}</Text>
      <Text style={[styles.row, styles.section, { color: colors.text }]}>
        {t('settings.language')}
      </Text>
      <Choices
        value={language}
        onChange={setLanguagePreference}
        options={[
          ['system', t('settings.followDevice')],
          // Each language in its own words.
          ['ko', '한국어'],
          ['ja', '日本語'],
          ['en', 'English'],
        ]}
      />
      <Text style={[styles.row, styles.section, { color: colors.text }]}>
        {t('settings.theme')}
      </Text>
      <Choices
        value={theme}
        onChange={setThemePreference}
        options={[
          ['system', t('settings.followDevice')],
          ['light', t('settings.light')],
          ['dark', t('settings.dark')],
        ]}
      />
    </View>
  );
}

function Choices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  const colors = useColors();
  return (
    <View style={styles.choices} accessibilityRole="radiogroup">
      {options.map(([option, label]) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.choice,
              {
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accent : 'transparent',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.choiceLabel, { color: selected ? colors.onAccent : colors.text }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Guests can keep everything by linking an account: the Firebase uid stays the same, so nothing
// moves on the server. Offered here rather than at the start, once there is something to keep.
function AccountCard({
  guest,
  daysLeft,
  email,
}: {
  guest: boolean;
  daysLeft: number | null;
  email: string | null;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = async () => {
    setBusy(true);
    setError(null);
    try {
      await linkGoogle();
    } catch (e) {
      if (e instanceof GoogleAccountInUseError) {
        const ok = await confirm({
          title: t('settings.accountInUseTitle'),
          message: t('settings.accountInUseMessage'),
          confirmLabel: t('settings.accountInUseConfirm'),
          cancelLabel: t('common.cancel'),
          destructive: true,
        });
        if (ok) {
          await switchAccount(() => switchToGoogle(e.credential)).catch((err) => {
            console.warn(err);
            setError(t('settings.linkFailed'));
          });
        }
      } else if (!isCancelledSignIn(e)) {
        console.warn(e);
        setError(t('settings.linkFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.account')}</Text>
      {guest ? (
        <>
          <Text style={[styles.name, { color: colors.text }]}>
            {t('settings.guestTitle')}
            {daysLeft !== null ? ` · ${t('guest.daysLeft', { count: daysLeft })}` : ''}
          </Text>
          <Text
            lineBreakStrategyIOS="hangul-word"
            style={[styles.email, { color: colors.textMuted }]}
          >
            {t('settings.guestBody')}
          </Text>
          {googleSignInSupported ? (
            <Pressable
              onPress={link}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.leave, { opacity: pressed || busy ? 0.6 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={[styles.signOut, { color: colors.accent }]}>
                  {t('settings.linkGoogle')}
                </Text>
              )}
            </Pressable>
          ) : (
            <Text style={[styles.email, styles.section, { color: colors.textMuted }]}>
              {t('settings.linkNotReady')}
            </Text>
          )}
          {error ? <Text style={[styles.email, { color: colors.accent }]}>{error}</Text> : null}
        </>
      ) : (
        <>
          <Text style={[styles.name, { color: colors.text }]}>{t('settings.linkedGoogle')}</Text>
          {email ? <Text style={[styles.email, { color: colors.textMuted }]}>{email}</Text> : null}
        </>
      )}
    </View>
  );
}

// New-message notifications for this device. Turning them off removes the device from the
// server, and a "no" to the system prompt can only be undone in the Settings app.
function NotificationsCard() {
  const colors = useColors();
  const { t } = useTranslation();
  const [state, setState] = useState<PushState | null>(null);

  useEffect(() => {
    let cancelled = false;
    pushEnabled()
      .then((enabled) => (enabled ? setPushEnabled(true) : ('off' as const)))
      .then((next) => !cancelled && setState(next))
      .catch((e) => {
        console.warn(e);
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (enabled: boolean) => {
    setState(enabled ? 'on' : 'off');
    setPushEnabled(enabled)
      .then(setState)
      .catch((e) => {
        console.warn(e);
        setState('unavailable');
      });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={[styles.row, { color: colors.text }]}>{t('settings.notifications')}</Text>
          <Text style={[styles.email, { color: colors.textMuted }]}>
            {t('settings.notificationsBody')}
          </Text>
        </View>
        <Switch
          value={state === 'on'}
          onValueChange={toggle}
          disabled={state === null || state === 'unavailable'}
          trackColor={{ true: colors.accent }}
          accessibilityLabel={t('settings.notifications')}
        />
      </View>
      {state === 'denied' ? (
        <>
          <Text style={[styles.email, styles.section, { color: colors.textMuted }]}>
            {t('settings.notificationsDenied')}
          </Text>
          <Pressable
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.linkLabel, { color: colors.accent }]}>
              {t('settings.openSettings')}
            </Text>
          </Pressable>
        </>
      ) : state === 'unavailable' ? (
        <Text style={[styles.email, styles.section, { color: colors.textMuted }]}>
          {t('settings.notificationsUnavailable')}
        </Text>
      ) : null}
    </View>
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
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  choice: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  choiceLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  link: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  linkLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  delete: {
    alignSelf: 'center',
    minHeight: 24,
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  centered: {
    textAlign: 'center',
  },
  signOut: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
