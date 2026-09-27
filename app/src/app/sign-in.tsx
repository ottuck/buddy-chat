import { FirebaseError } from 'firebase/app';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageTitle } from '@/components/page-title';
import { Button } from '@/components/button';
import { isCancelledSignIn, signInAsGuest } from '@/features/auth/actions';
import { googleSignInSupported, signInWithGoogle } from '@/features/auth/google-sign-in';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

export default function SignInScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On success the auth listener swaps this screen out, so only failures need handling here.
  const run = async (signIn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      if (!isCancelledSignIn(e)) {
        console.warn(e);
        // In development, show the Firebase error code (e.g. a provider not enabled in the console).
        const code = __DEV__ && e instanceof FirebaseError ? ` (${e.code})` : '';
        setError(t('signIn.error') + code);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <PageTitle />
      <View style={styles.column}>
        <View style={styles.hero}>
          <Text style={styles.egg}>🥚</Text>
          <Text style={[styles.title, { color: colors.text }]}>buddy-chat</Text>
          <Text
            lineBreakStrategyIOS="hangul-word"
            style={[styles.tagline, { color: colors.textMuted }]}
          >
            {t('signIn.tagline')}
          </Text>
        </View>

        {/* Guest first: nothing stands between opening the app and meeting the buddy. An account
            can be linked later from settings, keeping everything (docs/product.md). */}
        <View style={styles.actions}>
          <Button label={t('signIn.startNow')} onPress={() => run(signInAsGuest)} disabled={busy} />
          {googleSignInSupported ? (
            <Button
              label={t('signIn.google')}
              onPress={() => run(signInWithGoogle)}
              disabled={busy}
              variant="secondary"
            />
          ) : null}
          <Text style={[styles.notice, { color: colors.textMuted }]}>
            {t('signIn.noAccountNeeded')}
          </Text>
          {busy ? <ActivityIndicator color={colors.accent} /> : null}
          {error ? <Text style={[styles.error, { color: colors.accent }]}>{error}</Text> : null}
        </View>
      </View>
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
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  egg: {
    fontSize: 72,
    lineHeight: 86,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  tagline: {
    fontSize: 15,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
  },
  notice: {
    fontSize: 13,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
  },
});
