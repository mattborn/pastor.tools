-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization memberships
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- Sermons table
CREATE TABLE IF NOT EXISTS sermons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  transcript TEXT[] NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table (stores generated content for each sermon)
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sermon_id UUID NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL, -- 'website', 'smallGroup', 'email', etc.
  content JSONB NOT NULL,
  duration INTEGER, -- processing time in seconds
  tokens INTEGER, -- token usage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sermon_id, asset_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org_id ON memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_sermons_org_id ON sermons(org_id);
CREATE INDEX IF NOT EXISTS idx_assets_sermon_id ON assets(sermon_id);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sermons ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can read orgs they're members of
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT org_id FROM public.user_org_ids())
  );

-- Users can create new organizations
CREATE POLICY "Users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (true);

-- Profiles: Users can view all profiles, update their own
CREATE POLICY "Users can view profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Memberships: Users can view their own memberships and memberships for orgs they belong to
-- Use a security definer function to avoid circular dependency
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS TABLE(org_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT m.org_id
  FROM public.memberships m
  WHERE m.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE POLICY "Users can view memberships"
  ON memberships FOR SELECT
  USING (
    user_id = auth.uid() OR
    org_id IN (SELECT org_id FROM public.user_org_ids())
  );

CREATE POLICY "Users can create their own memberships"
  ON memberships FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Sermons: Users can CRUD sermons for their orgs
CREATE POLICY "Users can view sermons in their orgs"
  ON sermons FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM public.user_org_ids())
  );

CREATE POLICY "Users can create sermons in their orgs"
  ON sermons FOR INSERT
  WITH CHECK (
    org_id IN (SELECT org_id FROM public.user_org_ids())
  );

CREATE POLICY "Users can update sermons in their orgs"
  ON sermons FOR UPDATE
  USING (
    org_id IN (SELECT org_id FROM public.user_org_ids())
  );

CREATE POLICY "Users can delete sermons in their orgs"
  ON sermons FOR DELETE
  USING (
    org_id IN (SELECT org_id FROM public.user_org_ids())
  );

-- Assets: Users can CRUD assets for sermons in their orgs
CREATE POLICY "Users can view assets in their orgs"
  ON assets FOR SELECT
  USING (
    sermon_id IN (
      SELECT id FROM sermons WHERE org_id IN (SELECT org_id FROM public.user_org_ids())
    )
  );

CREATE POLICY "Users can create assets in their orgs"
  ON assets FOR INSERT
  WITH CHECK (
    sermon_id IN (
      SELECT id FROM sermons WHERE org_id IN (SELECT org_id FROM public.user_org_ids())
    )
  );

CREATE POLICY "Users can update assets in their orgs"
  ON assets FOR UPDATE
  USING (
    sermon_id IN (
      SELECT id FROM sermons WHERE org_id IN (SELECT org_id FROM public.user_org_ids())
    )
  );

CREATE POLICY "Users can delete assets in their orgs"
  ON assets FOR DELETE
  USING (
    sermon_id IN (
      SELECT id FROM sermons WHERE org_id IN (SELECT org_id FROM public.user_org_ids())
    )
  );

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

