import { Pressable, StyleSheet, Text, View } from 'react-native';

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

// A timeline entry worth noticing, as a card: the top level reached (a thank-you from us, and what
// comes next) or the day's together bonus (docs/product.md).
export function EventCard({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text
          lineBreakStrategyIOS="hangul-word"
          style={[styles.cardBody, { color: colors.textMuted }]}
        >
          {body}
        </Text>
        {action && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.actionLabel, { color: colors.onAccent }]}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 340,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  action: {
    alignSelf: 'center',
    marginTop: 4,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
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
