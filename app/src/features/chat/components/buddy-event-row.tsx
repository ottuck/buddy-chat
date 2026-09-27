import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

// A buddy event shown in the timeline, e.g. "Mugi pooped 💩" (docs/product.md).
export function BuddyEventRow({ label }: { label: string }) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textMuted, backgroundColor: colors.surface }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
  },
});
