import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BuddyStage } from './api';

// What a grown buddy says (docs/product.md, Buddy 무대): a greeting when the app opens, a word
// back when it is fed, petted or cleaned, and now and then a line of its own. Lines are keys under
// buddy.say in the translations. Nothing is sent or stored in the chat.

export type Line =
  | 'thanks'
  | 'yummy'
  | 'refreshed'
  | 'digestion'
  | 'hungry'
  | 'full'
  | 'alreadyClean'
  | 'longTime'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'ateYet'
  | 'whatsUp'
  | 'howWasToday';

const SAY_MS = 3000;
const CHATTER_MIN_MS = 60_000;
const CHATTER_MAX_MS = 120_000;
const CHATTER: Line[] = ['ateYet', 'whatsUp', 'howWasToday'];
const LONG_TIME_MS = 3 * 24 * 60 * 60 * 1000;
// When this device last opened the chat, to say "long time no see" or "good morning".
const LAST_VISIT_KEY = 'buddy-last-visit';

// The stage mounts again every time it unfolds; greet once per app session.
let greeted = false;

// Babies and eggs do not talk yet.
export function talks(stage: BuddyStage): boolean {
  return stage === 'CHILD' || stage === 'ADULT';
}

function greetingFor(hour: number): Line | null {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 23) return 'evening';
  return null; // asleep
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * The line being said, and `say` to make the buddy say one. `quiet`: not a moment for idle
 * chatter (asleep, or busy with something else).
 */
export function useBuddyTalk({
  stage,
  quiet,
  greets,
}: {
  stage: BuddyStage;
  quiet: boolean;
  // Off in the tour: its buddy is not the user's, and it has no visits to count.
  greets: boolean;
}) {
  const [line, setLine] = useState<Line | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canTalk = talks(stage);
  const canTalkRef = useRef(canTalk);
  useEffect(() => {
    canTalkRef.current = canTalk;
  });

  const say = useCallback((next: Line) => {
    if (!canTalkRef.current) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setLine(next);
    hideTimer.current = setTimeout(() => setLine(null), SAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  // On opening: "long time no see" after three days away, else a greeting on the first visit of
  // the day. The visit is recorded even while the buddy is too young to talk.
  useEffect(() => {
    if (!greets || greeted) return;
    greeted = true;
    let cancelled = false;
    (async () => {
      const last = Number(await AsyncStorage.getItem(LAST_VISIT_KEY).catch(() => null)) || 0;
      const now = new Date();
      await AsyncStorage.setItem(LAST_VISIT_KEY, String(now.getTime())).catch(() => {});
      if (cancelled || !last) return;
      if (now.getTime() - last > LONG_TIME_MS) {
        say('longTime');
      } else if (new Date(last).toDateString() !== now.toDateString()) {
        const greeting = greetingFor(now.getHours());
        if (greeting) say(greeting);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [greets, say]);

  // Now and then a line of its own.
  useEffect(() => {
    if (!canTalk || quiet || line) return;
    const timer = setTimeout(
      () => say(pick(CHATTER)),
      CHATTER_MIN_MS + Math.random() * (CHATTER_MAX_MS - CHATTER_MIN_MS),
    );
    return () => clearTimeout(timer);
  }, [canTalk, quiet, line, say]);

  return { line: canTalk ? line : null, say };
}
