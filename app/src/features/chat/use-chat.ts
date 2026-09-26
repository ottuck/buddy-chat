import { randomUUID } from 'expo-crypto';
import { useCallback, useState } from 'react';

import { ME, MOCK_MESSAGES } from './mock';
import type { Message } from './types';

// Local-only chat state until the WebSocket client exists. Messages are kept newest first,
// which is the order the inverted list renders.
export function useChat() {
  const [messages, setMessages] = useState<Message[]>(() => [...MOCK_MESSAGES].reverse());

  const send = useCallback((text: string) => {
    const clientMessageId = randomUUID();
    const message: Message = {
      id: clientMessageId,
      clientMessageId,
      type: 'TEXT',
      senderId: ME.id,
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [message, ...prev]);
  }, []);

  return { messages, send };
}
