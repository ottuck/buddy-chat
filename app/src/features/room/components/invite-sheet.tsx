import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { WebFrame } from '@/components/web-frame';
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

  useEffect(() => {
    createInvitation()
      .then(setInvitation)
      .catch((e) => setError(errorMessage(t, e)));
  }, [t]);

  const share = async () => {
    if (!invitation) return;
    try {
      await Share.share({ message: t('invite.shareMessage', { code: invitation.code }) });
    } catch {
      // Sharing is unavailable on some browsers; the code is on screen to copy by hand.
    }
  };

  const expires = invitation
    ? new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(invitation.expiresAt))
    : '';

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
              <Text selectable style={[styles.code, { color: colors.text }]}>
                {invitation.code}
              </Text>
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
