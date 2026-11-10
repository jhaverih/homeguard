'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { userApi, uploadsApi, onboardingApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];
const STATUS_PATH = '/application-status';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [approved, setApproved] = useState(true);
  const [forbiddenMessage, setForbiddenMessage] = useState('');
  const [needsPhoto, setNeedsPhoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { isCompanyAdmin } = usePermissions();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    // The Vendor Admin still needs a photo to personally appear in the job queue
    // (backend gate unchanged), but they're not nagged about it globally — they add
    // it via the Team page's edit control. Only technicians see this banner.
    // (isCompanyAdmin resolves asynchronously from localStorage, so explicitly clear
    // needsPhoto rather than just skipping the fetch, to avoid a stale flash of the banner.)
    if (isPublic || isCompanyAdmin || pathname === STATUS_PATH) {
      setNeedsPhoto(false);
      return;
    }
    userApi.getMe().then((me: any) => setNeedsPhoto(!me.avatarUrl)).catch(() => {});
  }, [pathname, isCompanyAdmin, isPublic]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      // Store the MinIO key, not the signed URL (which expires in 1hr) — resolved to a
      // viewable URL at read time wherever it's displayed, same as other photo fields.
      const { key } = await uploadsApi.upload(file, 'vendor-avatars');
      await userApi.updateProfile({ avatarUrl: key });
      setNeedsPhoto(false);
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // Only an approved company gets the portal. A company whose application is
  // submitted but not approved sees /application-status and nothing else; one
  // that hasn't submitted yet is signed out (login refuses it too).
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('vendor_token');
      if (!token && !isPublic) {
        router.replace('/login');
        return;
      }
      if (isPublic) { setReady(true); return; }
      try {
        const { applicationStatus } = await onboardingApi.getStatus();
        if (applicationStatus === 'INCOMPLETE') {
          localStorage.removeItem('vendor_token');
          localStorage.removeItem('vendor_is_admin');
          router.replace('/login');
          return;
        }
        const approved = applicationStatus === 'APPROVED';
        setApproved(approved);
        if (!approved && pathname !== STATUS_PATH) { router.replace(STATUS_PATH); return; }
        if (approved && pathname === STATUS_PATH) { router.replace('/'); return; }
      } catch {
        // A 401 is handled by the api interceptor; anything else falls back to
        // the API's own per-endpoint approval checks.
      }
      setReady(true);
    };

    checkAuth();
    window.addEventListener('pageshow', checkAuth);
    return () => window.removeEventListener('pageshow', checkAuth);
  }, [pathname, isPublic]);

  useEffect(() => {
    const onForbidden = (e: Event) => setForbiddenMessage((e as CustomEvent<string>).detail);
    window.addEventListener('vendor:forbidden', onForbidden);
    return () => window.removeEventListener('vendor:forbidden', onForbidden);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-steel text-sm">Loading...</div>
      </div>
    );
  }

  if (isPublic || (!approved && pathname === STATUS_PATH)) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        {needsPhoto && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
            <span>Add a face photo to appear in the job queue — customers see this when a job is booked.</span>
            <label className="bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer hover:bg-amber-700 transition-colors shrink-0">
              {uploadingPhoto ? 'Uploading…' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          </div>
        )}
        {forbiddenMessage && (
          <div className="mb-6 bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-2">
            <span>{forbiddenMessage}</span>
            <button
              onClick={() => setForbiddenMessage('')}
              className="text-red-400 hover:text-red-600 font-bold leading-none shrink-0"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
