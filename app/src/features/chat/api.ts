import { api } from '@/lib/api';

import type { ServerMessage } from './types';

export const PAGE_SIZE = 30;
const CATCH_UP_PAGE_SIZE = 50;

type MessagePage = { messages: ServerMessage[]; hasMore: boolean }; // newest first

export const fetchNewest = () => api<MessagePage>(`/api/rooms/me/messages?limit=${PAGE_SIZE}`);

export const fetchOlder = (before: string) =>
  api<MessagePage>(`/api/rooms/me/messages?limit=${PAGE_SIZE}&before=${before}`);

export const fetchNewer = (after: string) =>
  api<MessagePage>(`/api/rooms/me/messages?limit=${CATCH_UP_PAGE_SIZE}&after=${after}`);
