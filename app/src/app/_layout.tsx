import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/i18n';
import { StatusScreen } from '@/components/status-screen';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { RoomProvider, useRoom } from '@/features/room/room-provider';

// Keep the splash screen up until we know where the user belongs (signed out, no room yet, or
// their room), so no screen flashes by on launch.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RoomProvider>
            <RootNavigator />
          </RoomProvider>
        </AuthProvider>
        <StatusBar style="auto" />
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn && state.status === 'ready'}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="settings"
          options={{ headerShown: true, title: t('settings.title'), headerBackTitle: '' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && state.status === 'none'}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
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
      </Stack.Protected>
    </Stack>
  );
}
