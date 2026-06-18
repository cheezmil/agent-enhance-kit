'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const LogsPage = dynamic(() => import('../../page-components/LogsPage'), { ssr: false });
export default function Logs() {
  return <ProtectedLayout><LogsPage /></ProtectedLayout>;
}
