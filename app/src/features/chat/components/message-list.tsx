import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { formatTime, runPosition } from '../timeline';
import type { Member, Message } from '../types';
import { BuddyEventRow } from './buddy-event-row';
import { MessageBubble } from './message-bubble';

type Props = {
  messages: Message[]; // newest first
  myId: string;
  members: Member[];
  buddyName: string;
  // Newest message id the partner has read, if any.
  partnerReadId?: string;
  onRetry: (clientMessageId: string) => void;
  onLoadOlder: () => void;
};

export function MessageList({
  messages,
  myId,
  members,
  buddyName,
  partnerReadId,
  onRetry,
  onLoadOlder,
}: Props) {
  const { t, i18n } = useTranslation();
  const nameOf = (id?: string) =>
    members.find((member) => member.id === id)?.displayName ?? t('chat.guestName');
  // Only my newest read message says so; everything before it is read too.
  const lastRead = partnerReadId
    ? messages.find(
        (m) => m.type === 'TEXT' && m.senderId === myId && m.id && m.id <= partnerReadId,
      )
    : undefined;

  return (
    // Inverted: the newest message sits at the bottom and new ones stay in view. The list's
    // "end" is the top, so reaching it loads older history.
    <FlatList
      inverted
      data={messages}
      keyExtractor={(message) => message.clientMessageId}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      onEndReached={onLoadOlder}
      onEndReachedThreshold={0.5}
      renderItem={({ item, index }) => {
        if (item.type === 'BUDDY_EVENT') {
          return (
            <View style={styles.spaced}>
              <BuddyEventRow
                label={t(`buddyEvent.${item.event}`, {
                  buddy: buddyName,
                  actor: nameOf(item.actorId),
                })}
              />
            </View>
          );
        }
        const { continuesOlder, showTime } = runPosition(messages, index);
        return (
          <View style={continuesOlder ? styles.grouped : styles.spaced}>
            <MessageBubble
              text={item.text}
              mine={item.senderId === myId}
              time={showTime ? formatTime(item.createdAt, i18n.language) : undefined}
              status={item.status}
              receipt={item === lastRead ? t('chat.read') : undefined}
              onRetry={() => onRetry(item.clientMessageId)}
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 12,
  },
  spaced: {
    marginTop: 12,
  },
  grouped: {
    marginTop: 3,
  },
});
