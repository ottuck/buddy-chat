import type { Message } from './types';

const minuteOf = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

// Two text messages belong to the same visual run when the same member sent them within the
// same minute. Runs are drawn close together and only the newest one shows its time.
function sameRun(a: Message | undefined, b: Message | undefined): boolean {
  return (
    a?.type === 'TEXT' &&
    b?.type === 'TEXT' &&
    a.senderId === b.senderId &&
    minuteOf(a.createdAt) === minuteOf(b.createdAt)
  );
}

// `messages` is newest first: index - 1 is the next newer message, index + 1 the next older.
export function runPosition(messages: Message[], index: number) {
  const message = messages[index];
  return {
    continuesOlder: sameRun(message, messages[index + 1]),
    showTime: !sameRun(message, messages[index - 1]),
  };
}

export function formatTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}
