import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

type Props = {
  text: string;
  mine: boolean;
  // Formatted time, shown only on the last message of a consecutive run.
  time?: string;
  status?: 'sending' | 'failed';
  onRetry?: () => void;
};

export function MessageBubble({ text, mine, time, status, onRetry }: Props) {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: colors.bubbleMine }
            : {
                backgroundColor: colors.bubbleTheirs,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
              },
          // Not confirmed by the server yet.
          status === 'sending' && styles.sending,
        ]}
      >
        <Text
          style={[styles.text, { color: mine ? colors.bubbleMineText : colors.bubbleTheirsText }]}
        >
          {text}
        </Text>
      </View>
      {status === 'failed' ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.failed, { color: colors.accent }]}>{t('chat.retry')}</Text>
        </Pressable>
      ) : time && status !== 'sending' ? (
        <Text style={[styles.time, { color: colors.textMuted }]}>{time}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 12,
  },
  rowMine: {
    flexDirection: 'row-reverse',
  },
  rowTheirs: {
    flexDirection: 'row',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  sending: {
    opacity: 0.55,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  time: {
    fontSize: 11,
    marginBottom: 2,
  },
  failed: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
});
