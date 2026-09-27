import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddySheet } from '@/features/buddy/components/buddy-sheet';
import { useBuddy } from '@/features/buddy/use-buddy';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { MessageComposer } from '@/features/chat/components/message-composer';
import { MessageList } from '@/features/chat/components/message-list';
import { useChat } from '@/features/chat/use-chat';
import { InviteSheet } from '@/features/room/components/invite-sheet';
import type { Me, Room } from '@/features/room/api';
import { useReadyRoom } from '@/features/room/room-provider';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

export default function ChatRoute() {
  const { me, room, reload, refreshRoom } = useReadyRoom();
  // Keyed by room: joining another room starts over with a new connection and timeline.
  return (
    <ChatScreen
      key={room.id}
      me={me}
      room={room}
      onRoomLost={reload}
      onMemberJoined={refreshRoom}
    />
  );
}

type ChatScreenProps = {
  me: Me;
  room: Room;
  onRoomLost: () => void;
  onMemberJoined: () => void;
};

function ChatScreen({ me, room, onRoomLost, onMemberJoined }: ChatScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { buddy, busy, setBuddy, feed, clean } = useBuddy(room.buddy);
  const { messages, status, send, retry, loadOlder } = useChat({
    myId: me.id,
    onRoomLost,
    onMemberJoined,
    onBuddy: setBuddy,
  });
  const [buddyOpen, setBuddyOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const partner = room.members.find((member) => member.id !== me.id);

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
          partnerName={partner ? (partner.displayName ?? '') : null}
          connected={status === 'online'}
          buddy={buddy}
          onPressBuddy={() => setBuddyOpen(true)}
          onPressInvite={() => setInviteOpen(true)}
          onPressSettings={() => router.push('/settings')}
        />
        <View style={styles.list}>
          <MessageList
            messages={messages}
            myId={me.id}
            members={room.members}
            buddyName={buddy.name}
            onRetry={retry}
            onLoadOlder={loadOlder}
          />
        </View>
        <MessageComposer onSend={send} />
      </KeyboardAvoidingView>

      <BuddySheet
        visible={buddyOpen}
        buddy={buddy}
        busy={busy}
        onClose={() => setBuddyOpen(false)}
        onFeed={feed}
        onClean={clean}
      />
      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} />
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
