import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

import { fetchMe, fetchRoom, type Me, type Room } from './api';

type RoomState =
  | { status: 'loading' }
  | { status: 'error' }
  // Signed in but no room yet: the welcome screen creates one or joins with a code.
  | { status: 'none'; me: Me }
  | { status: 'ready'; me: Me; room: Room };

type RoomContextValue = {
  state: RoomState;
  reload: () => Promise<void>;
  // Refetches the room in place (e.g. after a friend joined), without a loading screen.
  refreshRoom: () => Promise<void>;
  // After creating or joining a room, the screen hands the new room over directly.
  setRoom: (room: Room) => void;
};

const RoomContext = createContext<RoomContextValue | null>(null);

async function loadRoomState(): Promise<RoomState> {
  try {
    const me = await fetchMe();
    if (!me.roomId) return { status: 'none', me };
    return { status: 'ready', me, room: await fetchRoom() };
  } catch (e) {
    console.warn(e);
    return { status: 'error' };
  }
}

// Remounted per signed-in user, so signing out and in as someone else starts from 'loading'.
export function RoomProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <UserRoomProvider key={user?.uid ?? 'signed-out'} signedIn={!!user}>
      {children}
    </UserRoomProvider>
  );
}

function UserRoomProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const [state, setState] = useState<RoomState>({ status: 'loading' });

  useEffect(() => {
    if (signedIn) loadRoomState().then(setState);
  }, [signedIn]);

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    setState(await loadRoomState());
  }, []);

  const setRoom = useCallback((room: Room) => {
    setState((prev) =>
      prev.status === 'none' || prev.status === 'ready'
        ? { status: 'ready', me: { ...prev.me, roomId: room.id }, room }
        : prev,
    );
  }, []);

  const refreshRoom = useCallback(async () => {
    try {
      setRoom(await fetchRoom());
    } catch (e) {
      console.warn('refreshing the room failed', e);
    }
  }, [setRoom]);

  return (
    <RoomContext.Provider value={{ state, reload, refreshRoom, setRoom }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error('useRoom must be used inside RoomProvider');
  return value;
}

// For screens that are only reachable with a room (see the route guards in app/_layout.tsx).
export function useReadyRoom() {
  const { state, ...rest } = useRoom();
  if (state.status !== 'ready') throw new Error('No room yet');
  return { me: state.me, room: state.room, ...rest };
}
