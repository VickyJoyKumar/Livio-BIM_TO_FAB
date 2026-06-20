"use client";

import { useAuth } from "@/features/auth/auth-context";
import AppHeader from "@/components/app-header";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
}

const ROLE_OPTIONS = ["admin", "engineer", "inspector", "crew"] as const;

const ROLE_BADGES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  engineer: "bg-blue-100 text-blue-800",
  inspector: "bg-green-100 text-green-800",
  crew: "bg-amber-100 text-amber-800",
};

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("engineer");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Role change
  const [changingUserId, setChangingUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setUsers(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setChangingUserId(userId);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    }
    setChangingUserId(null);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setInviteMsg(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });

    const data = await res.json();
    if (data.error) {
      setInviteMsg({ type: "error", text: data.error });
    } else {
      setInviteMsg({ type: "success", text: data.message ?? "Invitation sent!" });
      setInviteEmail("");
      setTimeout(() => setInviteMsg(null), 5000);
    }
    setInviting(false);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">User Management</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Invite User Section */}
        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Invite New User</h2>
          <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Email Address
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="w-full sm:w-40">
              <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="flex-shrink-0 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
            >
              {inviting ? "Sending..." : "Invite"}
            </button>
          </form>
          {inviteMsg && (
            <p className={`mt-2 text-sm ${inviteMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {inviteMsg.text}
            </p>
          )}
        </div>

        {/* Users List */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-800">
              All Users ({users.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No users found.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {users.map((u) => (
                <li key={u.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {u.avatar_url ? (
                      <Image src={u.avatar_url} alt="" width={40} height={40} className="rounded-full" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
                        {u.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.name ?? "Unnamed"}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_BADGES[u.role]}`}>
                      {u.role}
                    </span>
                    {u.id !== user?.id && (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        disabled={changingUserId === u.id}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}