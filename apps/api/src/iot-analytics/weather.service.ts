import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { Home } from './entities/home.entity';
import { TelemetryDataQuality, TelemetryEvent } from './entities/telemetry-event.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { DeviceRegistryService } from './device-registry.service';
import { TelemetryService } from './telemetry.service';
import { EquipmentType, MeasurementType, SensorRole } from '../common/enums/sensor-role.enum';

export const WEATHER_PROVIDER = 'weather';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// An outdoor reading older than this isn't used to classify conditions.
const OUTDOOR_MAX_AGE_HOURS = 3;
export const UNKNOWN_BAND = 'UNKNOWN';

// 10°F buckets ("80s", "90s") — "comparable conditions" for cycle runtime
// and refrigerant-line baselines means the same bucket.
export function outdoorBand(tempF: number | null): string {
  if (tempF == null || !Number.isFinite(tempF)) return UNKNOWN_BAND;
  return `${Math.floor(tempF / 10) * 10}s`;
}

// Outdoor temperature for each monitored home from Open-Meteo (free, no API
// key), recorded as ordinary HVAC_OUTDOOR_TEMP telemetry (provider
// "weather") so it lives in the same history as everything else. Optional
// by design: if geocoding or the weather API fails, rules fall back to an
// "all conditions" baseline (band UNKNOWN) and say so in their evidence.
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private lastFailure: string | null = null;

  constructor(
    @InjectRepository(Home) private homeRepo: Repository<Home>,
    @InjectRepository(YolinkHome) private yolinkHomesRepo: Repository<YolinkHome>,
    @InjectRepository(TelemetryEvent) private telemetryRepo: Repository<TelemetryEvent>,
    private deviceRegistryService: DeviceRegistryService,
    private telemetryService: TelemetryService,
  ) {}

  @Cron('0 7 * * * *')
  async recordOutdoorTemperatures(): Promise<void> {
    const homes = await this.yolinkHomesRepo.find({ where: { isActive: true } });
    for (const yh of homes) {
      if (!yh.homeId) continue;
      await this.recordForHome(yh.homeId).catch((e) => this.noteFailure(`Outdoor temperature unavailable for home ${yh.homeId}: ${e.message}`));
    }
  }

  async recordForHome(homeId: string): Promise<void> {
    const home = await this.homeRepo.findOne({ where: { id: homeId } });
    if (!home) return;
    const coords = await this.coordinatesFor(home);
    if (!coords) return;
    const url = `${OPEN_METEO}?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m&temperature_unit=fahrenheit&timezone=UTC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const body = await res.json();
    const tempF = body?.current?.temperature_2m;
    const time = body?.current?.time;
    if (typeof tempF !== 'number') throw new Error('Open-Meteo returned no temperature');

    const device = await this.deviceRegistryService.upsertFromProvider(homeId, WEATHER_PROVIDER, `${homeId}:outdoor`, { deviceType: 'OpenMeteo', name: 'Outdoor temperature (weather)' }, {
      sensorRole: SensorRole.HVAC_OUTDOOR_TEMP, analyticsRole: 'HVAC_OUTDOOR_TEMPERATURE', measurementType: MeasurementType.TEMPERATURE,
      equipmentType: EquipmentType.HVAC, equipmentNumber: '01',
    });
    const found = await this.deviceRegistryService.getDeviceAndAssignment(device.id);
    if (!found) return;
    // Open-Meteo's `time` is the model's observation time (UTC, no zone suffix).
    const observedAt = typeof time === 'string' ? new Date(`${time}Z`) : new Date();
    await this.telemetryService.record(found.device, found.assignment, String(tempF), tempF, '°F', { source: 'open-meteo', ...body.current }, observedAt, { retrievedAt: new Date() });
    if (this.lastFailure) { this.logger.log('Outdoor temperature recovered'); this.lastFailure = null; }
  }

  // Latest outdoor temperature at or before `at` for a home, if recent enough.
  async outdoorTempAt(homeId: string, at: Date): Promise<number | null> {
    const row = await this.telemetryRepo.findOne({
      where: {
        homeId, sensorRole: SensorRole.HVAC_OUTDOOR_TEMP, dataQuality: TelemetryDataQuality.VALID,
        observedAt: LessThanOrEqual(at) as any,
      },
      order: { observedAt: 'DESC' },
    });
    if (!row || at.getTime() - row.observedAt.getTime() > OUTDOOR_MAX_AGE_HOURS * 3600_000) return null;
    return row.numericValue != null ? Number(row.numericValue) : null;
  }

  async outdoorBandAt(homeId: string, at: Date): Promise<string> {
    return outdoorBand(await this.outdoorTempAt(homeId, at));
  }

  async hasRecentReading(homeId: string): Promise<boolean> {
    const since = new Date(Date.now() - OUTDOOR_MAX_AGE_HOURS * 3600_000);
    return (await this.telemetryRepo.count({ where: { homeId, sensorRole: SensorRole.HVAC_OUTDOOR_TEMP, observedAt: MoreThan(since) } })) > 0;
  }

  // Cached on Home.address as { lat, lng } — set manually there to override,
  // otherwise geocoded once from the home's free-text address.
  private async coordinatesFor(home: Home): Promise<{ lat: number; lng: number } | null> {
    const cached = home.address as { lat?: number; lng?: number; raw?: string } | null;
    if (typeof cached?.lat === 'number' && typeof cached?.lng === 'number') return { lat: cached.lat, lng: cached.lng };
    const raw = cached?.raw ?? (await this.yolinkHomesRepo.findOne({ where: { homeId: home.id } }))?.address;
    if (!raw) return null;
    const params = new URLSearchParams({ q: raw, format: 'json', limit: '1', countrycodes: 'us' });
    const res = await fetch(`${NOMINATIM}?${params}`, { headers: { 'User-Agent': 'AttenteveApp/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
    const data = await res.json();
    const lat = parseFloat(data?.[0]?.lat);
    const lng = parseFloat(data?.[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('address could not be geocoded');
    // ~1 km precision is plenty for weather and avoids storing an exact location.
    const rounded = { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
    home.address = { ...(cached ?? {}), raw, ...rounded };
    await this.homeRepo.save(home);
    return rounded;
  }

  private noteFailure(message: string) {
    if (this.lastFailure === message) return;
    this.lastFailure = message;
    this.logger.warn(message);
  }
}
