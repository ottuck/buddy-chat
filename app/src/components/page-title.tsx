import Head from 'expo-router/head';

const APP_NAME = 'puny-chat';

// The browser tab's title (web). Each screen renders one: Head only applies inside the focused
// screen, and with none the tab's title would be empty.
// `count`: unread messages, shown first like other messengers do ("(2) puny-chat").
export function PageTitle({ title, count = 0 }: { title?: string; count?: number }) {
  const name = title ? `${title} · ${APP_NAME}` : APP_NAME;
  return (
    <Head>
      <title>{count > 0 ? `(${count}) ${name}` : name}</title>
    </Head>
  );
}
