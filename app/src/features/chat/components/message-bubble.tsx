import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

type Props = {
  text: string;
  mine: boolean;
  // Formatted time, shown only on the last message of a consecutive run.
  time?: string;
};

export function MessageBubble({ text, mine, time }: Props) {
  const colors = useColors();

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
        ]}
      >
        <Text
          style={[styles.text, { color: mine ? colors.bubbleMineText : colors.bubbleTheirsText }]}
        >
          {text}
        </Text>
      </View>
      {time ? <Text style={[styles.time, { color: colors.textMuted }]}>{time}</Text> : null}
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
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  time: {
    fontSize: 11,
    marginBottom: 2,
  },
});
