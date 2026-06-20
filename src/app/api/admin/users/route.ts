import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role
  const { data: requester } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (requester?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // List all users
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role
  const { data: requester } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (requester?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email, role } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (!role || !["admin", "engineer", "inspector", "crew"].includes(role)) {
    return NextResponse.json(
      { error: "Valid role is required (admin, engineer, inspector, crew)" },
      { status: 400 },
    );
  }

  // Use service_role key to invite via Supabase Admin API
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  // Send invite via Supabase Auth invite endpoint
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/invite`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        email,
        data: { role }, // role metadata — read by handle_new_user trigger
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json();
    return NextResponse.json(
      { error: err.msg || err.message || "Failed to invite user" },
      { status: response.status },
    );
  }

  return NextResponse.json({ success: true, message: `Invitation sent to ${email}` });
}