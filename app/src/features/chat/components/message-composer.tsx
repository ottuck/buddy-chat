import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/theme';

// Web textareas start at two rows. RN types lack `rows`, and numberOfLines would cap the
// growing input on iOS, so it is set for web only.
const webSingleRow = Platform.OS === 'web' ? { rows: 1 } : {};

type Props = {
  onSend: (text: string) => void;
  // Called on every change with whether there is something typed (drives "typing…").
  onTyping: (hasDraft: boolean) => void;
};

export function MessageComposer({ onSend, onTyping }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const canSend = draft.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: colors.border,
          backgroundColor: colors.background,
          paddingBottom: 8 + insets.bottom,
        },
      ]}
    >
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          onTyping(text.trim().length > 0);
        }}
        placeholder={t('chat.composerPlaceholder')}
        placeholderTextColor={colors.textMuted}
        multiline
        {...webSingleRow}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            // Focus shows as the accent border (the web's default outline was a thick black ring).
            borderColor: focused ? colors.accent : colors.border,
          },
        ]}
        onKeyPress={(event) => {
          // Web: Enter sends, Shift+Enter adds a line. On phones the return key adds a line.
          // The Enter that confirms Japanese/Korean IME input must not send.
          // (Safari reports composition only through keyCode 229.)
          const { key, shiftKey, isComposing, keyCode } = event.nativeEvent as {
            key: string;
            shiftKey?: boolean;
            isComposing?: boolean;
            keyCode?: number;
          };
          const composing = isComposing || keyCode === 229;
          if (Platform.OS === 'web' && key === 'Enter' && !shiftKey && !composing) {
            event.preventDefault();
            send();
          }
        }}
      />
      <Pressable
        onPress={send}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel={t('chat.send')}
        style={({ pressed }) => [
          styles.sendButton,
          { backgroundColor: colors.accent, opacity: !canSend ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.sendIcon, { color: colors.onAccent }]}>↑</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    // A fixed line height: with "normal", a single line overflowed the box by a pixel on the web
    // and showed a scrollbar.
    lineHeight: 20,
    outlineWidth: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
});
