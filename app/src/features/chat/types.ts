export type BuddyEvent = 'HUNGRY' | 'FED' | 'POOPED' | 'CLEANED' | 'EVOLVED';

// As the server sends it (server/src/main/java/com/buddychat/chat/Message.java).
export type ServerMessage = {
  id: string;
  roomId: string;
  senderId: string | null;
  type: 'TEXT' | 'SYSTEM' | 'BUDDY_EVENT';
  text: string | null;
  buddyEvent: BuddyEvent | null;
  actorId: string | null;
  clientMessageId: string;
  createdAt: string;
};

type MessageBase = {
  // Server id; absent while one of my messages is still on its way.
  id?: string;
  // Generated on the client so a retried send is stored only once (docs/server-design.md).
  clientMessageId: string;
  createdAt: string; // ISO 8601
};

export type TextMessage = MessageBase & {
  type: 'TEXT';
  senderId: string;
  text: string;
  // Only on my own messages that the server has not confirmed yet.
  status?: 'sending' | 'failed';
};

export type BuddyEventMessage = MessageBase & {
  type: 'BUDDY_EVENT';
  event: BuddyEvent;
  // Member who triggered the event (FED, CLEANED); absent for events the buddy causes itself.
  actorId?: string;
};

export type Message = TextMessage | BuddyEventMessage;

export type Member = {
  id: string;
  displayName: string | null;
};

// Maps a server message to the timeline's shape. SYSTEM messages are not produced yet.
export function fromServer(message: ServerMessage): Message | null {
  const base = {
    id: message.id,
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
  };
  if (message.type === 'TEXT' && message.senderId && message.text !== null) {
    return { ...base, type: 'TEXT', senderId: message.senderId, text: message.text };
  }
  if (message.type === 'BUDDY_EVENT' && message.buddyEvent) {
    return {
      ...base,
      type: 'BUDDY_EVENT',
      event: message.buddyEvent,
      actorId: message.actorId ?? undefined,
    };
  }
  return null;
}
