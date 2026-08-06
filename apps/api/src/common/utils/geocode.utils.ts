// Server-side counterpart to the Nominatim address autocomplete already used
// client-side at registration (apps/mobile/app/(auth)/register.tsx) — same
// free OSM geocoder, same User-Agent convention, but a structured lookup
// (known street/city/state/zip) instead of free-text search-as-you-type.
// Best-effort only: never throws, so a geocoding hiccup can never block
// registration or an address save.
export async function geocodeAddress(
  address: string | undefined,
  city: string | undefined,
  state: string | undefined,
  zipCode: string | undefined,
): Promise<{ lat: number; lng: number } | null> {
  if (!address || !city || !state) return null;
  try {
    const params = new URLSearchParams({
      street: address,
      city,
      state,
      postalcode: zipCode || '',
      country: 'us',
      format: 'json',
      limit: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { 'User-Agent': 'AttenteveApp/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
