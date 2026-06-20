-- Initial schema for Livio AR BIM Viewer

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('admin', 'engineer', 'inspector', 'crew')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read projects"
  ON public.projects FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- 4. Panels table
CREATE TABLE IF NOT EXISTS public.panels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  panel_type TEXT,
  qr_code TEXT UNIQUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.panels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read panels"
  ON public.panels FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create panels"
  ON public.panels FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_id
  ));

-- 5. Model files table
CREATE TABLE IF NOT EXISTS public.model_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  panel_id UUID NOT NULL REFERENCES public.panels(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('ifc', 'gltf', 'glb')),
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.model_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read model files"
  ON public.model_files FOR SELECT
  USING (auth.role() = 'authenticated');

-- 6. Issues table
CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  panel_id UUID NOT NULL REFERENCES public.panels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read issues"
  ON public.issues FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create issues"
  ON public.issues FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- 7. Create storage bucket for model files
INSERT INTO storage.buckets (id, name, public)
VALUES ('model_files', 'model_files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read model files from storage
CREATE POLICY "Authenticated users can read model files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'model_files' AND auth.role() = 'authenticated');

-- Allow authenticated users to upload model files
CREATE POLICY "Authenticated users can upload model files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'model_files' AND auth.role() = 'authenticated');
