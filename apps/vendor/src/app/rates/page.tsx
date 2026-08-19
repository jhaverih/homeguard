'use client';
import { useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';

type RateItem = { id: string; name: string; shapeTag: string; rateText: string };
type PackageItem = { id: string; label: string; includedServiceLabels: string[]; compensationText: string };
type MowingTier = { label: string; vendorRateText: string; adderText: string };

type RatesResponse = {
  catalogGroups: { group: string; label: string; items: RateItem[] }[];
  lawncare: { packages: PackageItem[]; mowingTiers: MowingTier[] | null; services: RateItem[] } | null;
  pest: { packages: PackageItem[]; services: RateItem[] } | null;
  houseCleaning: { plans: RateItem[] } | null;
  templates: { id: string; name: string; packages: PackageItem[]; services: RateItem[] }[];
};

function ShapeTag({ text }: { text: string }) {
  return (
    <span className="text-[9.5px] font-extrabold uppercase tracking-wide text-steel bg-canvas border border-mist-dim px-2 py-0.5 rounded-full whitespace-nowrap">
      {text}
    </span>
  );
}

function ServiceCard({ item }: { item: RateItem }) {
  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-ink text-[15px]">{item.name}</h3>
        <ShapeTag text={item.shapeTag} />
      </div>
      <div className="pt-3 border-t border-mist-dim flex items-baseline gap-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-steel flex-shrink-0">Compensation</span>
        <span className="text-[13.5px] font-bold text-lantern-deep">{item.rateText}</span>
      </div>
    </div>
  );
}

function PackageCard({ pkg }: { pkg: PackageItem }) {
  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-ink text-[15px]">{pkg.label}</h3>
        <ShapeTag text="Package" />
      </div>
      <div className="text-[11px] font-bold text-steel mb-2">Services included in vendor work orders</div>
      <ul className="mb-4 space-y-1.5">
        {pkg.includedServiceLabels.map((label) => (
          <li key={label} className="text-[13.5px] text-slate pl-4 relative">
            <span className="absolute left-0 top-[7px] w-[5px] h-[5px] rounded-full bg-lantern-deep" />
            {label}
          </li>
        ))}
        <li className="text-[13.5px] text-slate pl-4 relative">
          <span className="absolute left-0 top-[7px] w-[5px] h-[5px] rounded-full bg-lantern-deep" />
          Other applicable services based on work order
        </li>
      </ul>
      <div className="pt-3 border-t border-mist-dim flex items-baseline gap-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-steel flex-shrink-0">Compensation</span>
        <span className="text-[13.5px] font-bold text-lantern-deep">{pkg.compensationText}</span>
      </div>
    </div>
  );
}

function MowingTierTable({ tiers }: { tiers: MowingTier[] }) {
  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-ink text-[15px]">Lawn Mowing — Size Tiers</h3>
        <ShapeTag text="Size-Based" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-[10.5px] font-extrabold uppercase tracking-wide text-steel pb-2 border-b border-mist-dim">Lot size</th>
              <th className="text-right text-[10.5px] font-extrabold uppercase tracking-wide text-steel pb-2 border-b border-mist-dim">Vendor rate</th>
              <th className="text-right text-[10.5px] font-extrabold uppercase tracking-wide text-steel pb-2 border-b border-mist-dim">Adder / 1,000 sq ft</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.label}>
                <td className="py-2.5 border-b border-mist-dim last:border-0 font-semibold text-ink">{t.label}</td>
                <td className="py-2.5 border-b border-mist-dim last:border-0 text-right font-bold text-lantern-deep">{t.vendorRateText}</td>
                <td className="py-2.5 border-b border-mist-dim last:border-0 text-right text-steel">{t.adderText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Vertical({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[12px] font-extrabold uppercase tracking-wide text-steel">{label}</h2>
        <div className="flex-1 h-px bg-mist-dim" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function RatesPage() {
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendorApi.getRates().then(setRates).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-steel p-8">Loading...</div>;
  if (!rates) return <div className="text-steel p-8">Couldn&apos;t load your rates. Please refresh.</div>;

  const hasAnything =
    rates.catalogGroups.length > 0 || rates.lawncare || rates.pest || rates.houseCleaning || rates.templates.length > 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">My Rates</h1>
      <p className="text-steel mb-6">What Attenteve pays your company for the services on your capability list — grouped the way work orders are.</p>

      <div className="flex gap-3 items-start bg-ink rounded-2xl px-5 py-4 mb-8">
        <div className="w-7 h-7 rounded-lg bg-lantern/20 text-lantern flex items-center justify-center flex-shrink-0 text-sm">🔒</div>
        <p className="text-[13px] text-mist-dim leading-relaxed">
          <strong className="text-mist font-bold">Rates negotiated with Attenteve for your company.</strong> Rates are confidential and may not be shared with other vendors.
        </p>
      </div>

      {!hasAnything && (
        <p className="text-steel text-sm py-6 text-center">No rates to show yet — select your capabilities under &quot;My Capabilities&quot; to see the services your company is contracted for.</p>
      )}

      {rates.catalogGroups.map((g) => (
        <Vertical key={g.group} label={g.label}>
          {g.items.map((item) => <ServiceCard key={item.id} item={item} />)}
        </Vertical>
      ))}

      {rates.lawncare && (
        <Vertical label="Lawn Care">
          {rates.lawncare.packages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
          {rates.lawncare.mowingTiers && <MowingTierTable tiers={rates.lawncare.mowingTiers} />}
          {rates.lawncare.services.map((item) => <ServiceCard key={item.id} item={item} />)}
        </Vertical>
      )}

      {rates.pest && (
        <Vertical label="Pest Control">
          {rates.pest.packages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
          {rates.pest.services.map((item) => <ServiceCard key={item.id} item={item} />)}
        </Vertical>
      )}

      {rates.houseCleaning && (
        <Vertical label="House Cleaning">
          {rates.houseCleaning.plans.map((item) => <ServiceCard key={item.id} item={item} />)}
        </Vertical>
      )}

      {rates.templates.map((tpl) => (
        <Vertical key={tpl.id} label={tpl.name}>
          {tpl.packages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
          {tpl.services.map((item) => <ServiceCard key={item.id} item={item} />)}
        </Vertical>
      ))}
    </div>
  );
}
