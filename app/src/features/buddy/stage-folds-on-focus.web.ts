// A computer with a mouse has no on-screen keyboard to make room for, so the stage stays open
// while typing. Phone browsers fold it like the app. Called on focus, never while rendering at
// build time.
export function stageFoldsOnFocus(): boolean {
  return !window.matchMedia('(pointer: fine)').matches;
}
