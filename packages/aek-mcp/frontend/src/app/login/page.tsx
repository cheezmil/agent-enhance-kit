'use client';
import dynamic from 'next/dynamic';
const LoginPage = dynamic(() => import('../../page-components/LoginPage'), { ssr: false });
export default function Login() { return <LoginPage />; }
