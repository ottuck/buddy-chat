// An invite link opened before signing in (join?code=…): the join screen is only for signed-in
// users, so the code is kept for this tab until they have started and picked a name.
const KEY = 'pending-invite';

export function rememberInviteFromUrl(): void {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (url.pathname.replace(/\/$/, '') !== '/join' || !code) return;
  try {
    sessionStorage.setItem(KEY, code.toUpperCase());
  } catch {
    // Storage blocked: the friend can still type the code.
  }
}

export function takePendingInvite(): string | null {
  try {
    const code = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}

export function hasPendingInvite(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
