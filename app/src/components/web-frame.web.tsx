import { type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

// On a wide browser window the app sits in a phone-sized frame on a quieter backdrop, so it reads
// as one app screen instead of a column lost in the page (docs/product.md, 플랫폼). Narrow
// windows (phones) get the app edge to edge. The frame itself is CSS in app/+html.tsx, keyed by
// these ids: a media query needs no window size in JavaScript, so the page rendered at build time
// already has it, and resizing the window never remounts the app.
export function WebFrame({ children }: PropsWithChildren) {
  return (
    <View nativeID="web-backdrop" style={styles.fill}>
      <View nativeID="web-frame" style={styles.fill}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
