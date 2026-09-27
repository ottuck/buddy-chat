import { useCallback, useState } from 'react';

import { type BuddyView, cleanBuddy, feedBuddy } from './api';

// The room's buddy, kept current by care responses and the socket's `buddy` events. The timeline
// events (FED, CLEANED, …) arrive through the chat as messages.
export function useBuddy(initial: BuddyView) {
  const [buddy, setBuddy] = useState(initial);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: typeof feedBuddy) => {
    setBusy(true);
    try {
      setBuddy((await action()).buddy);
    } catch (e) {
      console.warn('buddy care failed', e);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    buddy,
    busy,
    setBuddy,
    feed: () => run(feedBuddy),
    clean: () => run(cleanBuddy),
  };
}
