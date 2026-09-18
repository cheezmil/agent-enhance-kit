'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Groups() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/servers');
  }, [router]);
  return null;
}
