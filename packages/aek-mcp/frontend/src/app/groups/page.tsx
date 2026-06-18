'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const GroupsPage = dynamic(() => import('../../page-components/GroupsPage'), { ssr: false });
export default function Groups() {
  return <ProtectedLayout><GroupsPage /></ProtectedLayout>;
}
