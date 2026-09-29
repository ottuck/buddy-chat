import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

// What the buddy says, next to its head (docs/product.md, Buddy 무대). Drawn like the pixel art:
// square corners, a thick outline, a small tail toward the buddy. `side` is where it sits from the
// head, away from the nearer edge of the stage.
export function SpeechBubble({
  text,
  side,
  above,
}: {
  text: string;
  side: 'left' | 'right';
  // Distance from the bottom of the buddy to the bubble's bottom.
  above: number;
}) {
  const colors = useColors();
  return (
    <View
      style={[styles.bubble, side === 'right' ? styles.right : styles.left, { bottom: above }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.box, { backgroundColor: colors.surface }]}>
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
          {text}
        </Text>
      </View>
      <View
        style={[
          styles.tail,
          side === 'right' ? styles.tailRight : styles.tailLeft,
          { backgroundColor: colors.surface },
        ]}
      />
    </View>
  );
}

const OUTLINE = '#3A2E2A';

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    maxWidth: 170,
    pointerEvents: 'none',
  },
  // Beside the head, clear of the sprout on top.
  right: {
    left: '82%',
  },
  left: {
    right: '82%',
    alignItems: 'flex-end',
  },
  box: {
    borderWidth: 2,
    borderColor: OUTLINE,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  tail: {
    width: 8,
    height: 8,
    marginTop: -5,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: OUTLINE,
    transform: [{ rotate: '45deg' }],
  },
  tailRight: {
    marginLeft: 8,
  },
  tailLeft: {
    marginRight: 8,
  },
});
