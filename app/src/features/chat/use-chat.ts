import { randomUUID } from 'expo-crypto';
import { useCallback, useState } from 'react';

import { ME, MOCK_MESSAGES } from './mock';
import type { BuddyEvent, BuddyEventMessage, Message, TextMessage } from './types';

type NewMessage =
  | Omit<TextMessage, 'id' | 'clientMessageId' | 'createdAt'>
  | Omit<BuddyEventMessage, 'id' | 'clientMessageId' | 'createdAt'>;

// Local-only chat state until the WebSocket client exists. Messages are kept newest first,
// which is the order the inverted list renders.
export function useChat() {
  const [messages, setMessages] = useState<Message[]>(() => [...MOCK_MESSAGES].reverse());

  const append = useCallback((message: NewMessage) => {
    const clientMessageId = randomUUID();
    const full = {
      ...message,
      id: clientMessageId,
      clientMessageId,
      createdAt: new Date().toISOString(),
    } as Message;
    setMessages((prev) => [full, ...prev]);
  }, []);

  const send = useCallback(
    (text: string) => append({ type: 'TEXT', senderId: ME.id, text }),
    [append],
  );

  const addBuddyEvent = useCallback(
    (event: BuddyEvent, actorId?: string) => append({ type: 'BUDDY_EVENT', event, actorId }),
    [append],
  );

  return { messages, send, addBuddyEvent };
}
