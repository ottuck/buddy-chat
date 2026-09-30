import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PageTitle } from '@/components/page-title';
import { BuddyGuide } from '@/features/buddy/components/buddy-guide';
import { MAX_CONTENT_WIDTH, useColors } from '@/theme';

// How to raise the buddy, to look up any time (chat header "?", settings).
export default function GuideScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <PageTitle title={t('guide.title')} />
      <View style={styles.column}>
        <BuddyGuide />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    padding: 16,
  },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
});
