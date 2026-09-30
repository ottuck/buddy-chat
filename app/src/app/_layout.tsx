import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n, { detectLanguage } from '@/i18n';
import { StatusScreen } from '@/components/status-screen';
import { WebFrame } from '@/components/web-frame';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { RoomProvider, useRoom } from '@/features/room/room-provider';
import { loadPreferences, usePreferences } from '@/lib/preferences';
import { rememberInviteFromUrl, takePendingInvite } from '@/lib/pending-invite';
import { warmUpServer } from '@/lib/warm-up';
import { useColorMode } from '@/theme';

// Keep the splash screen up until we know where the user belongs (signed out, no room yet, or
// their room), so no screen flashes by on launch.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorMode();
  const { language } = usePreferences();

  // Wake the server (it may have scaled to zero) before the first real request needs it.
  useEffect(() => {
    warmUpServer();
    loadPreferences();
    // A friend's invite link (join?code=…) may arrive before the friend has signed in.
    rememberInviteFromUrl();
  }, []);

  // The language chosen in settings, or the device's.
  useEffect(() => {
    const next = language === 'system' ? detectLanguage() : language;
    if (i18n.language !== next) i18n.changeLanguage(next);
  }, [language]);

  // Web: the page around the app (background, frame) follows the chosen mode too (app/+html.tsx).
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.dataset.theme = colorScheme;
  }, [colorScheme]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RoomProvider>
            <WebFrame>
              <RootNavigator />
            </WebFrame>
          </RoomProvider>
        </AuthProvider>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { user, initializing } = useAuth();
  const { state, reload } = useRoom();
  const { t, i18n } = useTranslation();
  const signedIn = !!user;
  const settled = !initializing && (!signedIn || state.status !== 'loading');
  const pathname = usePathname();
  const canJoin =
    signedIn && (state.status === 'none' || state.status === 'ready') && !!state.me.displayName;

  // Signed in with a name now: on to the invite that brought them here, code filled in.
  // Waits for where they land after naming (welcome or the chat): going earlier, the name screen's
  // own navigation would cover the join screen.
  useEffect(() => {
    if (!canJoin || (pathname !== '/welcome' && pathname !== '/')) return;
    const code = takePendingInvite();
    if (!code) return;
    const timer = setTimeout(() => router.push({ pathname: '/join', params: { code } }), 0);
    return () => clearTimeout(timer);
  }, [canJoin, pathname]);

  useEffect(() => {
    if (settled) SplashScreen.hideAsync();
  }, [settled]);

  // Web: the page is rendered at build time in English; tell the browser the language in use.
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  if (initializing) return null;
  if (signedIn && state.status === 'loading') return <StatusScreen loading />;
  if (signedIn && state.status === 'error') {
    return (
      <StatusScreen
        message={t('errors.loadFailed')}
        actionLabel={t('common.retry')}
        onAction={reload}
      />
    );
  }

  const me = state.status === 'none' || state.status === 'ready' ? state.me : null;
  // Guests start without a name; they pick one before anything else (the friend sees it).
  const named = !!me?.displayName;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn && state.status === 'ready' && named}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="settings"
          options={{ headerShown: true, title: t('settings.title'), headerBackTitle: '' }}
        />
        <Stack.Screen
          name="guide"
          options={{ headerShown: true, title: t('guide.title'), headerBackTitle: '' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && state.status === 'none' && named}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Protected guard={!!me}>
        <Stack.Screen name="name" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && named}>
        <Stack.Screen
          name="join"
          options={{
            headerShown: true,
            title: t('join.title'),
            headerBackTitle: '',
            presentation: 'modal',
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="demo" />
      </Stack.Protected>
    </Stack>
  );
}
