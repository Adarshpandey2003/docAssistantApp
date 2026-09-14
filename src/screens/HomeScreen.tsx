import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';

import { Card, OfflineBadge } from '../components/common';
import AdContainer from '../components/ads/AdContainer';
import {
  colors,
  radius,
  spacing,
  toolAccents,
  typography,
  HIT_SLOP,
  MIN_TOUCH,
  type ToolAccent,
} from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  deleteDocument,
  formatDocumentMeta,
  listDocumentsPruned,
  type DocumentMeta,
} from '../services/storageService';
import { sharePdf } from '../services/pdfService';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const RECENT_COLLAPSED = 4;

export function HomeScreen({ navigation }: Props) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocuments(await listDocumentsPruned());
    } catch {
      setDocuments([]);
    }
  }, []);

  // Re-read on focus so a document saved in a tool screen shows up immediately.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const pickImages = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'DocAssistant needs access to your photos to turn them into a PDF. Nothing is uploaded.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      orderedSelection: true,
    });

    if (result.canceled || !result.assets.length) return;
    const uris = result.assets.map((a) => a.uri);
    // The studio offers a crop for each one before anything else happens.
    navigation.navigate('ImgToPdf', {
      initialUris: uris,
      title: 'Images to PDF',
      cropUris: uris,
    });
  }, [navigation]);

  const onShare = useCallback(async (doc: DocumentMeta) => {
    try {
      await sharePdf(doc.uri, doc.name);
    } catch (err) {
      Alert.alert('Could not share', err instanceof Error ? err.message : 'Please try again.');
    }
  }, []);

  const onDelete = useCallback(
    (doc: DocumentMeta) => {
      Alert.alert('Delete this document?', `“${doc.name}” will be removed from this device.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDocument(doc.id);
            await load();
          },
        },
      ]);
    },
    [load]
  );

  const visible = showAll ? documents : documents.slice(0, RECENT_COLLAPSED);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={typography.headlineLgMobile}>Your documents</Text>
            <Text style={[typography.bodyMd, styles.subtitle]}>Everything stays on this phone</Text>
          </View>
          <Pressable
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() =>
              Alert.alert(
                'DocAssistant',
                'Version 1.0 — offline only.\n\nNo account, no ads, no analytics. Your documents are stored in this app’s private folder and are never uploaded.'
              )
            }
            style={({ pressed }) => [styles.settings, pressed && styles.settingsPressed]}
          >
            <MaterialCommunityIcons name="cog-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>

        <OfflineBadge style={styles.offline} />

        {/* Quick actions */}
        <Text style={[typography.titleMd, styles.sectionLabel]}>Quick actions</Text>

        <HeroTile
          title="Scan Document"
          caption="Capture pages with your camera"
          icon="camera-outline"
          onPress={() => navigation.navigate('Scanner')}
        />

        <View style={styles.grid}>
          <ToolTile
            title="Images to PDF"
            caption="Combine photos into one file"
            icon="image-multiple-outline"
            accent="images"
            onPress={pickImages}
          />
          <ToolTile
            title="Word to PDF"
            caption="Convert .docx instantly"
            icon="file-document-outline"
            accent="word"
            onPress={() => navigation.navigate('WordToPdf')}
          />
          <ToolTile
            title="Sign Document"
            caption="Draw and place your signature"
            icon="draw-pen"
            accent="sign"
            onPress={() => navigation.navigate('Sign', {})}
          />
          <ToolTile
            title="Compress PDF"
            caption="Shrink big files down"
            icon="arrow-collapse-vertical"
            accent="compress"
            onPress={() => navigation.navigate('Compress', {})}
          />
        </View>

        {/* Recent documents */}
        <View style={styles.recentHeader}>
          <Text style={typography.titleMd}>Recent documents</Text>
          {documents.length > RECENT_COLLAPSED ? (
            <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={HIT_SLOP}>
              <Text style={[typography.labelMd, styles.link]}>
                {showAll ? 'Show less' : 'See all'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {visible.length === 0 ? (
          <EmptyRecents />
        ) : (
          visible.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onShare={() => onShare(doc)}
              onDelete={() => onDelete(doc)}
              onOpenSign={() => navigation.navigate('Sign', { documentId: doc.id })}
            />
          ))
        )}

        {/* Renders null in V1 — see AdContainer. */}
        <AdContainer unit="homeBanner" />

        <View style={styles.footer}>
          <MaterialCommunityIcons name="shield-lock-outline" size={13} color={colors.outline} />
          <Text style={[typography.labelSm, styles.footerText]}>
            Local storage only · Zero cloud sync
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

function HeroTile({
  title,
  caption,
  icon,
  onPress,
}: {
  title: string;
  caption: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${caption}`}
      style={({ pressed }) => [styles.hero, pressed && styles.tilePressed]}
    >
      <View style={styles.heroIcon}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.onPrimary} />
      </View>
      <View style={styles.heroText}>
        <Text style={[typography.titleMd, styles.heroTitle]}>{title}</Text>
        <Text style={[typography.bodyMd, styles.heroCaption]}>{caption}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onPrimary} />
    </Pressable>
  );
}

function ToolTile({
  title,
  caption,
  icon,
  accent,
  onPress,
}: {
  title: string;
  caption: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: ToolAccent;
  onPress: () => void;
}) {
  const { tint, fg } = toolAccents[accent];
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}. ${caption}`}
      style={styles.tile}
      padded={false}
    >
      <View style={styles.tileInner}>
        <View style={[styles.tileIcon, { backgroundColor: tint }]}>
          <MaterialCommunityIcons name={icon} size={20} color={fg} />
        </View>
        <Text style={[typography.titleMd, styles.tileTitle]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[typography.labelMd, styles.tileCaption]} numberOfLines={2}>
          {caption}
        </Text>
      </View>
    </Card>
  );
}

function DocumentRow({
  doc,
  onShare,
  onDelete,
  onOpenSign,
}: {
  doc: DocumentMeta;
  onShare: () => void;
  onDelete: () => void;
  onOpenSign: () => void;
}) {
  return (
    <Card style={styles.row} padded={false} onPress={onOpenSign} accessibilityLabel={doc.name}>
      <View style={styles.rowInner}>
        <View style={styles.thumb}>
          <MaterialCommunityIcons
            name="file-pdf-box"
            size={24}
            color={toolAccents.pdf.fg}
          />
        </View>

        <View style={styles.rowText}>
          <Text style={[typography.titleMd, styles.rowTitle]} numberOfLines={1}>
            {doc.name}
          </Text>
          <Text style={typography.labelMd} numberOfLines={1}>
            {formatDocumentMeta(doc)}
          </Text>
        </View>

        <Pressable
          onPress={onShare}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Share ${doc.name}`}
          style={({ pressed }) => [styles.rowAction, pressed && styles.rowActionPressed]}
        >
          <MaterialCommunityIcons
            name="share-variant-outline"
            size={19}
            color={colors.onSurfaceVariant}
          />
        </Pressable>

        <Pressable
          onPress={onDelete}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${doc.name}`}
          style={({ pressed }) => [styles.rowAction, pressed && styles.rowActionPressed]}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.error} />
        </Pressable>
      </View>
    </Card>
  );
}

function EmptyRecents() {
  return (
    <Card style={styles.empty}>
      <MaterialCommunityIcons name="file-outline" size={28} color={colors.outline} />
      <Text style={[typography.titleMd, styles.emptyTitle]}>Nothing here yet</Text>
      <Text style={[typography.bodyMd, styles.emptyBody]}>
        Documents you scan, convert, sign or compress will appear here.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: spacing.sm },
  headerText: { flex: 1 },
  subtitle: { marginTop: 2 },
  settings: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsPressed: { backgroundColor: colors.surfaceHigh },
  offline: { marginTop: spacing.sm + 4 },

  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm + 4 },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, marginLeft: spacing.md },
  heroTitle: { color: colors.onPrimary, fontSize: 17 },
  heroCaption: { color: 'rgba(255,255,255,0.88)' },
  tilePressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  tile: { width: '47.6%', borderRadius: radius.xl, flexGrow: 1 },
  tileInner: { padding: spacing.md, minHeight: 136 },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm + 4,
  },
  tileTitle: { fontSize: 15 },
  tileCaption: { marginTop: 2 },

  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 4,
  },
  link: { color: colors.primary, fontWeight: '600' },

  row: { marginBottom: spacing.sm + 4 },
  rowInner: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm + 4 },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: toolAccents.pdf.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, marginLeft: spacing.sm + 4, marginRight: spacing.xs },
  rowTitle: { fontSize: 15 },
  rowAction: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActionPressed: { backgroundColor: colors.surfaceHigh },

  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyTitle: { marginTop: spacing.sm },
  emptyBody: { textAlign: 'center', marginTop: spacing.xs },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    gap: spacing.xs + 2,
  },
  footerText: { color: colors.outline },
});

export default HomeScreen;
