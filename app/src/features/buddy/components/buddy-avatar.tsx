import type { BuddyStage } from '../api';
import { PixelSprite } from '../pixel/pixel-sprite';
import { BUDDY_PALETTE, buddyFrame } from '../pixel/sprites';

// The buddy standing still, e.g. in its detail sheet. `size` is the width in points, whatever the
// stage's grid size.
export function BuddyAvatar({ stage, size }: { stage: BuddyStage; size: number }) {
  const frame = buddyFrame(stage, 'idle');
  return <PixelSprite frame={frame} palette={BUDDY_PALETTE} scale={size / frame[0].length} />;
}
