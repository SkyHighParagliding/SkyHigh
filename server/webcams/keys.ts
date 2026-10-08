export const VARIANT_SUFFIX = {
  thumb: "-thumb.jpg",
  medium: "-medium.jpg",
  original: "-orig.jpg",
} as const;

export type Variant = keyof typeof VARIANT_SUFFIX;

/** Storage key prefix for one image, e.g. webcams/three-sisters-flowerdale/20261008/north-060559 */
export function frameKeyBase(siteId: string, ymd: string, camera: string, localTime: string): string {
  const safeSite = siteId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `webcams/${safeSite}/${ymd}/${camera}-${localTime.replace(/:/g, "")}`;
}

export function variantKeys(keyBase: string): Record<Variant, string> {
  return {
    thumb: `${keyBase}${VARIANT_SUFFIX.thumb}`,
    medium: `${keyBase}${VARIANT_SUFFIX.medium}`,
    original: `${keyBase}${VARIANT_SUFFIX.original}`,
  };
}
