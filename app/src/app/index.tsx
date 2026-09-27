import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageTitle } from '@/components/page-title';
import { BuddySheet } from '@/features/buddy/components/buddy-sheet';
import { useBuddy } from '@/features/buddy/use-buddy';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { MessageComposer } from '@/features/chat/components/message-composer';
import { EmptyChat } from '@/features/chat/components/empty-chat';
import { MessageList } from '@/features/chat/components/message-list';
import { useChat } from '@/features/chat/use-chat';
import { registerForPush } from '@/features/notifications/push';
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
      onMembersChanged={refreshRoom}
    />
  );
}

type ChatScreenProps = {
  me: Me;
  room: Room;
  onRoomLost: () => void;
  onMembersChanged: () => void;
};

function ChatScreen({ me, room, onRoomLost, onMembersChanged }: ChatScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { buddy, busy, setBuddy, feed, clean } = useBuddy(room.buddy);
  const chat = useChat({ myId: me.id, onRoomLost, onMembersChanged, onBuddy: setBuddy });
  const { messages, status, online, typing, reads, unreadWhileAway } = chat;
  const [buddyOpen, setBuddyOpen] = useState(false);

  // Asked here rather than at launch: by now the user knows what the app is for.
  useEffect(() => {
    registerForPush().catch((e) => console.warn('push registration failed', e));
  }, []);
  const [inviteOpen, setInviteOpen] = useState(false);
  const partner = room.members.find((member) => member.id !== me.id);

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Web has no push notifications: a hidden tab counts new messages in its title instead. */}
      <PageTitle count={unreadWhileAway} />
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
          partnerOnline={partner ? online.includes(partner.id) : false}
          partnerTyping={partner ? typing.includes(partner.id) : false}
          connected={status === 'online'}
          buddy={buddy}
          onPressBuddy={() => setBuddyOpen(true)}
          onPressInvite={() => setInviteOpen(true)}
          onPressSettings={() => router.push('/settings')}
        />
        <View style={styles.list}>
          {chat.loaded && messages.length === 0 ? (
            <EmptyChat
              buddyName={buddy.name}
              stage={buddy.stage}
              partnerName={partner ? (partner.displayName ?? '') : null}
              onInvite={() => setInviteOpen(true)}
            />
          ) : (
            <MessageList
              messages={messages}
              myId={me.id}
              members={room.members}
              buddyName={buddy.name}
              partnerReadId={partner ? reads[partner.id] : undefined}
              onRetry={chat.retry}
              onLoadOlder={chat.loadOlder}
            />
          )}
        </View>
        <MessageComposer onSend={chat.send} onTyping={chat.notifyTyping} />
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
