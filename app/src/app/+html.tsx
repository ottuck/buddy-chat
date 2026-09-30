import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// The public address, for link previews: crawlers need absolute URLs (infra: web_custom_domains).
const SITE = 'https://buddy.pokepidia.com';
const TITLE = 'buddy-chat';
const DESCRIPTION =
  'A tiny 1:1 chat app where two people raise a pixel buddy together. Take a look without signing up.';

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
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        {/* Link previews (KakaoTalk, Slack, X, …) read these without running the app. The image
            is public/og.png, made from the app's screenshots. */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={TITLE} />
        <meta property="og:title" content={`${TITLE} · Raise a tiny buddy together`} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={SITE} />
        <meta property="og:image" content={`${SITE}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="A chat between two people with a pixel buddy on a small stage above it"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content="#F6F4F1" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#16161A" media="(prefers-color-scheme: dark)" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: pageStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// The theme's background and border colors (src/theme), and on wide windows the phone-sized frame
// around the app (components/web-frame.web.tsx): ids outrank React Native Web's class styles.
// Korean wraps between words, not letters ("키워" / "요." split otherwise); a word too long for the
// line still breaks. Only for Korean: Japanese has no spaces to break at.
const pageStyle = `
body { background-color: #F6F4F1; }
@media (prefers-color-scheme: dark) {
  body { background-color: #16161A; }
}
@media (min-width: 768px) {
  body, #web-backdrop { background-color: #E8E3DC; }
  #web-backdrop { align-items: center; justify-content: center; }
  #web-frame {
    flex: none;
    width: 440px;
    height: min(920px, calc(100% - 48px));
    border: 1px solid #E7E2DC;
    border-radius: 28px;
    overflow: hidden;
    background-color: #F6F4F1;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  }
}
@media (min-width: 768px) and (prefers-color-scheme: dark) {
  body, #web-backdrop { background-color: #0C0C0F; }
  #web-frame { border-color: #2E2E35; background-color: #16161A; box-shadow: none; }
}
html[data-theme="light"] body { background-color: #F6F4F1; }
html[data-theme="dark"] body { background-color: #16161A; }
@media (min-width: 768px) {
  html[data-theme="light"] body, html[data-theme="light"] #web-backdrop { background-color: #E8E3DC; }
  html[data-theme="light"] #web-frame {
    border-color: #E7E2DC;
    background-color: #F6F4F1;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  }
  html[data-theme="dark"] body, html[data-theme="dark"] #web-backdrop { background-color: #0C0C0F; }
  html[data-theme="dark"] #web-frame { border-color: #2E2E35; background-color: #16161A; box-shadow: none; }
}
* { scrollbar-width: thin; }
html:lang(ko) body { word-break: keep-all; overflow-wrap: anywhere; }`;
