import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { BuddyView } from '@/features/buddy/api';
import { type Reaction, reactionTo } from '@/features/buddy/reactions';

import { fetchNewer, fetchNewest, fetchOlder } from './api';
import { ChatSocket, type ConnectionStatus } from './socket';
import { fromServer, type Message, type ServerMessage } from './types';

// While typing, "typing" is repeated this often; the partner drops it when it stops coming.
const TYPING_REPEAT_MS = 3_000;
const TYPING_TTL_MS = 6_000;

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
  // A friend joined or left: the room's members changed.
  onMembersChanged: () => void;
  onBuddy: (buddy: BuddyView) => void;
};

export function useChat({ myId, onRoomLost, onMembersChanged, onBuddy }: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [hasOlder, setHasOlder] = useState(false);
  // The first page has arrived; before that an empty timeline means "not loaded yet".
  const [loaded, setLoaded] = useState(false);
  // Other members connected right now, and who of them is typing.
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  // User id → newest message id they have read.
  const [reads, setReads] = useState<Record<string, string>>({});
  const [active, setActive] = useState(AppState.currentState === 'active');
  // Newest message id when the app last went to the background, to count what arrived since.
  const [awaySince, setAwaySince] = useState<string | undefined>(undefined);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingSentAt = useRef(0);
  const readSent = useRef<string | undefined>(undefined);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const socketRef = useRef<ChatSocket | null>(null);
  const onRoomLostRef = useRef(onRoomLost);
  onRoomLostRef.current = onRoomLost;
  const onMembersChangedRef = useRef(onMembersChanged);
  onMembersChangedRef.current = onMembersChanged;
  const onBuddyRef = useRef(onBuddy);
  onBuddyRef.current = onBuddy;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  // The latest live event for the buddy to react to (see reactionTo).
  const [reaction, setReaction] = useState<Reaction | null>(null);

  const apply = useCallback((incoming: ServerMessage[]) => {
    setMessages((prev) => merge(prev, incoming));
  }, []);

  const setTypingOf = useCallback((userId: string, on: boolean) => {
    const timers = typingTimers.current;
    clearTimeout(timers.get(userId));
    timers.delete(userId);
    if (on)
      timers.set(
        userId,
        setTimeout(() => setTypingOf(userId, false), TYPING_TTL_MS),
      );
    setTyping((prev) => {
      const without = prev.filter((id) => id !== userId);
      return on ? [...without, userId] : without;
    });
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
        setLoaded(true);
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
      onStatus: (next) => {
        setStatus(next);
        if (next !== 'online') {
          // Unknown while disconnected; ready brings the current state back.
          setOnline([]);
          for (const userId of typingTimers.current.keys()) setTypingOf(userId, false);
        }
      },
      onReady: (onlineNow, readsNow) => {
        setOnline(onlineNow);
        setReads(readsNow);
        // Anything sent before the connection dropped may not have arrived.
        readSent.current = undefined;
        typingSentAt.current = 0;
        catchUp().catch((e) => console.warn('catch-up failed', e));
      },
      onAck: (_clientMessageId, message) => apply([message]),
      onMessage: (message) => {
        // The message they were typing has arrived.
        if (message.senderId) setTypingOf(message.senderId, false);
        apply([message]);
        const next = reactionTo(message, myIdRef.current);
        if (next) setReaction(next);
      },
      onPresence: (userId, isOnline) => {
        setOnline((prev) => {
          const without = prev.filter((id) => id !== userId);
          return isOnline ? [...without, userId] : without;
        });
        if (!isOnline) setTypingOf(userId, false);
      },
      onTyping: setTypingOf,
      onRead: (userId, messageId) =>
        setReads((prev) =>
          (prev[userId] ?? '') >= messageId ? prev : { ...prev, [userId]: messageId },
        ),
      onSendFailed: (clientMessageId) => markStatus(clientMessageId, 'failed'),
      onMembersChanged: () => onMembersChangedRef.current(),
      onBuddy: (buddy) => onBuddyRef.current(buddy),
      onFatal: () => onRoomLostRef.current(),
    });
    socketRef.current = socket;
    socket.start();

    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state !== 'active') setAwaySince(messagesRef.current.find((m) => m.id)?.id ?? '');
      if (state === 'active') {
        socket.resume();
        socket.reconnectNow();
      } else if (state === 'background' && Platform.OS !== 'web') {
        // Web has no push notifications, so a hidden tab stays connected.
        socket.pause();
      }
    });
    const timers = typingTimers.current;
    return () => {
      subscription.remove();
      socket.stop();
      socketRef.current = null;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [apply, markStatus, setTypingOf]);

  // While the chat is on screen, tell the others how far I have read: up to the newest message
  // that is not my own. Hex ids sort by time, so comparing strings compares age.
  useEffect(() => {
    if (status !== 'online' || !active) return;
    const newest = messages.find((m) => m.id && !(m.type === 'TEXT' && m.senderId === myId))?.id;
    if (!newest) return;
    if ((reads[myId] ?? '') >= newest || (readSent.current ?? '') >= newest) return;
    if (socketRef.current?.sendRead(newest)) readSent.current = newest;
  }, [messages, status, active, reads, myId]);

  // Called as the draft changes. Repeats "typing" while it keeps changing; the partner lets it
  // lapse once it stops, so no timer is needed here.
  const notifyTyping = useCallback((hasDraft: boolean) => {
    const now = Date.now();
    if (hasDraft) {
      if (now - typingSentAt.current < TYPING_REPEAT_MS) return;
      typingSentAt.current = now;
      socketRef.current?.sendTyping(true);
    } else if (typingSentAt.current) {
      typingSentAt.current = 0;
      socketRef.current?.sendTyping(false);
    }
  }, []);

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
      // The partner stops showing "typing" when the message arrives; start over for the next one.
      typingSentAt.current = 0;
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

  // Others' messages that arrived while the app was in the background (a hidden browser tab).
  const unreadWhileAway = active
    ? 0
    : messages.filter(
        (m) => m.type === 'TEXT' && m.senderId !== myId && m.id && m.id > (awaySince ?? ''),
      ).length;

  return {
    messages,
    status,
    online,
    typing,
    reads,
    unreadWhileAway,
    reaction,
    loaded,
    send,
    retry,
    loadOlder,
    notifyTyping,
  };
}
