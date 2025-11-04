'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useClient } from '@/contexts/ClientContext';
import Sidebar from '@/components/Sidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isSuperAdmin } = useClient();
  const router = useRouter();

  useEffect(() => {
    // Redirect non-authenticated users to login
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    // Redirect non-super-admin users to regular dashboard
    if (!loading && user && !isSuperAdmin()) {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, isSuperAdmin, router]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Don't render anything if not authenticated or not super admin
  if (!user || !isSuperAdmin()) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="admin-content">
          {children}
        </div>
      </main>
    </div>
  );
}