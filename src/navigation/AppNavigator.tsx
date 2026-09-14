import React from 'react';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { colors } from '../constants/theme';
import HomeScreen from '../screens/HomeScreen';
import ScannerScreen from '../screens/ScannerScreen';
import ImgToPdfScreen from '../screens/ImgToPdfScreen';
import WordToPdfScreen from '../screens/WordToPdfScreen';
import SignScreen from '../screens/SignScreen';
import CompressScreen from '../screens/CompressScreen';

export type RootStackParamList = {
  Home: { highlightDocumentId?: string } | undefined;
  /** Camera capture. Hands pages back to the studio. */
  Scanner: { existingUris?: string[] } | undefined;
  /**
   * The studio: reorder, filter, name, export. `cropUris` is the subset of
   * `initialUris` that arrived without passing a crop step yet, so the studio
   * offers one for each.
   */
  ImgToPdf: { initialUris?: string[]; title?: string; cropUris?: string[] } | undefined;
  WordToPdf: undefined;
  Sign: { documentId?: string } | undefined;
  Compress: { documentId?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Every screen draws its own Header, so the native bar stays off. */
const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primaryContainer,
    background: colors.background,
    card: colors.surfaceLowest,
    text: colors.onSurface,
    border: colors.outlineVariant,
  },
};

export function AppNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="ImgToPdf" component={ImgToPdfScreen} />
        <Stack.Screen name="WordToPdf" component={WordToPdfScreen} />
        <Stack.Screen name="Sign" component={SignScreen} />
        <Stack.Screen name="Compress" component={CompressScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default AppNavigator;
