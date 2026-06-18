'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const SettingsPage = dynamic(() => import('../../page-components/SettingsPage'), { ssr: false });
export default function Settings() {
  return <ProtectedLayout><SettingsPage /></ProtectedLayout>;
}
