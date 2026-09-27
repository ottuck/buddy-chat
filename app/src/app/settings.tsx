import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { signOut } from '@/features/auth/actions';
import { useAuth } from '@/features/auth/auth-provider';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

// Minimal settings for now: who is signed in, and sign out (docs/product.md, MVP 범위).
export default function SettingsScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const { user } = useAuth();
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

const styles = StyleSheet.create({
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
