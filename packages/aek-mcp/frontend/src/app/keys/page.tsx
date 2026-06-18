'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const KeysPage = dynamic(() => import('../../page-components/KeysPage'), { ssr: false });
export default function Keys() {
  return <ProtectedLayout><KeysPage /></ProtectedLayout>;
}
