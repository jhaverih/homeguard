'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { vendorApi } from '@/lib/api';

const emptyQuote = {
  systemSizeKw: '', numInverters: '', inverterManufacturer: '', inverterModel: '', pvSystemPrice: '',
  storageSizeKwh: '', storageManufacturer: '', storageModel: '', storagePrice: '',
};

export default function JobReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [solarQuote, setSolarQuote] = useState<any>(null);
  const [quoteForm, setQuoteForm] = useState(emptyQuote);
  const [editingQuote, setEditingQuote] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const load = () => {
    vendorApi.getJobReport(id).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
    vendorApi.getSolarQuote(id).then((q) => {
      setSolarQuote(q);
      if (q) {
        setQuoteForm({
          systemSizeKw: String(q.systemSizeKw ?? ''),
          numInverters: String(q.numInverters ?? ''),
          inverterManufacturer: q.inverterManufacturer ?? '',
          inverterModel: q.inverterModel ?? '',
          pvSystemPrice: String(q.pvSystemPrice ?? ''),
          storageSizeKwh: q.storageSizeKwh != null ? String(q.storageSizeKwh) : '',
          storageManufacturer: q.storageManufacturer ?? '',
          storageModel: q.storageModel ?? '',
          storagePrice: q.storagePrice != null ? String(q.storagePrice) : '',
        });
      }
    }).catch(() => setSolarQuote(null));
  };

  useEffect(() => { load(); }, [id]);

  const submitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuoteError('');
    if (!quoteForm.systemSizeKw || !quoteForm.numInverters || !quoteForm.inverterManufacturer || !quoteForm.inverterModel || !quoteForm.pvSystemPrice) {
      setQuoteError('System size, inverter count/manufacturer/model, and PV system price are required.');
      return;
    }
    setSavingQuote(true);
    try {
      await vendorApi.submitSolarQuote(id, {
        systemSizeKw: Number(quoteForm.systemSizeKw),
        numInverters: Number(quoteForm.numInverters),
        inverterManufacturer: quoteForm.inverterManufacturer,
        inverterModel: quoteForm.inverterModel,
        pvSystemPrice: Number(quoteForm.pvSystemPrice),
        storageSizeKwh: quoteForm.storageSizeKwh ? Number(quoteForm.storageSizeKwh) : undefined,
        storageManufacturer: quoteForm.storageManufacturer || undefined,
        storageModel: quoteForm.storageModel || undefined,
        storagePrice: quoteForm.storagePrice ? Number(quoteForm.storagePrice) : undefined,
      });
      setEditingQuote(false);
      load();
    } catch (err: any) {
      setQuoteError(err.response?.data?.message || 'Could not save the quote.');
    } finally {
      setSavingQuote(false);
    }
  };

  if (loading) return <div className="text-steel p-8">Loading...</div>;
  if (!report) return <div className="text-red-500 p-8">Could not load this job's report.</div>;

  const total = (Number(quoteForm.pvSystemPrice) || 0) + (Number(quoteForm.storagePrice) || 0);

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-steel hover:text-lantern-deep mb-4 flex items-center gap-1">
        ← Back to Jobs
      </button>
      <h1 className="text-2xl font-bold text-lantern-deep mb-8">Inspection Report</h1>

      {report.isSolar && (
        <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-steel uppercase tracking-wide">Solar Quote</h2>
            {solarQuote && !editingQuote && (
              <button onClick={() => setEditingQuote(true)} className="text-xs font-semibold text-lantern-deep hover:underline">
                Edit Quote
              </button>
            )}
          </div>

          {solarQuote && !editingQuote ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-steel">System Size</span><p className="font-semibold text-ink">{solarQuote.systemSizeKw} kW</p></div>
              <div><span className="text-steel"># Inverters</span><p className="font-semibold text-ink">{solarQuote.numInverters}</p></div>
              <div><span className="text-steel">Inverter</span><p className="font-semibold text-ink">{solarQuote.inverterManufacturer} {solarQuote.inverterModel}</p></div>
              <div><span className="text-steel">PV System Price</span><p className="font-semibold text-ink">${Number(solarQuote.pvSystemPrice).toLocaleString()}</p></div>
              {solarQuote.storageSizeKwh != null && (
                <>
                  <div><span className="text-steel">Storage Size</span><p className="font-semibold text-ink">{solarQuote.storageSizeKwh} kWh</p></div>
                  <div><span className="text-steel">Storage</span><p className="font-semibold text-ink">{solarQuote.storageManufacturer} {solarQuote.storageModel}</p></div>
                  <div><span className="text-steel">Storage Price</span><p className="font-semibold text-ink">${Number(solarQuote.storagePrice ?? 0).toLocaleString()}</p></div>
                </>
              )}
              <div><span className="text-steel">Total</span><p className="font-bold text-lantern-deep">${(Number(solarQuote.pvSystemPrice) + Number(solarQuote.storagePrice ?? 0)).toLocaleString()}</p></div>
            </div>
          ) : (
            <form onSubmit={submitQuote} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input required type="number" step="0.1" placeholder="System Size (kW) *" value={quoteForm.systemSizeKw}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, systemSizeKw: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
                <input required type="number" placeholder="# of Inverters *" value={quoteForm.numInverters}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, numInverters: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
                <input required placeholder="Inverter Manufacturer *" value={quoteForm.inverterManufacturer}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, inverterManufacturer: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
                <input required placeholder="Inverter Model *" value={quoteForm.inverterModel}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, inverterModel: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
                <input required type="number" step="0.01" placeholder="PV System Price ($) *" value={quoteForm.pvSystemPrice}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, pvSystemPrice: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
              </div>
              <p className="text-xs font-semibold text-steel uppercase tracking-wide pt-2">Energy Storage (optional)</p>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" step="0.1" placeholder="Storage Size (kWh)" value={quoteForm.storageSizeKwh}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, storageSizeKwh: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
                <input placeholder="Storage Manufacturer" value={quoteForm.storageManufacturer}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, storageManufacturer: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
                <input placeholder="Storage Model" value={quoteForm.storageModel}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, storageModel: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
                <input type="number" step="0.01" placeholder="Storage Price ($)" value={quoteForm.storagePrice}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, storagePrice: e.target.value }))}
                  className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern" />
              </div>
              <p className="text-sm text-steel">Total: <span className="font-bold text-lantern-deep">${total.toLocaleString()}</span></p>
              {quoteError && <p className="text-red-600 text-sm">{quoteError}</p>}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={savingQuote}
                  className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors">
                  {savingQuote ? 'Saving…' : 'Save Quote'}
                </button>
                {solarQuote && (
                  <button type="button" onClick={() => { setEditingQuote(false); setQuoteError(''); }} className="text-steel text-sm px-4 py-2">Cancel</button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-6">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-4">Notes</h2>
        {report.notes.length === 0 ? (
          <p className="text-steel text-sm">No notes recorded.</p>
        ) : (
          <div className="space-y-4">
            {report.notes.map((n: any) => (
              <div key={n.id} className="border-b border-canvas pb-4 last:border-0">
                <div className="flex justify-between">
                  <span className="font-semibold text-ink">{n.title}</span>
                  <span className="text-xs text-steel">{n.type}</span>
                </div>
                <p className="text-sm text-steel mt-1">{n.content}</p>
                {n.photoUrls?.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {n.photoUrls.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-mist-dim" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-mist-dim p-6">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-4">Task Results</h2>
        {report.taskResults.length === 0 ? (
          <p className="text-steel text-sm">No task results recorded.</p>
        ) : (
          <div className="space-y-4">
            {report.taskResults.map((t: any) => (
              <div key={t.id} className="border-b border-canvas pb-4 last:border-0">
                <div className="flex justify-between">
                  <span className="font-semibold text-ink">{t.sectionKey} / {t.taskKey}</span>
                  <span className="text-xs font-semibold text-steel">{t.status}</span>
                </div>
                {t.findings && <p className="text-sm text-steel mt-1">{t.findings}</p>}
                {t.recommendation && <p className="text-xs text-steel mt-1">Recommendation: {t.recommendation}</p>}
                {t.photoKeys?.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {t.photoKeys.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-mist-dim" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
