import type { BuddyStage } from '../api';
import { PixelSprite } from '../pixel/pixel-sprite';
import { BUDDY_PALETTE, buddyFrame } from '../pixel/sprites';

// The buddy standing still, e.g. in its detail sheet. `size` is the width in points.
export function BuddyAvatar({ stage, size }: { stage: BuddyStage; size: number }) {
  return (
    <PixelSprite frame={buddyFrame(stage, 'idle')} palette={BUDDY_PALETTE} scale={size / 16} />
  );
}
