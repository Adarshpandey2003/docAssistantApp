import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/common';
import { CropOverlay } from '../components/scanner/CropOverlay';
import { colors, radius, spacing, typography, HIT_SLOP, MIN_TOUCH } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

type Flash = 'off' | 'on' | 'auto';

const FLASH_ICON: Record<Flash, keyof typeof MaterialCommunityIcons.glyphMap> = {
  off: 'flash-off',
  on: 'flash',
  auto: 'flash-auto',
};

/**
 * Capture surface only. Everything that happens *to* the pages — reorder,
 * filters, naming, export — lives in the studio (ImgToPdfScreen), so this screen
 * can stay a full-bleed viewfinder with nothing competing for the shutter.
 */
export function ScannerScreen({ navigation, route }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [pages, setPages] = useState<string[]>(route.params?.existingUris ?? []);
  const [flash, setFlash] = useState<Flash>('off');
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);

  // Every image — shot or imported — is offered a crop before it joins `pages`.
  // The queue keeps multi-select imports to one modal at a time, and skipping is
  // always non-destructive: the original goes in untouched.
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const pendingCrop = cropQueue[0] ?? null;

  const enqueueForCrop = useCallback((uris: string[]) => {
    if (!uris.length) return;
    setCropQueue(uris);
    setQueueTotal(uris.length);
  }, []);

  const acceptPage = useCallback((uri: string) => {
    setPages((prev) => [...prev, uri]);
    setCropQueue((prev) => prev.slice(1));
  }, []);

  const keepAsIs = useCallback(() => {
    if (pendingCrop) acceptPage(pendingCrop);
  }, [acceptPage, pendingCrop]);

  const keepAllAsIs = useCallback(() => {
    setPages((prev) => [...prev, ...cropQueue]);
    setCropQueue([]);
  }, [cropQueue]);

  const capture = useCallback(async () => {
    if (!cameraRef.current || capturing || !ready) return;
    setCapturing(true);
    try {
      const photo: CameraCapturedPicture | undefined = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        // Let the native pipeline do orientation/JPEG work; we resize later anyway.
        skipProcessing: false,
      });
      if (photo?.uri) enqueueForCrop([photo.uri]);
    } catch {
      Alert.alert('Capture failed', 'That shot did not come through. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, enqueueForCrop, ready]);

  const chooseImages = useCallback(async (): Promise<string[]> => {
    const granted = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted.granted) {
      Alert.alert(
        'Photo access needed',
        'DocAssistant needs access to your photos to add them as pages. Nothing is uploaded.'
      );
      return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      orderedSelection: true,
    });
    if (result.canceled || !result.assets.length) return [];
    return result.assets.map((a) => a.uri);
  }, []);

  const pickFromGallery = useCallback(async () => {
    enqueueForCrop(await chooseImages());
  }, [chooseImages, enqueueForCrop]);

  const removeLast = useCallback(() => {
    setPages((prev) => prev.slice(0, -1));
  }, []);

  const goToStudio = useCallback(
    (params: RootStackParamList['ImgToPdf']) => {
      // Opened from the studio ("Add page")? Go back to that instance with the
      // merged page list instead of stacking a second studio on top of it.
      const inStack = navigation.getState()?.routes.some((r) => r.name === 'ImgToPdf');
      if (inStack) navigation.navigate('ImgToPdf', params);
      else navigation.replace('ImgToPdf', params);
    },
    [navigation]
  );

  const done = useCallback(() => {
    if (!pages.length) return;
    goToStudio({ initialUris: pages, title: 'Scan' });
  }, [goToStudio, pages]);

  /**
   * Gallery route out of the permission gate. There is no viewfinder to come
   * back to here, so the picks go straight to the studio and it runs the crop
   * queue instead of this screen.
   */
  const pickAndLeave = useCallback(async () => {
    const uris = await chooseImages();
    if (!uris.length) return;
    goToStudio({
      initialUris: [...pages, ...uris],
      title: pages.length ? 'Scan' : 'Images to PDF',
      cropUris: uris,
    });
  }, [chooseImages, goToStudio, pages]);

  const close = useCallback(() => {
    if (!pages.length) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard these pages?', `${pages.length} captured page(s) will be thrown away.`, [
      { text: 'Keep scanning', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }, [navigation, pages.length]);

  // ---- Permission gates -----------------------------------------------------

  if (!permission) {
    return (
      <View style={styles.gate}>
        <ActivityIndicator color={colors.primaryContainer} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.gateSafe}>
        <View style={styles.gateBody}>
          <View style={styles.gateIcon}>
            <MaterialCommunityIcons name="camera-outline" size={30} color={colors.primary} />
          </View>
          <Text style={[typography.headlineMd, styles.gateTitle]}>Camera access</Text>
          <Text style={[typography.bodyLg, styles.gateText]}>
            DocAssistant uses the camera to photograph your pages. The images stay on this device —
            they are never uploaded anywhere.
          </Text>
          <Button
            label={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
            icon="camera-outline"
            size="lg"
            fullWidth
            onPress={() => {
              if (permission.canAskAgain) void requestPermission();
              else
                Alert.alert(
                  'Permission blocked',
                  'Enable the camera for DocAssistant in Android Settings › Apps › DocAssistant › Permissions.'
                );
            }}
            style={styles.gateButton}
          />
          <Button label="Pick from gallery instead" variant="ghost" onPress={pickAndLeave} />
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Viewfinder -----------------------------------------------------------

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
        onCameraReady={() => setReady(true)}
      />

      {/* Framing guides: corner brackets, not a solid overlay. */}
      <View pointerEvents="none" style={styles.guides}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
      </View>

      <SafeAreaView style={styles.topBar} edges={['top', 'left', 'right']}>
        <Pressable
          onPress={close}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          style={styles.glassButton}
        >
          <MaterialCommunityIcons name="close" size={22} color={colors.onPrimary} />
        </Pressable>

        <View style={styles.counterPill}>
          <MaterialCommunityIcons name="file-multiple-outline" size={14} color={colors.onPrimary} />
          <Text style={[typography.labelMd, styles.counterText]}>
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </Text>
        </View>

        <Pressable
          onPress={() => setFlash((f) => (f === 'off' ? 'auto' : f === 'auto' ? 'on' : 'off'))}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Flash ${flash}`}
          style={styles.glassButton}
        >
          <MaterialCommunityIcons name={FLASH_ICON[flash]} size={22} color={colors.onPrimary} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.bottom} edges={['bottom', 'left', 'right']}>
        {pages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {pages.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.stripItem}>
                <Image source={{ uri }} style={styles.stripImage} />
                <View style={styles.stripBadge}>
                  <Text style={[typography.labelSm, styles.stripBadgeText]}>{i + 1}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={[typography.bodyMd, styles.hint]}>
            Fill the frame with the page, then tap the shutter
          </Text>
        )}

        <View style={styles.controls}>
          <Pressable
            onPress={pickFromGallery}
            accessibilityRole="button"
            accessibilityLabel="Add from gallery"
            style={({ pressed }) => [styles.sideButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={22}
              color={colors.onPrimary}
            />
            <Text style={[typography.labelSm, styles.sideLabel]}>Gallery</Text>
          </Pressable>

          <Pressable
            onPress={capture}
            disabled={capturing || !ready}
            accessibilityRole="button"
            accessibilityLabel="Take picture"
            style={({ pressed }) => [styles.shutterOuter, pressed && styles.shutterPressed]}
          >
            <View style={styles.shutterInner}>
              {capturing ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
          </Pressable>

          {pages.length > 0 ? (
            <Pressable
              onPress={done}
              onLongPress={removeLast}
              accessibilityRole="button"
              accessibilityLabel={`Done, ${pages.length} pages. Touch and hold to remove the last page.`}
              style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="check" size={22} color={colors.onPrimary} />
              <Text style={[typography.labelSm, styles.sideLabel]}>Done</Text>
            </Pressable>
          ) : (
            <View style={styles.sideButton} />
          )}
        </View>
      </SafeAreaView>

      <CropOverlay
        visible={pendingCrop !== null}
        uri={pendingCrop}
        title="Crop this page"
        skipLabel="Use as is"
        counter={queueTotal > 1 ? `${queueTotal - cropQueue.length + 1} of ${queueTotal}` : undefined}
        onCropped={acceptPage}
        onCancel={keepAsIs}
        onSkipAll={cropQueue.length > 1 ? keepAllAsIs : undefined}
      />
    </View>
  );
}

const GLASS = 'rgba(15, 23, 42, 0.55)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  gateSafe: { flex: 1, backgroundColor: colors.background },
  gateBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  gateIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  gateTitle: { marginBottom: spacing.xs },
  gateText: { color: colors.onSurfaceVariant, marginBottom: spacing.md },
  gateButton: { marginBottom: spacing.xs },

  guides: {
    ...StyleSheet.absoluteFill,
    margin: spacing.lg,
    marginTop: 110,
    marginBottom: 190,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.md },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.md },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: radius.md,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: radius.md,
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  glassButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.full,
    backgroundColor: GLASS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: GLASS,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  counterText: { color: colors.onPrimary, fontWeight: '700' },

  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  strip: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.sm },
  stripItem: { width: 48, height: 62, borderRadius: radius.sm, overflow: 'hidden' },
  stripImage: { width: '100%', height: '100%' },
  stripBadge: {
    position: 'absolute',
    left: 2,
    top: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    backgroundColor: GLASS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripBadgeText: { color: colors.onPrimary, fontWeight: '700' },
  hint: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingTop: spacing.md,
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sideButton: { width: 64, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH },
  doneButton: {
    width: 64,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideLabel: { color: colors.onPrimary, marginTop: 2 },
  pressed: { opacity: 0.7 },

  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ScannerScreen;
