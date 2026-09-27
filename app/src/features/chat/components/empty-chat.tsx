import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import type { BuddyStage } from '@/features/buddy/api';
import { BuddyAvatar } from '@/features/buddy/components/buddy-avatar';
import { useColors } from '@/theme';

type Props = {
  buddyName: string;
  stage: BuddyStage;
  // null in a solo room: the way forward is inviting a friend.
  partnerName: string | null;
  onInvite: () => void;
};

// A timeline with nothing in it yet: a room just created, or a friend who just joined.
export function EmptyChat({ buddyName, stage, partnerName, onInvite }: Props) {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <BuddyAvatar stage={stage} size={56} />
      <Text style={[styles.text, { color: colors.textMuted }]}>
        {partnerName === null
          ? t('chat.emptySolo', { buddy: buddyName })
          : t('chat.emptyDuo', { partner: partnerName || t('chat.guestName') })}
      </Text>
      {partnerName === null ? <Button label={t('invite.button')} onPress={onInvite} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
