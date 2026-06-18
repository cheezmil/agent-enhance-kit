'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const ResourcesPage = dynamic(() => import('../../page-components/ResourcesPage'), { ssr: false });
export default function Resources() {
  return <ProtectedLayout><ResourcesPage /></ProtectedLayout>;
}
