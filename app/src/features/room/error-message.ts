import type { TFunction } from 'i18next';

import { ApiError } from '@/lib/api';

// Server error codes that have their own message; anything else gets a generic one.
const KNOWN = [
  'NETWORK',
  'ROOM_FULL',
  'INVITATION_NOT_FOUND',
  'INVITATION_EXPIRED',
  'INVITATION_USED',
  'ALREADY_MEMBER',
  'ALREADY_IN_ROOM',
] as const;

export function errorMessage(t: TFunction, error: unknown): string {
  const code = error instanceof ApiError ? error.code : null;
  const known = KNOWN.find((k) => k === code);
  return known ? t(`errors.${known}`) : t('errors.unknown');
}
