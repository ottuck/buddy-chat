import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// The web page around the app, rendered once at build time (web only; no browser APIs here).
// Colors match the theme's background so the page does not flash white before the app draws.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />
        <title>buddy-chat</title>
        <meta
          name="description"
          content="Chat with someone you like, and raise a tiny buddy together."
        />
        <meta name="theme-color" content="#F6F4F1" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#16161A" media="(prefers-color-scheme: dark)" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: pageBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const pageBackground = `
body { background-color: #F6F4F1; }
@media (prefers-color-scheme: dark) {
  body { background-color: #16161A; }
}`;
