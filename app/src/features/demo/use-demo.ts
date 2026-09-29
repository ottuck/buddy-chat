import { useCallback, useEffect, useRef, useState } from 'react';

import type { BuddyStage, BuddyView } from '@/features/buddy/api';
import { STAGE_ORDER } from '@/features/buddy/pixel/sprites';
import type { AskedAct } from '@/features/buddy/components/buddy-stage';
import type { Reaction, ReactionKind } from '@/features/buddy/reactions';
import type { BuddyEvent, Message } from '@/features/chat/types';

import { DEMO_ME, DEMO_PARTNER, REPLIES, SCRIPT, type Step, type Who } from './script';

// Plays the tour's script (script.ts) into the same shapes the real chat screen shows: a
// timeline, the buddy, "typing…" and reactions. The buddy's changes here are scripted, not the
// server's rules, and nothing is sent anywhere.

const LEVEL_OF: Record<BuddyStage, number> = { EGG: 1, BABY: 2, CHILD: 5, ADULT: 10 };
const REACTION_OF: Partial<Record<BuddyEvent, ReactionKind>> = {
  FED: 'fed',
  CLEANED: 'cleaned',
  POOPED: 'pooped',
  LEVELED_UP: 'levelUp',
  EVOLVED: 'evolved',
};
const REPLY_AFTER_MS = 900;
// A timeline entry before it gets its id and time (per kind of message).
type Draft = Message extends infer M
  ? M extends Message
    ? Omit<M, 'id' | 'clientMessageId' | 'createdAt'>
    : never
  : never;
const TYPING_MS = 1200;

function egg(name: string): BuddyView {
  return {
    name,
    exp: 0,
    level: 1,
    stage: 'EGG',
    levelProgress: 0.4,
    fullness: 90,
    poops: 0,
    hungry: false,
    canFeed: false,
    canClean: false,
  };
}

// The buddy after an event, or null if the event does not apply now (e.g. the visitor already
// fed it before the script got there).
function afterEvent(buddy: BuddyView, event: BuddyEvent): BuddyView | null {
  switch (event) {
    case 'EVOLVED': {
      const stage = STAGE_ORDER[STAGE_ORDER.indexOf(buddy.stage) + 1];
      if (!stage) return null;
      return { ...buddy, stage, level: LEVEL_OF[stage], levelProgress: 0.1 };
    }
    case 'LEVELED_UP':
      return { ...buddy, level: buddy.level + 1, levelProgress: 0.1 };
    case 'HUNGRY':
      return buddy.hungry ? null : { ...buddy, hungry: true, canFeed: true, fullness: 20 };
    case 'FED':
      return buddy.canFeed
        ? { ...buddy, hungry: false, canFeed: false, fullness: 100, levelProgress: 0.6 }
        : null;
    case 'POOPED':
      return { ...buddy, poops: buddy.poops + 1, canClean: true };
    case 'CLEANED':
      return buddy.poops > 0 ? { ...buddy, poops: 0, canClean: false } : null;
  }
}

type Options = {
  buddyName: string;
  lineText: (line: string) => string;
  replyText: (reply: string) => string;
};

export function useDemo({ buddyName, lineText, replyText }: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [buddy, setBuddy] = useState(() => egg(buddyName));
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerReadId, setPartnerReadId] = useState<string | undefined>(undefined);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [askedAct, setAskedAct] = useState<AskedAct | null>(null);
  const [finished, setFinished] = useState(false);
  const buddyRef = useRef(buddy);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);
  const replies = useRef(0);
  const lineRef = useRef(lineText);
  const replyRef = useRef(replyText);
  useEffect(() => {
    lineRef.current = lineText;
    replyRef.current = replyText;
  });

  const later = useCallback((ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  }, []);

  const changeBuddy = useCallback((next: BuddyView) => {
    buddyRef.current = next;
    setBuddy(next);
  }, []);

  // Ids sort by time like the server's, so "read" receipts work the same way.
  const add = useCallback((message: Draft) => {
    const id = (++nextId.current).toString(16).padStart(24, '0');
    const full = {
      ...message,
      id,
      clientMessageId: `demo-${id}`,
      createdAt: new Date().toISOString(),
    } as Message;
    setMessages((prev) => [full, ...prev]);
    return id;
  }, []);

  const text = useCallback(
    (from: Who, value: string) => {
      const id = add({ type: 'TEXT', senderId: from, text: value });
      if (from === DEMO_PARTNER) {
        setPartnerTyping(false);
        setReaction({ id, kind: 'message' });
      } else {
        // The partner is right there and reads it.
        later(800, () => setPartnerReadId(id));
      }
      const current = buddyRef.current;
      if (current.stage !== 'EGG') {
        changeBuddy({ ...current, levelProgress: Math.min(0.95, current.levelProgress + 0.1) });
      }
    },
    [add, changeBuddy, later],
  );

  const event = useCallback(
    (kind: BuddyEvent, actor?: Who) => {
      const next = afterEvent(buddyRef.current, kind);
      if (!next) return;
      changeBuddy(next);
      const id = add({
        type: 'BUDDY_EVENT',
        event: kind,
        actorId: actor,
        level: kind === 'LEVELED_UP' ? next.level : undefined,
      });
      const reactionKind = REACTION_OF[kind];
      if (reactionKind) setReaction({ id, kind: reactionKind });
    },
    [add, changeBuddy],
  );

  useEffect(() => {
    const run = (step: Step) => {
      if (step.kind === 'typing') setPartnerTyping(true);
      else if (step.kind === 'text') text(step.from, lineRef.current(step.line));
      else if (step.kind === 'event') event(step.event, step.actor);
      else if (step.kind === 'act') setAskedAct({ id: `act-${step.at}`, act: step.act });
      else setFinished(true);
    };
    for (const step of SCRIPT) later(step.at, () => run(step));
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, [event, later, text]);

  // What the visitor does themselves: the buddy and the partner answer as in a real room.
  const send = useCallback(
    (value: string) => {
      text(DEMO_ME, value);
      const reply = REPLIES[replies.current++ % REPLIES.length];
      later(REPLY_AFTER_MS, () => setPartnerTyping(true));
      later(REPLY_AFTER_MS + TYPING_MS, () => text(DEMO_PARTNER, replyRef.current(reply)));
    },
    [later, text],
  );

  return {
    messages,
    buddy,
    partnerTyping,
    partnerReadId,
    reaction,
    askedAct,
    finished,
    send,
    feed: () => event('FED', DEMO_ME),
    clean: () => event('CLEANED', DEMO_ME),
  };
}
