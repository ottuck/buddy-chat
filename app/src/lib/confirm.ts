import { Alert } from 'react-native';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
};

// A yes/no dialog. React Native Web's Alert has no buttons, hence the web variant.
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(options.title, options.message, [
      { text: options.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: options.confirmLabel,
        style: options.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
