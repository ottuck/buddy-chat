import type { User } from 'firebase/auth';
import { useState } from 'react';

// Guests can use the app for 30 days (docs/product.md, 게스트 우선). Firebase deletes anonymous
// accounts older than that (automatic clean-up in the console), so the count starts when the
// Firebase account was created and nothing is stored for it here or on the server.
export const GUEST_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Days left before the guest account expires, rounded up (30 right after starting, 1 on the last
// day); null for accounts that are not guests.
export function guestDaysLeft(user: User | null, now: number): number | null {
  if (!user?.isAnonymous || !user.metadata.creationTime) return null;
  const expiresAt = Date.parse(user.metadata.creationTime) + GUEST_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((expiresAt - now) / DAY_MS));
}

// Days are counted once per screen visit; precise to the minute is not the point.
export function useGuestDaysLeft(user: User | null): number | null {
  const [now] = useState(() => Date.now());
  return guestDaysLeft(user, now);
}
