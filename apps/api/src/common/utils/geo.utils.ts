import zipCentroids from '../data/zip-centroids.json';

const ZIP_CENTROIDS: Record<string, number[]> = zipCentroids;

export function getZipCentroid(zip: string): { lat: number; lng: number } | null {
  const normalized = zip?.trim().slice(0, 5);
  const entry = normalized ? ZIP_CENTROIDS[normalized] : undefined;
  return entry ? { lat: entry[0], lng: entry[1] } : null;
}

// Great-circle distance in miles — direct server-side port of the haversine
// formula already used client-side in apps/mobile/app/(customer)/index.tsx
// for the vendor-en-route ETA display (that one works in km; this one in
// miles, since service-radius is customer-facing in miles).
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
