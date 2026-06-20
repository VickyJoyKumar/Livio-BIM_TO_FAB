// Supabase Database type definitions
// These will be auto-generated from the actual tables once Supabase is set up.
// For now, hand-written stubs matching the planned schema.

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, "id" | "created_at">;
        Update: Partial<Omit<UserRow, "id">>;
      };
      projects: {
        Row: ProjectRow;
        Insert: Omit<ProjectRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ProjectRow, "id">>;
      };
      panels: {
        Row: PanelRow;
        Insert: Omit<PanelRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<PanelRow, "id">>;
      };
      model_files: {
        Row: ModelFileRow;
        Insert: Omit<ModelFileRow, "id" | "created_at">;
        Update: Partial<Omit<ModelFileRow, "id">>;
      };
      issues: {
        Row: IssueRow;
        Insert: Omit<IssueRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<IssueRow, "id">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// --- Row Types ---

export interface UserRow {
  id: string; // UUID, matches Supabase Auth
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: "admin" | "engineer" | "inspector" | "crew";
  created_at: string;
}

export interface ProjectRow {
  id: string; // UUID
  name: string;
  description: string | null;
  address: string | null;
  client_name: string | null;
  project_number: string | null;
  due_date: string | null;
  square_footage: number | null;
  custom_fields: Record<string, unknown>;
  status: "active" | "completed" | "archived";
  created_by: string; // FK → users.id
  created_at: string;
  updated_at: string;
}

export interface PanelRow {
  id: string; // UUID
  project_id: string; // FK → projects.id
  name: string;
  panel_type: string | null;
  qr_code: string | null; // unique QR identifier string
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ModelFileRow {
  id: string; // UUID
  panel_id: string; // FK → panels.id
  file_name: string;
  file_url: string; // Supabase Storage URL
  format: "ifc" | "gltf" | "glb";
  file_size_bytes: number | null;
  created_at: string;
}

export interface IssueRow {
  id: string; // UUID
  panel_id: string; // FK → panels.id
  title: string;
  description: string | null;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  created_by: string; // FK → users.id
  assigned_to: string | null; // FK → users.id
  created_at: string;
  updated_at: string;
}