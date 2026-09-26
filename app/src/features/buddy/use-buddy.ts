import { useState } from 'react';

import { type Buddy, canClean, canFeed, clean, feed } from './rules';

// Mock starting state: level 3, a bit hungry, and it has just pooped (matches the mock chat).
const INITIAL_BUDDY: Buddy = { name: 'Mugi', exp: 48, fullness: 55, cleanliness: 30 };

// Local-only buddy state until the server exists. `feed` / `clean` return whether anything
// happened, so the caller only posts a timeline event for real changes.
export function useBuddy() {
  const [buddy, setBuddy] = useState(INITIAL_BUDDY);

  return {
    buddy,
    feed: () => {
      if (!canFeed(buddy)) return false;
      setBuddy(feed);
      return true;
    },
    clean: () => {
      if (!canClean(buddy)) return false;
      setBuddy(clean);
      return true;
    },
  };
}
