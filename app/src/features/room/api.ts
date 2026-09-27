import type { BuddyView } from '@/features/buddy/api';
import { api } from '@/lib/api';

// Shapes returned by the server (server/src/main/java/com/buddychat/room/RoomView.java).
export type Me = { id: string; displayName: string | null; roomId: string | null };
export type RoomMember = { id: string; displayName: string | null };
export type Room = { id: string; members: RoomMember[]; buddy: BuddyView; createdAt: string };
export type Invitation = { code: string; expiresAt: string };

export const fetchMe = () => api<Me>('/api/me');

export const fetchRoom = () => api<Room>('/api/rooms/me');

export const createRoom = (buddyName: string) =>
  api<Room>('/api/rooms', { method: 'POST', body: { buddyName } });

export const createInvitation = () =>
  api<Invitation>('/api/rooms/me/invitations', { method: 'POST' });

export const acceptInvitation = (code: string, leaveCurrentRoom: boolean) =>
  api<Room>(`/api/invitations/${encodeURIComponent(code.trim())}/accept`, {
    method: 'POST',
    body: { leaveCurrentRoom },
  });
