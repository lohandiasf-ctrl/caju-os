'use client';

import { useEffect } from 'react';
import { CajuLoading } from '@/components/caju-loading';

export default function CentralN1Redirect() {
  useEffect(() => {
    window.location.replace('/?view=central');
  }, []);

  return <CajuLoading label="Abrindo a Central N1..." />;
}
