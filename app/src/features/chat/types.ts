export type BuddyEvent = 'HUNGRY' | 'FED' | 'POOPED' | 'CLEANED';

type MessageBase = {
  id: string;
  // Generated on the client so a retried send is stored only once (docs/project-plan.md §21).
  clientMessageId: string;
  createdAt: string; // ISO 8601
};

export type TextMessage = MessageBase & {
  type: 'TEXT';
  senderId: string;
  text: string;
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
  displayName: string;
};
