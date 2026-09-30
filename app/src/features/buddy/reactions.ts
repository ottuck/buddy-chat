import type { ServerMessage } from '@/features/chat/types';

// Something that just happened in the room, for the buddy on its stage to react to.
export type ReactionKind = 'message' | 'fed' | 'cleaned' | 'pooped' | 'levelUp' | 'evolved';
export type Reaction = { id: string; kind: ReactionKind };

const BY_EVENT: Partial<Record<string, ReactionKind>> = {
  FED: 'fed',
  CLEANED: 'cleaned',
  POOPED: 'pooped',
  LEVELED_UP: 'levelUp',
  MAX_LEVEL: 'levelUp',
  // The new egg arrives with the same rings of light as an evolution.
  GRADUATED: 'evolved',
  EVOLVED: 'evolved',
};

// Only for messages arriving live; history loaded after a reconnect is not reacted to. Care and
// growth events come for whoever caused them, so the partner's feeding shows here too. The
// user's own texts are not reacted to, only the partner's.
export function reactionTo(message: ServerMessage, myId: string): Reaction | null {
  const kind =
    message.type === 'BUDDY_EVENT'
      ? BY_EVENT[message.buddyEvent ?? '']
      : message.type === 'TEXT' && message.senderId !== myId
        ? 'message'
        : undefined;
  return kind ? { id: message.id, kind } : null;
}

// The buddy evolved while this user was away (in messages loaded on opening or reconnecting,
// newer than what they had read): worth showing once, the other care events are not. Someone
// who never read anything here just joined, and the buddy's past is not news to them.
export function missedEvolution(
  loaded: ServerMessage[],
  myRead: string | undefined,
): Reaction | null {
  if (!myRead) return null;
  // Hex ids sort by time (docs/server-design.md).
  const evolved = loaded.find(
    (m) => m.type === 'BUDDY_EVENT' && m.buddyEvent === 'EVOLVED' && m.id > myRead,
  );
  return evolved ? { id: evolved.id, kind: 'evolved' } : null;
}
