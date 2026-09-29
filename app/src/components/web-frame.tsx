import { type PropsWithChildren } from 'react';

// Phones show the app edge to edge; only wide browser windows frame it (web-frame.web.tsx).
export function WebFrame({ children }: PropsWithChildren) {
  return <>{children}</>;
}
