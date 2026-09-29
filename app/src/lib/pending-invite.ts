// An invite link opened before signing in (join?code=…), kept until the user can join.
// Native opens no links yet (deep links come with the development build).
export function rememberInviteFromUrl(): void {}

export function takePendingInvite(): string | null {
  return null;
}

export function hasPendingInvite(): boolean {
  return false;
}
