import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { adService } from './src/services/adService';
import { ensureOutputDirectory } from './src/services/storageService';

export default function App() {
  useEffect(() => {
    // Both are no-ops in the common case; doing them once here keeps every
    // screen from having to guard on first use.
    void ensureOutputDirectory().catch(() => undefined);
    void adService.initialize();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
