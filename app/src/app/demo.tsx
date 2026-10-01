import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PageTitle } from '@/components/page-title';
import { isCancelledSignIn, signInAsGuest } from '@/features/auth/actions';
import { BuddySheet } from '@/features/buddy/components/buddy-sheet';
import { BuddyStage } from '@/features/buddy/components/buddy-stage';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { MessageComposer } from '@/features/chat/components/message-composer';
import { MessageList } from '@/features/chat/components/message-list';
import { DEMO_ME, DEMO_PARTNER } from '@/features/demo/script';
import { useDemo } from '@/features/demo/use-demo';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

// "Take a look first" (docs/product.md, 구경하기): the chat screen as it is, playing a scripted
// room in which the buddy grows from an egg to an adult in about 55 seconds. No account, no
// server. The visitor can feed, clean and type along; at the end, starting their own is one tap.
export default function DemoRoute() {
  // Watching again starts everything over.
  const [run, setRun] = useState(0);
  return <DemoScreen key={run} onReplay={() => setRun((n) => n + 1)} />;
}

function DemoScreen({ onReplay }: { onReplay: () => void }) {
  const colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const buddyName = t('demo.buddy');
  const demo = useDemo({
    buddyName,
    lineText: (line) => t(`demo.lines.${line}` as 'demo.lines.hello'),
    replyText: (reply) => t(`demo.replies.${reply}` as 'demo.replies.r1', { buddy: buddyName }),
  });
  const members = [
    { id: DEMO_ME, displayName: t('demo.me') },
    { id: DEMO_PARTNER, displayName: t('demo.partner') },
  ];
  const [buddyOpen, setBuddyOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const stageHeight = Math.round(Math.min(280, Math.max(180, windowHeight * 0.3)));

  // The auth listener then leaves the tour for naming, as from the sign-in screen.
  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await signInAsGuest();
    } catch (e) {
      if (!isCancelledSignIn(e)) {
        console.warn(e);
        setError(t('signIn.error'));
      }
      setStarting(false);
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <PageTitle title={t('demo.title')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={-insets.bottom}
        style={styles.column}
      >
        <View style={[styles.bar, { backgroundColor: colors.stage }]}>
          <Pressable onPress={leave} accessibilityRole="button" hitSlop={10}>
            <Text style={[styles.barLink, { color: colors.textMuted }]}>{t('demo.back')}</Text>
          </Pressable>
          <Text style={[styles.barText, { color: colors.textMuted }]} numberOfLines={1}>
            {t('demo.badge')}
          </Text>
          <Pressable onPress={start} disabled={starting} accessibilityRole="button" hitSlop={10}>
            <Text style={[styles.barLink, { color: colors.accent }]}>{t('demo.startShort')}</Text>
          </Pressable>
        </View>
        <ChatHeader
          partnerName={t('demo.partner')}
          partnerOnline
          partnerTyping={demo.partnerTyping}
          connected
          onPressInvite={() => {}}
        />
        <BuddyStage
          buddy={demo.buddy}
          busy={false}
          height={stageHeight}
          onFeed={demo.feed}
          onClean={demo.clean}
          onOpenDetail={() => setBuddyOpen(true)}
          reaction={demo.reaction}
          companionEgg={demo.finished}
          greets={false}
          cue={demo.cue}
        />
        <View style={styles.list}>
          <MessageList
            messages={demo.messages}
            myId={DEMO_ME}
            members={members}
            buddyName={buddyName}
            partnerReadId={demo.partnerReadId}
            onRetry={() => {}}
            onLoadOlder={() => {}}
          />
        </View>
        {demo.finished ? (
          <View
            style={[styles.end, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.endTitle, { color: colors.text }]}>
              {t('demo.endTitle', { buddy: buddyName })}
            </Text>
            <Text
              lineBreakStrategyIOS="hangul-word"
              style={[styles.endBody, { color: colors.textMuted }]}
            >
              {t('demo.endBody')}
            </Text>
            {starting ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Button label={t('signIn.startNow')} onPress={start} />
            )}
            <Pressable onPress={onReplay} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.replay, { color: colors.textMuted }]}>{t('demo.replay')}</Text>
            </Pressable>
            {error ? <Text style={[styles.endBody, { color: colors.accent }]}>{error}</Text> : null}
          </View>
        ) : null}
        <MessageComposer onSend={demo.send} onTyping={() => {}} />
      </KeyboardAvoidingView>

      <BuddySheet
        visible={buddyOpen}
        buddy={demo.buddy}
        busy={false}
        onClose={() => setBuddyOpen(false)}
        onFeed={demo.feed}
        onClean={demo.clean}
        together={{ myId: DEMO_ME, partnerId: DEMO_PARTNER, partnerName: t('demo.partner') }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  barText: {
    flex: 1,
    fontSize: 13,
    textAlign: 'center',
  },
  barLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  end: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    alignItems: 'stretch',
  },
  endTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  endBody: {
    fontSize: 14,
    textAlign: 'center',
  },
  replay: {
    fontSize: 14,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
