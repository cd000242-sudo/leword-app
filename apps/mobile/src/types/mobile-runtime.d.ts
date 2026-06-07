declare module 'react' {
  export type Dispatch<T> = (value: T) => void;
  export type SetStateAction<T> = T | ((prev: T) => T);
  export function useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
}

declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
}

declare module 'react-native' {
  export const Platform: {
    OS: 'ios' | 'android' | 'web' | string;
  };
  export const Linking: {
    openURL(url: string): Promise<void>;
  };
  export const Pressable: any;
  export const SafeAreaView: any;
  export const ScrollView: any;
  export const StyleSheet: {
    create<T extends Record<string, any>>(styles: T): T;
  };
  export const Text: any;
  export const TextInput: any;
  export const View: any;
}

declare module 'expo-status-bar' {
  export const StatusBar: any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elementName: string]: any;
  }
}
