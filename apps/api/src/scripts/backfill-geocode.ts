// One-time manual backfill for CustomerProfile rows that predate real
// address geocoding (see common/utils/geocode.utils.ts) — new profiles are
// geocoded automatically at registration/admin-edit time; this only needs
// to run once against existing data. Not wired into any module/controller —
// run manually via:
//   cd apps/api && npx ts-node -r tsconfig-paths/register src/scripts/backfill-geocode.ts
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { CustomerProfile } from '../users/entities/customer-profile.entity';
import { geocodeAddress } from '../common/utils/geocode.utils';

// Nominatim's usage policy caps free use at ~1 request/sec.
const DELAY_MS = 1100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repo = app.get<Repository<CustomerProfile>>(getRepositoryToken(CustomerProfile));

  const profiles = await repo
    .createQueryBuilder('cp')
    .where('cp.address IS NOT NULL AND cp.address != \'\'')
    .andWhere('cp.latitude IS NULL')
    .getMany();

  console.log(`Found ${profiles.length} profile(s) to geocode.`);

  let succeeded = 0;
  let failed = 0;
  for (const profile of profiles) {
    const coords = await geocodeAddress(profile.address, profile.city, profile.state, profile.zipCode);
    if (coords) {
      await repo.update(profile.id, { latitude: coords.lat, longitude: coords.lng });
      succeeded++;
      console.log(`OK   ${profile.id}  ${profile.address}, ${profile.city}, ${profile.state} -> ${coords.lat}, ${coords.lng}`);
    } else {
      failed++;
      console.log(`FAIL ${profile.id}  ${profile.address}, ${profile.city}, ${profile.state}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done. ${succeeded} geocoded, ${failed} failed.`);
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
