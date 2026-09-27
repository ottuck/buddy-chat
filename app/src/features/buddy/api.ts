import { api } from '@/lib/api';

export type BuddyStage = 'EGG' | 'BABY' | 'CHILD' | 'ADULT';

// Computed by the server (server/src/main/java/com/buddychat/buddy/BuddyView.java); the app only
// displays it and does not re-derive the rules.
export type BuddyView = {
  name: string;
  exp: number;
  level: number;
  stage: BuddyStage;
  levelProgress: number; // 0..1 within the current level
  fullness: number; // 0..100
  poops: number;
  hungry: boolean;
  canFeed: boolean;
  canClean: boolean;
};

// changed: false when it was not needed, or the other member just did it.
type CareResult = { buddy: BuddyView; changed: boolean };

export const feedBuddy = () => api<CareResult>('/api/rooms/me/buddy/feed', { method: 'POST' });

export const cleanBuddy = () => api<CareResult>('/api/rooms/me/buddy/clean', { method: 'POST' });
