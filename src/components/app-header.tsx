"use client";

import { useAuth } from "@/features/auth/auth-context";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const ROLE_BADGES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  engineer: "bg-blue-100 text-blue-800",
  inspector: "bg-green-100 text-green-800",
  crew: "bg-amber-100 text-amber-800",
};

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) return null;

  const userRole = user.role ?? "engineer";

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
      {/* Left: Logo + App Name */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/dashboard")} className="flex items-center gap-3">
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
        </button>
      </div>

      {/* Right: User Menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 rounded-lg p-1.5 transition hover:bg-gray-100"
        >
          {user.user_metadata?.avatar_url ? (
            <Image
              src={user.user_metadata.avatar_url}
              alt=""
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-gray-600">
              {user.email?.charAt(0).toUpperCase() ?? "?"}
            </div>
          )}
          <span className="hidden text-sm font-medium text-gray-800 sm:inline">
            {user.user_metadata?.full_name ?? user.email}
          </span>
          <svg
            className={`h-4 w-4 text-gray-400 transition ${menuOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {/* User info at top */}
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-medium text-gray-900">
                {user.user_metadata?.full_name ?? user.email}
              </p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>

            <div className="py-1">
              <button
                onClick={() => { router.push("/profile"); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </button>

              <button
                onClick={() => { router.push("/admin/users"); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                Admin — Users
              </button>
            </div>

            <div className="border-t border-gray-100 py-1">
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}