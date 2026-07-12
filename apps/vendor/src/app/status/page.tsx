'use client';
import { useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';

export default function StatusPage() {
  const { isCompanyAdmin } = usePermissions();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [retracting, setRetracting] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  const load = () => vendorApi.getStatus().then(setStatus);

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const requestElite = async () => {
    setRequesting(true);
    try {
      await vendorApi.requestElite();
      await load();
    } finally {
      setRequesting(false);
    }
  };

  const retractRequest = async () => {
    setRetracting(true);
    try {
      await vendorApi.retractEliteRequest();
      await load();
    } finally {
      setRetracting(false);
    }
  };

  const setMode = async (mode: string) => {
    setSavingMode(true);
    try {
      await vendorApi.setAssignmentMode(mode);
      await load();
    } finally {
      setSavingMode(false);
    }
  };

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Status & Plan</h1>
      <p className="text-gray-500 mb-8">Your company's subscription tier and job-assignment settings.</p>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Current Plan</p>
            <p className="text-2xl font-bold text-brand">{status.planTier}</p>
            {status.elitePlanExpiresAt && (
              <p className="text-xs text-gray-400 mt-1">Expires {new Date(status.elitePlanExpiresAt).toLocaleDateString()}</p>
            )}
          </div>
          {status.planTier !== 'ELITE' && isCompanyAdmin && (
            status.eliteRequestedAt ? (
              <div className="flex items-center gap-2">
                <span className="bg-purple-50 text-purple-700 px-3 py-2 rounded-lg text-sm font-semibold">Elite requested — pending review</span>
                <button
                  onClick={retractRequest}
                  disabled={retracting}
                  className="bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {retracting ? 'Retracting…' : 'Retract'}
                </button>
              </div>
            ) : (
              <button
                onClick={requestElite}
                disabled={requesting}
                className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors"
              >
                {requesting ? 'Requesting…' : 'Request Elite'}
              </button>
            )
          )}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Elite is required (along with an approved certification) for trade jobs — HVAC, Electrical, and Plumbing work.
          Elite also gives priority visibility on other jobs you already qualify for.
        </p>
      </div>

      {isCompanyAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Job Assignment</p>
          <div className="flex gap-2">
            {['MANUAL', 'ROUND_ROBIN'].map((mode) => (
              <button
                key={mode}
                onClick={() => setMode(mode)}
                disabled={savingMode}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                  status.assignmentMode === mode ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600'
                }`}
              >
                {mode === 'MANUAL' ? 'Manual' : 'Round Robin'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Manual: assign each job yourself from the Jobs page. Round Robin: auto-assign to whoever on the team has the fewest active jobs.</p>
        </div>
      )}
    </div>
  );
}
