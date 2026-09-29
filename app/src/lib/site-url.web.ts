// On the web, links go to wherever this page is served (a local dev server links to itself).
export function siteUrl(): string {
  return window.location.origin;
}
