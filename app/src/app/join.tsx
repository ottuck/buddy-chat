import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PageTitle } from '@/components/page-title';
import { Button } from '@/components/button';
import { acceptInvitation } from '@/features/room/api';
import { errorMessage } from '@/features/room/error-message';
import { useRoom } from '@/features/room/room-provider';
import { ApiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

const CODE_LENGTH = 8;

// Join a friend's room with their invite code. Someone who already has a solo room is asked to
// confirm first: that room and its buddy go away (docs/server-design.md, Room·초대 규칙).
export default function JoinScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { setRoom } = useRoom();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      let room;
      try {
        room = await acceptInvitation(code, false);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'LEAVE_CONFIRMATION_REQUIRED')) throw e;
        const ok = await confirm({
          title: t('join.leaveTitle'),
          message: t('join.leaveMessage'),
          confirmLabel: t('join.leaveConfirm'),
          cancelLabel: t('common.cancel'),
          destructive: true,
        });
        if (!ok) {
          setBusy(false);
          return;
        }
        room = await acceptInvitation(code, true);
      }
      setRoom(room);
      router.dismissTo('/');
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <PageTitle title={t('join.title')} />
      <View style={styles.column}>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('join.hint')}</Text>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ABCD2345"
          placeholderTextColor={colors.border}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          returnKeyType="join"
          onSubmitEditing={() => code.length === CODE_LENGTH && join()}
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        />
        {error ? <Text style={[styles.error, { color: colors.accent }]}>{error}</Text> : null}
        <Button
          label={t('join.submit')}
          onPress={join}
          disabled={busy || code.length !== CODE_LENGTH}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    padding: 24,
    gap: 16,
  },
  hint: {
    fontSize: 15,
    textAlign: 'center',
  },
  input: {
    height: 60,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
  },
});
