import { Pressable, StyleSheet, Text } from 'react-native';

import { useColors } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export function Button({ label, onPress, disabled, variant = 'primary' }: Props) {
  const colors = useColors();
  const secondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        secondary
          ? { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface }
          : { backgroundColor: colors.accent },
        { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: secondary ? colors.text : colors.onAccent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
