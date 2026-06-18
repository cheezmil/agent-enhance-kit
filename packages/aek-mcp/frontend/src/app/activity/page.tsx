'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const ActivityPage = dynamic(() => import('../../page-components/ActivityPage'), { ssr: false });
export default function Activity() {
  return <ProtectedLayout><ActivityPage /></ProtectedLayout>;
}
