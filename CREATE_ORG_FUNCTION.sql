-- Create a function that creates org and membership in one transaction
-- This bypasses the RLS issue

CREATE OR REPLACE FUNCTION public.create_organization(org_name TEXT, org_slug TEXT, user_uuid UUID)
RETURNS TABLE(id UUID, name TEXT, slug TEXT, created_at TIMESTAMPTZ) AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Insert organization
  INSERT INTO public.organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING organizations.id INTO new_org_id;
  
  -- Insert membership
  INSERT INTO public.memberships (user_id, org_id, role)
  VALUES (user_uuid, new_org_id, 'owner');
  
  -- Return the org
  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.created_at
  FROM public.organizations o
  WHERE o.id = new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_organization TO authenticated;

