import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, Filter, FeColorMatrix, Image as SvgImage } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';

import { matrixString, isIdentityFilter, type ScanFilter } from './imageFilters';

/**
 * Live preview of a filtered page. Cheap enough to use in thumbnails and in the
 * full-size viewer, and it is the same code path the export uses, so what you
 * see is what gets baked into the PDF.
 */
export function FilteredImage({
  uri,
  filter,
  width,
  height,
  borderRadius = 0,
}: {
  uri: string;
  filter: ScanFilter;
  width: number | string;
  height: number | string;
  borderRadius?: number;
}) {
  if (isIdentityFilter(filter)) {
    return (
      <Image
        source={{ uri }}
        style={{ width: width as number, height: height as number, borderRadius }}
        resizeMode="cover"
      />
    );
  }

  const id = `f-${filter}`;
  return (
    <View style={{ width: width as number, height: height as number, borderRadius, overflow: 'hidden' }}>
      <Svg width="100%" height="100%">
        <Defs>
          <Filter id={id} x="0" y="0" width="100%" height="100%">
            <FeColorMatrix type="matrix" values={matrixString(filter)} />
          </Filter>
        </Defs>
        <SvgImage
          href={{ uri }}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid slice"
          filter={`url(#${id})`}
        />
      </Svg>
    </View>
  );
}

interface Job {
  uri: string;
  filter: ScanFilter;
  width: number;
  height: number;
  resolve: (uri: string) => void;
  reject: (err: Error) => void;
}

/**
 * Off-screen renderer that bakes a filter into a real file.
 *
 * Mount `node` once somewhere in the screen's tree (it is positioned off-screen
 * and non-interactive), then await `apply(uri, filter)` to get back a new file
 * URI with the filter applied. `original` short-circuits to the input URI.
 */
export function useFilterBaker() {
  const [job, setJob] = useState<Job | null>(null);
  const svgRef = useRef<Svg>(null);
  const jobRef = useRef<Job | null>(null);
  jobRef.current = job;

  const apply = useCallback(
    (uri: string, filter: ScanFilter): Promise<string> => {
      if (isIdentityFilter(filter)) return Promise.resolve(uri);

      return new Promise<string>((resolve, reject) => {
        Image.getSize(
          uri,
          (width, height) => setJob({ uri, filter, width, height, resolve, reject }),
          () => reject(new Error('That image could not be read.'))
        );
      });
    },
    []
  );

  useEffect(() => {
    if (!job) return undefined;

    // react-native-svg has no load event for <Image>, so we give the decode a
    // frame or two to land before reading the surface back. The source is a
    // local file that Image.getSize already touched, so it is warm in cache.
    const timer = setTimeout(() => {
      const node = svgRef.current as unknown as
        | { toDataURL?: (cb: (data: string) => void) => void }
        | null;

      if (!node?.toDataURL) {
        job.reject(new Error('Filters are not supported on this device.'));
        setJob(null);
        return;
      }

      node.toDataURL(async (base64) => {
        try {
          const dir = FileSystem.cacheDirectory ?? '';
          const target = `${dir}filtered-${job.filter}-${Date.now()}.png`;
          await FileSystem.writeAsStringAsync(target, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          job.resolve(target);
        } catch (err) {
          job.reject(err instanceof Error ? err : new Error('The filter could not be applied.'));
        } finally {
          setJob(null);
        }
      });
    }, 220);

    return () => clearTimeout(timer);
  }, [job]);

  // Cap the offscreen surface so a 12MP capture does not allocate a huge bitmap.
  const MAX_EDGE = 2000;
  const scale = job ? Math.min(1, MAX_EDGE / Math.max(job.width, job.height)) : 1;
  const outW = job ? Math.round(job.width * scale) : 0;
  const outH = job ? Math.round(job.height * scale) : 0;

  const node = job ? (
    <View style={styles.offscreen} pointerEvents="none">
      <Svg ref={svgRef} width={outW} height={outH}>
        <Defs>
          <Filter id="bake" x="0" y="0" width="100%" height="100%">
            <FeColorMatrix type="matrix" values={matrixString(job.filter)} />
          </Filter>
        </Defs>
        <SvgImage
          href={{ uri: job.uri }}
          width={outW}
          height={outH}
          preserveAspectRatio="xMidYMid meet"
          filter="url(#bake)"
        />
      </Svg>
    </View>
  ) : null;

  return { apply, node, busy: Boolean(job) };
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: -10000, opacity: 0 },
});
