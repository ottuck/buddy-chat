import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddySheet } from '@/features/buddy/components/buddy-sheet';
import { useBuddy } from '@/features/buddy/use-buddy';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { MessageComposer } from '@/features/chat/components/message-composer';
import { MessageList } from '@/features/chat/components/message-list';
import { ME, PARTNER } from '@/features/chat/mock';
import { useChat } from '@/features/chat/use-chat';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, send, addBuddyEvent } = useChat();
  const { buddy, feed, clean } = useBuddy();
  const [buddyOpen, setBuddyOpen] = useState(false);

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
        <ChatHeader
          partnerName={PARTNER.displayName}
          online
          buddy={buddy}
          onPressBuddy={() => setBuddyOpen(true)}
          onPressSettings={() => router.push('/settings')}
        />
        <View style={styles.list}>
          <MessageList messages={messages} me={ME} members={[ME, PARTNER]} buddyName={buddy.name} />
        </View>
        <MessageComposer onSend={send} />
      </KeyboardAvoidingView>

      <BuddySheet
        visible={buddyOpen}
        buddy={buddy}
        onClose={() => setBuddyOpen(false)}
        onFeed={() => feed() && addBuddyEvent('FED', ME.id)}
        onClean={() => clean() && addBuddyEvent('CLEANED', ME.id)}
      />
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
