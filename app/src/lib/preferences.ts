import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// Display choices made in settings, kept on this device: the app's language and light or dark
// (docs/product.md, 설정). "system" follows the device, as before there was a choice.

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'ko' | 'ja' | 'en';
export type Preferences = { theme: ThemePreference; language: LanguagePreference };

const KEY = 'preferences';
let current: Preferences = { theme: 'system', language: 'system' };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function get() {
  return current;
}

function set(next: Preferences) {
  current = next;
  listeners.forEach((listener) => listener());
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

/** Reads what was chosen before; until then the device's settings apply. */
export async function loadPreferences(): Promise<Preferences> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Partial<Preferences>;
    current = { ...current, ...saved };
    listeners.forEach((listener) => listener());
  } catch {
    // Nothing saved, or storage blocked: keep following the device.
  }
  return current;
}

export function setThemePreference(theme: ThemePreference) {
  set({ ...current, theme });
}

export function setLanguagePreference(language: LanguagePreference) {
  set({ ...current, language });
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, get, get);
}
