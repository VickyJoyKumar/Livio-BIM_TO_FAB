"use client";

import { useAuth } from "@/features/auth/auth-context";
import Image from "next/image";

export default function AppHeader() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <Image
          src="/logo.jpeg"
          alt="Livio"
          width={32}
          height={32}
          className="rounded"
        />
        <span className="text-sm font-semibold text-gray-700">
          Livio-BIM_TO_FAB
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user.user_metadata?.avatar_url && (
          <Image
            src={user.user_metadata.avatar_url}
            alt=""
            width={32}
            height={32}
            className="rounded-full"
          />
        )}
        <div className="text-right text-sm leading-tight">
          <p className="font-medium text-gray-800">
            {user.user_metadata?.full_name ?? user.email}
          </p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-800"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}