import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

// Above the chat until opened or closed once on this device: what the buddy is about and that
// levels bring rewards, so there is something to look forward to from the first day.
const SEEN_KEY = 'buddy-guide-seen';

export function GuideBanner({ onOpen }: { onOpen: () => void }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => !cancelled && setShow(!seen))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const done = () => {
    setShow(false);
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
  };

  if (!show) return null;
  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
      <Pressable
        onPress={() => {
          done();
          onOpen();
        }}
        accessibilityRole="button"
        style={styles.body}
      >
        <Text style={[styles.title, { color: colors.text }]}>{t('guide.banner.title')}</Text>
        <Text lineBreakStrategyIOS="hangul-word" style={[styles.text, { color: colors.textMuted }]}>
          {t('guide.banner.body')}
        </Text>
        <Text style={[styles.action, { color: colors.accent }]}>{t('guide.banner.open')}</Text>
      </Pressable>
      <Pressable
        onPress={done}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={10}
      >
        <Text style={[styles.close, { color: colors.textMuted }]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  close: {
    fontSize: 14,
  },
});
