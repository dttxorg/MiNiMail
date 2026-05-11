declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';

  export interface ViewProps {
    children?: ReactNode;
    style?: unknown;
    contentContainerStyle?: unknown;
    key?: string;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    onPress?: () => void;
    horizontal?: boolean;
    showsHorizontalScrollIndicator?: boolean;
  }

  export interface TextProps extends ViewProps {
    numberOfLines?: number;
  }

  export interface TextInputProps extends ViewProps {
    multiline?: boolean;
    value?: string;
    placeholder?: string;
    onChangeText?: (value: string) => void;
  }

  export interface PressableStateCallbackType {
    pressed: boolean;
  }

  export interface PressableProps extends ViewProps {
    style?: unknown | ((state: PressableStateCallbackType) => unknown);
  }

  export const Pressable: ComponentType<PressableProps>;
  export const SafeAreaView: ComponentType<ViewProps>;
  export const ScrollView: ComponentType<ViewProps>;
  export const Text: ComponentType<TextProps>;
  export const TextInput: ComponentType<TextInputProps>;
  export const View: ComponentType<ViewProps>;

  export const StyleSheet: {
    create<T extends Record<string, unknown>>(styles: T): T;
  };
}
