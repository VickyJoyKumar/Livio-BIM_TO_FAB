import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id } = await params;

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

  if (!requester || requester.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { role } = body;

  if (!role || !["admin", "engineer", "inspector", "crew"].includes(role)) {
    return NextResponse.json(
      { error: "Valid role is required (admin, engineer, inspector, crew)" },
      { status: 400 },
    );
  }

  // Don't allow changing own role
  if (id === user.id) {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("users")
    .update({ role })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}