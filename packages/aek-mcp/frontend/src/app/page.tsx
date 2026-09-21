'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/servers');
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
      Redirecting...
    </div>
  );
}
