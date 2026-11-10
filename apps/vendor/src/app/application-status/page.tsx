'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onboardingApi, ApplicationStatus } from '@/lib/api';
import { Logo } from '@/components/Logo';

const HEADLINE: Record<string, string> = {
  PENDING_REVIEW: 'Your application is under review',
  NEEDS_INFO: 'Your application needs a few updates',
  REJECTED: 'Your application was not approved',
};

// Everything the portal shows a company that has submitted its application
// but isn't approved yet. Status only — the application itself is filled in,
// updated and resubmitted in the Attenteve app.
export default function ApplicationStatusPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    onboardingApi.getStatus().then(setStatus).catch(() => setError('Could not load your application status.'));
  }, []);

  const signOut = () => {
    localStorage.removeItem('vendor_token');
    localStorage.removeItem('vendor_is_admin');
    router.replace('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-mist-dim p-10 w-full max-w-lg">
        <div className="flex justify-center mb-6"><Logo size={40} /></div>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        {status && (
          <>
            <h1 className="text-xl font-bold text-ink text-center mb-2">{HEADLINE[status.applicationStatus] ?? 'Application status'}</h1>
            <p className="text-sm text-steel text-center mb-6">{status.companyName}</p>

            {status.applicationStatus === 'PENDING_REVIEW' && (
              <p className="text-sm text-steel leading-relaxed">
                Submitted {status.submittedAt ? new Date(status.submittedAt).toLocaleDateString() : ''}. We'll email you and send a notification in the Attenteve app as soon as there's a decision.
                The vendor portal opens once your company is approved.
              </p>
            )}

            {status.applicationStatus === 'NEEDS_INFO' && (
              <>
                <p className="text-sm text-steel leading-relaxed mb-4">
                  Our reviewer sent some items back. Open the Attenteve app to update them and resubmit. Changes can only be made in the app.
                </p>
                {status.reviewNotes && <p className="text-sm text-ink bg-canvas rounded-lg p-3 mb-4">{status.reviewNotes}</p>}
                <ul className="space-y-2">
                  {status.openItems.map((i) => (
                    <li key={i.label} className="text-sm border border-mist-dim rounded-lg p-3">
                      <span className="font-semibold text-ink">{i.label}</span>
                      {i.reviewerNote && <span className="block text-steel mt-1">{i.reviewerNote}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {status.applicationStatus === 'REJECTED' && (
              <>
                <p className="text-sm text-steel leading-relaxed mb-4">Attenteve was not able to approve your company at this time.</p>
                {status.reviewNotes && <p className="text-sm text-ink bg-canvas rounded-lg p-3">{status.reviewNotes}</p>}
              </>
            )}
          </>
        )}
        <button onClick={signOut} className="mt-8 w-full border border-border text-steel rounded-xl py-3 text-sm font-semibold hover:bg-canvas transition-colors">
          Sign out
        </button>
      </div>
    </div>
  );
}
