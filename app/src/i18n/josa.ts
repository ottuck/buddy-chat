// Korean particles that change with the word before them: 이/가, 은/는, 과/와 follow a final
// consonant (받침) or not. Names are user-chosen, often Latin letters, so those are guessed from
// how they are usually read.

export type JosaPair = '이가' | '은는' | '과와';

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
// Read as 영, 일, 삼, 육, 칠, 팔 (ending in a consonant); 이, 사, 오, 구 do not.
const DIGITS_WITH_FINAL = '013678';
// English words ending in these letters are usually read with a final consonant in Korean
// (Tom → 톰, Bell → 벨, Jack → 잭); vowels and most others are not (Mugi → 무기, Leo → 레오).
const LATIN_WITH_FINAL = 'bklmnpt';

export function hasFinalConsonant(word: string): boolean {
  const last = [...word.trim()].reverse().find((c) => /[\p{L}\p{N}]/u.test(c));
  if (!last) return false;
  const code = last.codePointAt(0)!;
  if (code >= HANGUL_START && code <= HANGUL_END) return (code - HANGUL_START) % 28 !== 0;
  if (/[0-9]/.test(last)) return DIGITS_WITH_FINAL.includes(last);
  return LATIN_WITH_FINAL.includes(last.toLowerCase());
}

// The word with the particle that fits it, e.g. josa('하늘', '이가') → '하늘이'.
export function josa(word: string, pair: JosaPair): string {
  const [withFinal, withoutFinal] = [...pair];
  return word + (hasFinalConsonant(word) ? withFinal : withoutFinal);
}
