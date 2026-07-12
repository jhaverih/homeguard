'use client';
import { useEffect, useState } from 'react';

export function usePermissions() {
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);

  useEffect(() => {
    setIsCompanyAdmin(localStorage.getItem('vendor_is_admin') === 'true');
  }, []);

  return { isCompanyAdmin };
}
