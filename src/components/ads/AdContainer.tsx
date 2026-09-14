import React from 'react';

import { areAdsEnabled, getAdUnitId } from '../../services/adService';
import type { AdUnitId } from '../../constants/config';
import { BannerPlaceholder } from './BannerPlaceholder';

export interface AdContainerProps {
  unit: AdUnitId;
  height?: number;
  /** Dev affordance: render the dashed slot outline even while ads are off. */
  debugPlaceholder?: boolean;
}

/**
 * The only thing screens mount for a banner slot.
 *
 * V1 returns null — no wrapper View, no margin, no reserved height — so the
 * surrounding layout is byte-for-byte what it would be with the component
 * deleted. That is what makes "zero ads in V1" honest rather than "ads that
 * happen to be invisible".
 */
export function AdContainer({ unit, height = 50, debugPlaceholder = false }: AdContainerProps) {
  if (!areAdsEnabled()) {
    return debugPlaceholder ? <BannerPlaceholder height={height} /> : null;
  }

  // TODO(v2): render the provider banner here, e.g.
  //   <BannerAd unitId={getAdUnitId(unit)} size={BannerAdSize.BANNER} />
  // Reserve `height` while it loads so the screen does not jump on fill.
  void getAdUnitId(unit);
  return null;
}

export default AdContainer;
