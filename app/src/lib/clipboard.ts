// Copying text. Native needs expo-clipboard (a native module, added with the first development
// build); until then only the web can copy, and the copy button is hidden in the app.
export const clipboardSupported = false;

export async function copyText(_text: string): Promise<void> {
  throw new Error('Copying is not available in this build yet.');
}
