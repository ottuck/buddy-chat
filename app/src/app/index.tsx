import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatHeader } from '@/features/chat/components/chat-header';
import { MessageComposer } from '@/features/chat/components/message-composer';
import { MessageList } from '@/features/chat/components/message-list';
import { BUDDY, ME, PARTNER } from '@/features/chat/mock';
import { useChat } from '@/features/chat/use-chat';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, send } = useChat();

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {/*
        The composer already pads for the home indicator, so the keyboard offset subtracts it.
        Expo Go has no react-native-keyboard-controller; switch to it once we use dev builds.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={-insets.bottom}
        style={styles.column}
      >
        <ChatHeader partnerName={PARTNER.displayName} online buddy={BUDDY} />
        <View style={styles.list}>
          <MessageList messages={messages} me={ME} members={[ME, PARTNER]} buddyName={BUDDY.name} />
        </View>
        <MessageComposer onSend={send} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  list: {
    flex: 1,
  },
});
