// Placeholder data for building the chat UI before the server exists. Remove once messages come
// from the backend.
import type { BuddyEvent, Member, Message } from './types';

export const ME: Member = { id: 'me', displayName: 'Henry' };
export const PARTNER: Member = { id: 'partner', displayName: 'Yuki' };
export const BUDDY = { name: 'Mugi', level: 3, expProgress: 0.4 };

let seq = 0;
const base = (minutesAgo: number) => {
  const id = `mock-${seq++}`;
  return {
    id,
    clientMessageId: id,
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
};
const text = (senderId: string, body: string, minutesAgo: number): Message => ({
  ...base(minutesAgo),
  type: 'TEXT',
  senderId,
  text: body,
});
const buddy = (event: BuddyEvent, minutesAgo: number, actorId?: string): Message => ({
  ...base(minutesAgo),
  type: 'BUDDY_EVENT',
  event,
  actorId,
});

// Oldest first, as the server would return a page.
export const MOCK_MESSAGES: Message[] = [
  text(PARTNER.id, 'おつかれ〜', 95),
  text(ME.id, '今終わった！', 93),
  buddy('HUNGRY', 60),
  buddy('FED', 42, PARTNER.id),
  text(PARTNER.id, 'Mugiにごはんあげといたよ', 41),
  text(ME.id, 'ありがと〜', 40),
  buddy('POOPED', 12),
  text(ME.id, 'うんち！！', 11),
  text(PARTNER.id, 'ｗｗｗ', 11),
  text(PARTNER.id, 'そっちが片付けて', 10),
];
