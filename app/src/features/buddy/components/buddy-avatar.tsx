import { Text } from 'react-native';

import type { BuddyStage } from '../api';

// Placeholder art until the original buddy assets exist (docs/project-plan.md §29–31).
const PLACEHOLDER: Record<BuddyStage, string> = {
  EGG: '🥚',
  BABY: '🐣',
  CHILD: '🐥',
  ADULT: '🐤',
};

export function BuddyAvatar({ stage, size }: { stage: BuddyStage; size: number }) {
  return <Text style={{ fontSize: size, lineHeight: size * 1.2 }}>{PLACEHOLDER[stage]}</Text>;
}
