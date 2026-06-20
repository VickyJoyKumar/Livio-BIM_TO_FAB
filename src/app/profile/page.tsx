"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";
import { useEffect, useState } from "react";
import Image from "next/image";

interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
}

const ROLE_BADGES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  engineer: "bg-blue-100 text-blue-800",
  inspector: "bg-green-100 text-green-800",
  crew: "bg-amber-100 text-amber-800",
};

export default function ProfilePage() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setMessage({ type: "error", text: data.error });
        } else {
          setProfile(data);
          setName(data.name ?? "");
        }
        setLoading(false);
      })
      .catch(() => {
        setMessage({ type: "error", text: "Failed to load profile" });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    const data = await res.json();
    if (data.error) {
      setMessage({ type: "error", text: data.error });
    } else {
      setProfile(data);
      setMessage({ type: "success", text: "Profile updated!" });
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {/* Avatar */}
          <div className="mb-6 flex flex-col items-center">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt=""
                width={80}
                height={80}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-2xl font-bold text-gray-500">
                {profile?.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <h1 className="mt-4 text-xl font-bold text-gray-900">
              {profile?.name ?? "User"}
            </h1>
            <span
              className={`mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-medium capitalize ${
                ROLE_BADGES[profile?.role ?? "engineer"]
              }`}
            >
              {profile?.role ?? "engineer"}
            </span>
          </div>

          {/* Email (read-only) */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Email
            </label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
              {profile?.email ?? ""}
            </p>
          </div>

          {/* Name (editable) */}
          <div className="mb-6">
            <label
              htmlFor="name"
              className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide"
            >
              Display Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Your display name"
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {/* Message */}
          {message && (
            <p
              className={`mt-3 text-center text-sm ${
                message.type === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}