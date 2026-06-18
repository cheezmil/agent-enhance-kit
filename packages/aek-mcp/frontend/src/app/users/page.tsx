'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const UsersPage = dynamic(() => import('../../page-components/UsersPage'), { ssr: false });
export default function Users() {
  return <ProtectedLayout><UsersPage /></ProtectedLayout>;
}
