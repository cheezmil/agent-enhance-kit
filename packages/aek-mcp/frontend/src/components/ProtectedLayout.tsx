'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import MainLayout from '../layouts/MainLayout';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Skip auth check for login page
  const isLoginPage = pathname === '/login';
  useEffect(() => {
    if (!isLoginPage && !auth.loading && !auth.isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoginPage, auth.loading, auth.isAuthenticated, router]);

  // Login page renders children directly (no MainLayout wrapper)
  if (isLoginPage) {
    return <>{children}</>;
  }

  // During SSR and before mount, render null to avoid hydration mismatch.
  // MainLayout depends on auth state which differs between server/client.
  if (!mounted) {
    return null;
  }

  return <MainLayout>{children}</MainLayout>;
}
