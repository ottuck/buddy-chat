import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

type Props = {
  loading?: boolean;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

// Full-screen loading or error state.
export function StatusScreen({ loading, message, actionLabel, onAction }: Props) {
  const colors = useColors();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {message ? <Text style={[styles.message, { color: colors.text }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.buttonLabel, { color: colors.onAccent }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});
