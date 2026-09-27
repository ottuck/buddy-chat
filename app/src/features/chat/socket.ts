import { idToken } from '@/lib/api';
import { wsUrl } from '@/lib/api-url';

import type { ServerMessage } from './types';

// Server → app events (docs/server-design.md, "WebSocket 프로토콜").
type ServerEvent =
  | { type: 'hello' }
  | { type: 'ready'; userId: string; roomId: string }
  | { type: 'ack'; clientMessageId: string; message: ServerMessage }
  | { type: 'message'; message: ServerMessage }
  | { type: 'member'; userId: string; displayName: string | null }
  | { type: 'error'; code: string; clientMessageId: string | null }
  | { type: 'pong' };

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export type SocketListener = {
  onStatus: (status: ConnectionStatus) => void;
  // Authenticated; the app should fetch what it missed and resend unacknowledged messages.
  onReady: () => void;
  onAck: (clientMessageId: string, message: ServerMessage) => void;
  onMessage: (message: ServerMessage) => void;
  // A friend joined this room; the room's member list is out of date.
  onMemberJoined: () => void;
  onSendFailed: (clientMessageId: string, code: string) => void;
  // The server refused the connection for a reason reconnecting will not fix (e.g. no room).
  onFatal: (code: string) => void;
};

const MAX_BACKOFF_MS = 30_000;
const FATAL_CODES = new Set(['ROOM_NOT_FOUND']);

/**
 * One WebSocket to the chat server that keeps itself connected: it authenticates with the first
 * message and reconnects with exponential backoff until stop() is called.
 */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private ready = false;
  private stopped = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly listener: SocketListener) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearRetry();
    this.ws?.close();
    this.ws = null;
  }

  // E.g. when the app returns to the foreground: skip the backoff wait.
  reconnectNow() {
    if (this.stopped || this.ws) return;
    this.clearRetry();
    this.connect();
  }

  // Returns false when not connected; the caller keeps the message pending and resends on ready.
  send(clientMessageId: string, text: string): boolean {
    if (!this.ws || !this.ready) return false;
    this.ws.send(JSON.stringify({ type: 'send', clientMessageId, text }));
    return true;
  }

  private connect() {
    this.listener.onStatus('connecting');
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    this.ready = false;

    ws.onmessage = (event) => this.onEvent(ws, JSON.parse(String(event.data)) as ServerEvent);
    ws.onclose = () => {
      if (this.ws !== ws) return; // an old socket closing after a reconnect
      this.ws = null;
      this.ready = false;
      this.listener.onStatus('offline');
      this.scheduleRetry();
    };
  }

  private onEvent(ws: WebSocket, event: ServerEvent) {
    switch (event.type) {
      // The server reads from here on; a message sent right at open can be lost.
      case 'hello':
        this.authenticate(ws);
        break;
      case 'ready':
        this.ready = true;
        this.attempt = 0;
        this.listener.onStatus('online');
        this.listener.onReady();
        break;
      case 'ack':
        this.listener.onAck(event.clientMessageId, event.message);
        break;
      case 'message':
        this.listener.onMessage(event.message);
        break;
      case 'member':
        this.listener.onMemberJoined();
        break;
      case 'error':
        if (event.clientMessageId) {
          this.listener.onSendFailed(event.clientMessageId, event.code);
        } else if (FATAL_CODES.has(event.code)) {
          this.stop();
          this.listener.onFatal(event.code);
        }
        break;
    }
  }

  private async authenticate(ws: WebSocket) {
    try {
      ws.send(JSON.stringify({ type: 'auth', token: await idToken() }));
    } catch {
      ws.close();
    }
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const delay = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
