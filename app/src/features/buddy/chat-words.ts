// One-word messages the buddy answers (docs/product.md, 채팅으로 돌보기): "밥" and "청소" are care,
// done by the server (server: buddy/CareCommand, keep the lists in step); "춤" and "노래" are only
// on the stage. Only the whole message counts; trailing "!", "~" or "." are fine.

export type ChatWord = 'feed' | 'clean' | 'dance' | 'sing';

const WORDS: Record<ChatWord, readonly string[]> = {
  feed: ['밥', '🍚', 'ごはん', 'ご飯', 'food', 'feed'],
  clean: ['청소', '🧹', '똥', '💩', 'そうじ', '掃除', 'うんち', 'clean', 'poop'],
  dance: ['춤', '춤춰', '💃', '🕺', 'おどって', '踊って', 'ダンス', 'dance'],
  sing: ['노래', '노래해', '🎵', '🎶', 'うた', '歌', '歌って', 'sing', 'song'],
};

export function chatWord(text: string): ChatWord | null {
  const word = text
    .trim()
    .replace(/[!~.！。]+$/u, '')
    .trim()
    .toLowerCase();
  for (const [kind, words] of Object.entries(WORDS) as [ChatWord, readonly string[]][]) {
    if (words.includes(word)) return kind;
  }
  return null;
}
