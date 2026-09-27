import type { BuddyView } from '@/features/buddy/api';
import { api, ApiError } from '@/lib/api';

// Shapes returned by the server (server/src/main/java/com/buddychat/room/RoomView.java).
export type Me = { id: string; displayName: string | null; roomId: string | null };
export type RoomMember = { id: string; displayName: string | null };
export type Room = { id: string; members: RoomMember[]; buddy: BuddyView; createdAt: string };
export type Invitation = { code: string; expiresAt: string };

export const fetchMe = () => api<Me>('/api/me');

// The name others see. Guests start without one (server: User.MAX_NAME_LENGTH).
export const MAX_DISPLAY_NAME = 20;
export const updateMyName = (displayName: string) =>
  api<Me>('/api/me', { method: 'PATCH', body: { displayName } });

export const fetchRoom = () => api<Room>('/api/rooms/me');

export const createRoom = (buddyName: string) =>
  api<Room>('/api/rooms', { method: 'POST', body: { buddyName } });

// Leaves the room: the partner keeps the room and buddy; a solo room is deleted.
export const leaveRoom = () => api<void>('/api/rooms/me/leave', { method: 'POST' });

export const createInvitation = () =>
  api<Invitation>('/api/rooms/me/invitations', { method: 'POST' });

// Accepting runs several steps on the server without a transaction. If it fails midway (network,
// 5xx), the same user accepting the same code again finishes it (docs/server-design.md), so it is
// retried a couple of times rather than leaving the friend's room half-joined.
export async function acceptInvitation(code: string, leaveCurrentRoom: boolean): Promise<Room> {
  const request = () =>
    api<Room>(`/api/invitations/${encodeURIComponent(code.trim())}/accept`, {
      method: 'POST',
      body: { leaveCurrentRoom },
    });
  for (let attempt = 1; ; attempt++) {
    try {
      return await request();
    } catch (e) {
      const retryable = e instanceof ApiError && (e.status === 0 || e.status >= 500);
      if (!retryable || attempt > ACCEPT_RETRIES) throw e;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

const ACCEPT_RETRIES = 2;
