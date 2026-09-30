import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { WebFrame } from '@/components/web-frame';
import { clipboardSupported, copyText } from '@/lib/clipboard';
import { siteUrl } from '@/lib/site-url';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

import { createInvitation, type Invitation } from '../api';
import { errorMessage } from '../error-message';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Creates a fresh invite code each time it opens (codes are single-use, 24h): the content is
// mounted only while visible, so every opening starts from a blank state.
export function InviteSheet({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Web shows the sheet in the same frame as the app (components/web-frame.web.tsx). */}
      <WebFrame>{visible ? <InviteContent onClose={onClose} /> : null}</WebFrame>
    </Modal>
  );
}

function InviteContent({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    createInvitation()
      .then(setInvitation)
      .catch((e) => setError(errorMessage(t, e)));
  }, [t]);

  const expires = invitation
    ? new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(invitation.expiresAt))
    : '';

  // A link that opens the join screen with the code filled in, and the code for typing by hand.
  const share = async () => {
    if (!invitation) return;
    const link = `${siteUrl()}/join?code=${invitation.code}`;
    try {
      await Share.share({
        message: t('invite.shareMessage', { link, code: invitation.code, time: expires }),
      });
    } catch {
      // Sharing is unavailable on some browsers; the code can be copied instead.
    }
  };

  const copy = async () => {
    if (!invitation) return;
    try {
      await copyText(invitation.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The code is selectable on screen too.
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.column, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
            <Text style={[styles.close, { color: colors.accent }]}>{t('common.close')}</Text>
          </Pressable>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{t('invite.title')}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('invite.hint')}</Text>

        <View style={[styles.codeCard, { backgroundColor: colors.surface }]}>
          {invitation ? (
            <>
              <View style={styles.codeRow}>
                <Text selectable style={[styles.code, { color: colors.text }]}>
                  {invitation.code}
                </Text>
                {clipboardSupported ? (
                  <Pressable
                    onPress={copy}
                    accessibilityRole="button"
                    accessibilityLabel={t('invite.copy')}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.copy,
                      { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.copyLabel, { color: colors.accent }]}>
                      {copied ? t('invite.copied') : t('invite.copy')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={[styles.expires, { color: colors.textMuted }]}>
                {t('invite.expires', { time: expires })}
              </Text>
            </>
          ) : error ? (
            <Text style={[styles.error, { color: colors.accent }]}>{error}</Text>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>

        <Button label={t('invite.share')} onPress={share} disabled={!invitation} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    paddingHorizontal: 20,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 16,
  },
  close: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    fontSize: 15,
    textAlign: 'center',
  },
  codeCard: {
    minHeight: 120,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
  },
  code: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 6,
  },
  expires: {
    fontSize: 13,
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
  },
});
