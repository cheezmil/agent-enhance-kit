'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const ServersPage = dynamic(() => import('../../page-components/ServersPage'), { ssr: false });
export default function Servers() {
  return <ProtectedLayout><ServersPage /></ProtectedLayout>;
}
