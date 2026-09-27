import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme';

type Props = {
  progress: number; // 0..1
  color?: string;
  height?: number;
};

export function ProgressBar({ progress, color, height = 6 }: Props) {
  const colors = useColors();
  const clamped = Math.min(Math.max(progress, 0), 1);

  return (
    <View
      style={[styles.track, { backgroundColor: colors.border, height, borderRadius: height / 2 }]}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color ?? colors.accent,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    overflow: 'hidden',
  },
});
