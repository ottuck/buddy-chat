import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { runPosition, formatTime } from '../timeline';
import type { Member, Message } from '../types';
import { BuddyEventRow } from './buddy-event-row';
import { MessageBubble } from './message-bubble';

type Props = {
  messages: Message[]; // newest first
  me: Member;
  members: Member[];
  buddyName: string;
};

export function MessageList({ messages, me, members, buddyName }: Props) {
  const { t, i18n } = useTranslation();
  const nameOf = (id?: string) => members.find((member) => member.id === id)?.displayName ?? '';

  return (
    // Inverted: the newest message sits at the bottom and new ones stay in view.
    <FlatList
      inverted
      data={messages}
      keyExtractor={(message) => message.clientMessageId}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
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
              mine={item.senderId === me.id}
              time={showTime ? formatTime(item.createdAt, i18n.language) : undefined}
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
