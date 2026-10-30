import { createContext, useContext, useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
export const NavigationBottomInset = createContext(0);

/** Native tabs contribute their measured safe area. Classic tabs reserve their own layout space. */
export function useNavigationBottomInset() {
  return useContext(NavigationBottomInset);
}

/** Composer clears the native tab bar; a visible keyboard supplies its own inset. */
export function useGlassTabClearance() {
  const inset = useNavigationBottomInset();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return keyboardVisible ? 0 : inset;
}
