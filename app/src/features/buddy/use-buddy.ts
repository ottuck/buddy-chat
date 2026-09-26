import { useState } from 'react';

import { type Buddy, clean, feed } from './rules';

// Name and EXP come from the server. Hunger and cleanliness are still local placeholders (a bit
// hungry, just pooped) until the server owns buddy care (docs/server-design.md, S5).
export function useBuddy({ name, exp }: { name: string; exp: number }) {
  const [buddy, setBuddy] = useState<Buddy>({ name, exp, fullness: 55, cleanliness: 30 });

  return {
    buddy,
    // The rules ignore care the buddy does not need.
    feed: () => setBuddy(feed),
    clean: () => setBuddy(clean),
  };
}
