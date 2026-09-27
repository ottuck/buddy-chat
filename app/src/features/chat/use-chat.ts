import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { BuddyView } from '@/features/buddy/api';

import { fetchNewer, fetchNewest, fetchOlder } from './api';
import { ChatSocket, type ConnectionStatus } from './socket';
import { fromServer, type Message, type ServerMessage } from './types';

// Newest first, which is the order the inverted list renders. My unconfirmed messages have no
// server id yet and sit on top; the rest follow the server's order (ids increase over time).
function sortTimeline(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    if (!a.id || !b.id) return a.id ? 1 : b.id ? -1 : b.createdAt.localeCompare(a.createdAt);
    return b.id.localeCompare(a.id);
  });
}

// Adds or replaces by clientMessageId, so an ack replaces my pending copy and a message that
// arrives twice (socket and catch-up) shows once.
function merge(current: Message[], incoming: ServerMessage[]): Message[] {
  const byKey = new Map(current.map((m) => [m.clientMessageId, m]));
  for (const serverMessage of incoming) {
    const message = fromServer(serverMessage);
    if (message) byKey.set(message.clientMessageId, message);
  }
  return sortTimeline([...byKey.values()]);
}

type Options = {
  myId: string;
  // The server no longer knows this user's room (e.g. it changed on another device).
  onRoomLost: () => void;
  onMemberJoined: () => void;
  onBuddy: (buddy: BuddyView) => void;
};

export function useChat({ myId, onRoomLost, onMemberJoined, onBuddy }: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [hasOlder, setHasOlder] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const socketRef = useRef<ChatSocket | null>(null);
  const onRoomLostRef = useRef(onRoomLost);
  onRoomLostRef.current = onRoomLost;
  const onMemberJoinedRef = useRef(onMemberJoined);
  onMemberJoinedRef.current = onMemberJoined;
  const onBuddyRef = useRef(onBuddy);
  onBuddyRef.current = onBuddy;

  const apply = useCallback((incoming: ServerMessage[]) => {
    setMessages((prev) => merge(prev, incoming));
  }, []);

  const markStatus = useCallback((clientMessageId: string, status: 'sending' | 'failed') => {
    setMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === clientMessageId && m.type === 'TEXT' && !m.id ? { ...m, status } : m,
      ),
    );
  }, []);

  useEffect(() => {
    // Fetch what arrived while this device was away, then resend what never got an ack.
    const catchUp = async () => {
      let after = messagesRef.current.find((m) => m.id)?.id;
      if (!after) {
        const page = await fetchNewest();
        apply(page.messages);
        setHasOlder(page.hasMore);
      } else {
        for (;;) {
          const page = await fetchNewer(after);
          apply(page.messages);
          if (!page.hasMore || page.messages.length === 0) break;
          after = page.messages[0].id;
        }
      }
      for (const m of messagesRef.current) {
        if (m.type === 'TEXT' && !m.id && m.status === 'sending') {
          socketRef.current?.send(m.clientMessageId, m.text);
        }
      }
    };

    const socket = new ChatSocket({
      onStatus: setStatus,
      onReady: () => {
        catchUp().catch((e) => console.warn('catch-up failed', e));
      },
      onAck: (_clientMessageId, message) => apply([message]),
      onMessage: (message) => apply([message]),
      onSendFailed: (clientMessageId) => markStatus(clientMessageId, 'failed'),
      onMemberJoined: () => onMemberJoinedRef.current(),
      onBuddy: (buddy) => onBuddyRef.current(buddy),
      onFatal: () => onRoomLostRef.current(),
    });
    socketRef.current = socket;
    socket.start();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') socket.reconnectNow();
    });
    return () => {
      subscription.remove();
      socket.stop();
      socketRef.current = null;
    };
  }, [apply, markStatus]);

  const send = useCallback(
    (text: string) => {
      const clientMessageId = randomUUID();
      const pending: Message = {
        clientMessageId,
        type: 'TEXT',
        senderId: myId,
        text,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setMessages((prev) => sortTimeline([pending, ...prev]));
      // If offline it stays 'sending' and goes out after the next reconnect.
      socketRef.current?.send(clientMessageId, text);
    },
    [myId],
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const message = messagesRef.current.find((m) => m.clientMessageId === clientMessageId);
      if (message?.type !== 'TEXT') return;
      markStatus(clientMessageId, 'sending');
      socketRef.current?.send(clientMessageId, message.text);
    },
    [markStatus],
  );

  const loadingOlder = useRef(false);
  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.findLast((m) => m.id)?.id;
    if (!hasOlder || !oldest || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const page = await fetchOlder(oldest);
      apply(page.messages);
      setHasOlder(page.hasMore);
    } catch (e) {
      console.warn('loading older messages failed', e);
    } finally {
      loadingOlder.current = false;
    }
  }, [apply, hasOlder]);

  return { messages, status, send, retry, loadOlder };
}
