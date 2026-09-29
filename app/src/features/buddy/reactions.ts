import type { ServerMessage } from '@/features/chat/types';

// Something that just happened in the room, for the buddy on its stage to react to.
export type ReactionKind = 'message' | 'fed' | 'cleaned' | 'pooped' | 'evolved';
export type Reaction = { id: string; kind: ReactionKind };

const BY_EVENT: Partial<Record<string, ReactionKind>> = {
  FED: 'fed',
  CLEANED: 'cleaned',
  POOPED: 'pooped',
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
