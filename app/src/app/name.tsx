import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PageTitle } from '@/components/page-title';
import { MAX_DISPLAY_NAME, updateMyName } from '@/features/room/api';
import { errorMessage } from '@/features/room/error-message';
import { useRoom } from '@/features/room/room-provider';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

// The name the friend sees. Guests land here first, since they have none (the route guards in
// _layout.tsx); anyone can come back from settings to change it.
export default function NameScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { state, setMe, refreshRoom } = useRoom();
  const me = state.status === 'none' || state.status === 'ready' ? state.me : null;
  // Changing an existing name (from settings) goes back when done; first-time naming moves on.
  const [editing] = useState(() => !!me?.displayName);
  const [name, setName] = useState(me?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      setMe(await updateMyName(name.trim()));
      // The room lists members by name too.
      if (state.status === 'ready') await refreshRoom();
      if (editing) router.back();
      else router.replace(state.status === 'ready' ? '/' : '/welcome');
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <PageTitle title={t('name.title')} />
      {/* A back button only when coming from settings; first-time naming has nowhere to go back to. */}
      <Stack.Screen options={{ headerShown: editing, title: '', headerBackTitle: '' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.column}
      >
        <View style={styles.hero}>
          <Text style={styles.wave}>👋</Text>
          <Text style={[styles.title, { color: colors.text }]}>{t('name.title')}</Text>
          <Text
            lineBreakStrategyIOS="hangul-word"
            style={[styles.subtitle, { color: colors.textMuted }]}
          >
            {t('name.subtitle')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('name.placeholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_DISPLAY_NAME}
            autoFocus
            autoComplete="nickname"
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && save()}
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          />
          {error ? <Text style={[styles.error, { color: colors.accent }]}>{error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Button
            label={editing ? t('name.save') : t('name.next')}
            onPress={save}
            disabled={busy || !name.trim()}
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
  wave: {
    fontSize: 64,
    lineHeight: 78,
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
