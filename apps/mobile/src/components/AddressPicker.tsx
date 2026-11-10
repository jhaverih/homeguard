import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '../theme';

export const US_STATES: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
};

export type AddressResult = { address: string; city: string; state: string; zipCode: string };

// Nominatim's free-text /search endpoint often matches a residential street
// as a road-level result with no addr.house_number attached — common for
// newer subdivisions OSM hasn't imported address-interpolation data for —
// even though the street/city/state/zip context it found is correct. When
// that happens, fall back to the house number the user actually typed
// (assumed to be the leading number of their query) rather than silently
// dropping it.
function formatAddressResult(item: any, rawQuery: string): AddressResult {
  const addr = item.address || {};
  const typedHouseNumber = rawQuery.trim().match(/^(\d+[a-zA-Z]?)\b/)?.[1] ?? '';
  const houseNumber = addr.house_number || typedHouseNumber;
  const road = addr.road || addr.pedestrian || addr.footway || '';
  const street = [houseNumber, road].filter(Boolean).join(' ');
  const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
  const stateName = addr.state || '';
  const state = US_STATES[stateName] || stateName.slice(0, 2).toUpperCase();
  const zipCode = (addr.postcode || '').slice(0, 5);
  return { address: street || item.display_name.split(',')[0], city, state, zipCode };
}

// Short "#, street, city, state zip" label — Nominatim's own display_name
// is a full place-name string (road, neighborhood, county, region, country)
// that's far noisier than what a user needs to confirm this is their address.
function formatSuggestionLabel(item: any, rawQuery: string): string {
  const r = formatAddressResult(item, rawQuery);
  const cityState = [r.city, r.state].filter(Boolean).join(', ');
  const tail = [cityState, r.zipCode].filter(Boolean).join(' ');
  return [r.address, tail].filter(Boolean).join(', ');
}

export function AddressPicker({
  onSelect,
  validated,
  onClear,
  placeholder = 'Search your home address...',
}: {
  onSelect: (addr: AddressResult) => void;
  validated: boolean;
  onClear: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Soft proximity bias only — never blocks or requires location. Grabbed
  // once when this step of the form mounts, since the user is about to
  // search for an address right after.
  const biasRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        const granted = existing.status === 'granted'
          ? true
          : (await Location.requestForegroundPermissionsAsync()).status === 'granted';
        if (!granted) return;
        const last = await Location.getLastKnownPositionAsync();
        const pos = last ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        biasRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      } catch {
        // Best-effort only — suggestions work fine unbiased.
      }
    })();
  }, []);

  const search = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 5) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // bounded=0 makes the viewbox a soft preference, not a hard filter —
        // an address far from the phone's current location can still match,
        // it's just not favored over an equally-good nearby match.
        const bias = biasRef.current;
        const biasParams = bias
          ? `&viewbox=${bias.lon - 0.5},${bias.lat + 0.5},${bias.lon + 0.5},${bias.lat - 0.5}&bounded=0`
          : '';
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&q=${encodeURIComponent(text)}&limit=6${biasParams}`,
          { headers: { 'User-Agent': 'AttenteveApp/1.0' } }
        );
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const pick = (item: any) => {
    const result = formatAddressResult(item, query);
    setSuggestions([]);
    setQuery(result.address);
    onSelect(result);
    // This field's job is done once an address is picked — scrolling
    // content up to try to clear a keyboard that's still animating open is
    // fighting a moving target and landed short in testing. Dismissing it
    // outright is the standard pattern (Google Maps, Uber, etc. all do this
    // on autocomplete selection) and guarantees the confirmation is visible
    // regardless of screen size or animation timing.
    Keyboard.dismiss();
  };

  return (
    <View style={{ zIndex: 200 }}>
      <View style={addrStyles.inputWrap}>
        <Ionicons name="search-outline" size={18} color={colors.steel} style={addrStyles.searchIcon} />
        <TextInput
          style={addrStyles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={colors.steel}
          value={query}
          onChangeText={search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={colors.lanternDeep} style={{ marginRight: 8 }} />}
        {validated && !searching && (
          <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); onClear(); }}>
            <Ionicons name="close-circle" size={20} color={colors.steel} style={{ marginRight: 8 }} />
          </TouchableOpacity>
        )}
      </View>
      {suggestions.length > 0 && (
        <View style={addrStyles.dropdown}>
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.place_id}
              onPress={() => pick(item)}
              style={addrStyles.suggestion}
            >
              <Ionicons name="location-outline" size={14} color={colors.lanternDeep} style={{ marginRight: 8, flexShrink: 0 }} />
              <Text style={addrStyles.suggestionText} numberOfLines={2}>{formatSuggestionLabel(item, query)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const addrStyles = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, marginBottom: 4,
  },
  searchIcon: { marginLeft: 14 },
  searchInput: {
    flex: 1, padding: 15, fontSize: 16, color: colors.ink,
  },
  dropdown: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, marginBottom: 8, overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  suggestionText: { fontSize: 13, color: colors.ink, flex: 1, lineHeight: 18 },
});
