'use client';

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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

  // Always render MainLayout to avoid hydration mismatch
  // Loading/auth state is handled inside MainLayout
  return <MainLayout>{children}</MainLayout>;
}
