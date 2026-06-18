'use client';
import ProtectedLayout from '../../components/ProtectedLayout';
import dynamic from 'next/dynamic';
const PromptsPage = dynamic(() => import('../../page-components/PromptsPage'), { ssr: false });
export default function Prompts() {
  return <ProtectedLayout><PromptsPage /></ProtectedLayout>;
}
