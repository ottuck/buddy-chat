import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useColors } from '@/theme';

// Shown above the chat in a guest's last week (docs/product.md, 게스트 우선). A quiet row rather
// than a dialog: the chat stays usable, and the last three days only get a stronger color.
const SHOW_FROM_DAYS = 7;
const URGENT_FROM_DAYS = 3;

export function GuestExpiryBanner({
  daysLeft,
  onPress,
}: {
  daysLeft: number | null;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  if (daysLeft === null || daysLeft > SHOW_FROM_DAYS) return null;
  const urgent = daysLeft <= URGENT_FROM_DAYS;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: urgent ? colors.accent : colors.surface, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.text, { color: urgent ? colors.onAccent : colors.text }]}>
        {t('guest.expiring', { count: daysLeft })}
      </Text>
      <Text style={[styles.action, { color: urgent ? colors.onAccent : colors.accent }]}>
        {t('guest.link')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  text: {
    flexShrink: 1,
    fontSize: 14,
  },
  action: {
    fontSize: 14,
    fontWeight: '700',
  },
});
