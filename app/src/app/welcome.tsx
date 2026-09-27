import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { createRoom } from '@/features/room/api';
import { errorMessage } from '@/features/room/error-message';
import { useRoom } from '@/features/room/room-provider';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

const MAX_BUDDY_NAME = 12; // server: Buddy.MAX_NAME_LENGTH

// First screen after signing in without a room: name the egg and start solo, or join a friend
// (docs/product.md, 핵심 경험).
export default function WelcomeScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { setRoom } = useRoom();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setRoom(await createRoom(name.trim()));
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.column}
      >
        <View style={styles.hero}>
          <Text style={styles.egg}>🥚</Text>
          <Text style={[styles.title, { color: colors.text }]}>{t('welcome.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('welcome.subtitle')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('welcome.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_BUDDY_NAME}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && start()}
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          />
          {error ? <Text style={[styles.error, { color: colors.accent }]}>{error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Button label={t('welcome.startSolo')} onPress={start} disabled={busy || !name.trim()} />
          <Button
            label={t('welcome.haveCode')}
            onPress={() => router.push('/join')}
            disabled={busy}
            variant="secondary"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  egg: {
    fontSize: 72,
    lineHeight: 86,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
  input: {
    alignSelf: 'stretch',
    marginTop: 12,
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
  },
});
