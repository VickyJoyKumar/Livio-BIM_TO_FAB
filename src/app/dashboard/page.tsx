"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";

export default function DashboardPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome, {user?.user_metadata?.full_name ?? "User"}!
        </h2>
        <p className="mt-2 text-gray-600">
          Your BIM projects will appear here. More features coming soon.
        </p>
      </main>
    </div>
  );
}