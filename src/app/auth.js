// Supabase Auth & Data Management
// Initialize Supabase client

let supabaseClient = null

const initSupabase = () => {
  if (supabaseClient) return supabaseClient

  // Get config from window or use defaults
  const config = window.SUPABASE_CONFIG || {
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
  }

  if (!config.url || config.url === 'YOUR_SUPABASE_URL') {
    console.warn('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
    return null
  }

  supabaseClient = window.supabase.createClient(config.url, config.anonKey)
  return supabaseClient
}

// Auth functions
const auth = {
  // Send magic link
  async sendMagicLink(email) {
    const supabase = initSupabase()
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
      },
    })

    if (error) throw error
    return data
  },

  // Get current session
  async getSession() {
    const supabase = initSupabase()
    if (!supabase) return null

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()
    if (error) throw error
    return session
  },

  // Sign out
  async signOut() {
    const supabase = initSupabase()
    if (!supabase) return

    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  // Listen to auth state changes
  onAuthStateChange(callback) {
    const supabase = initSupabase()
    if (!supabase) return () => {}

    return supabase.auth.onAuthStateChange(callback)
  },

  // Get current user
  async getCurrentUser() {
    const supabase = initSupabase()
    if (!supabase) return null

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error) throw error
    return user
  },
}

// Organization functions
const orgs = {
  // Get user's organizations
  async getUserOrgs() {
    const supabase = initSupabase()
    if (!supabase) {
      console.warn('Supabase not initialized')
      return []
    }

    const user = await auth.getCurrentUser()
    if (!user || !user.id) {
      console.warn('User not authenticated')
      return []
    }

    try {
      // First try with the join
      const { data, error } = await supabase
        .from('memberships')
        .select('org_id, role, organizations!inner(*)')
        .eq('user_id', user.id)

      if (error) {
        console.error('Error fetching user orgs with join:', error)
        // Fallback: get memberships first, then orgs separately
        const { data: memberships, error: membershipsError } = await supabase
          .from('memberships')
          .select('org_id, role')
          .eq('user_id', user.id)

        if (membershipsError) {
          console.error('Error fetching memberships:', membershipsError)
          return []
        }

        if (!memberships || memberships.length === 0) return []

        // Get orgs separately
        const orgIds = memberships.map(m => m.org_id)
        const { data: orgs, error: orgsError } = await supabase.from('organizations').select('*').in('id', orgIds)

        if (orgsError) {
          console.error('Error fetching organizations:', orgsError)
          return []
        }

        // Combine the data
        return memberships.map(m => ({
          org_id: m.org_id,
          role: m.role,
          organizations: orgs.find(o => o.id === m.org_id),
        }))
      }

      return data || []
    } catch (err) {
      console.error('getUserOrgs error:', err)
      return []
    }
  },

  // Create new organization
  async createOrg(name) {
    const supabase = initSupabase()
    if (!supabase) throw new Error('Supabase not configured')

    const user = await auth.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    // Generate slug from name
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') +
      '-' +
      Math.random().toString(36).substring(2, 8)

    // Try using the database function first (recommended - handles RLS properly)
    try {
      const { data, error } = await supabase.rpc('create_organization', {
        org_name: name,
        org_slug: slug,
        user_uuid: user.id,
      })

      if (!error && data && data.length > 0) {
        return data[0]
      }
      if (error && !error.message.includes('function') && !error.message.includes('does not exist')) {
        // Function exists but returned an error
        throw error
      }
    } catch (err) {
      // If function doesn't exist or other error, fall through to manual approach
      if (err.message && err.message.includes('does not exist')) {
        console.warn('create_organization function not found, using manual approach')
      } else {
        throw err
      }
    }

    // Fallback: Manual approach - insert org without select
    const { error: insertError } = await supabase.from('organizations').insert({ name, slug })

    if (insertError) throw insertError

    // Create membership immediately (this allows us to query the org)
    // We'll use the slug to find the org ID
    const { data: orgs, error: orgsError } = await supabase.from('organizations').select('id').eq('slug', slug).limit(1)

    if (orgsError || !orgs || orgs.length === 0) {
      throw new Error('Created organization but cannot find it. Please run CREATE_ORG_FUNCTION.sql in Supabase.')
    }

    const orgId = orgs[0].id

    // Create membership
    const { error: membershipError } = await supabase.from('memberships').insert({
      user_id: user.id,
      org_id: orgId,
      role: 'owner',
    })

    if (membershipError) throw membershipError

    // Now we can query the full org (membership exists, so RLS allows it)
    const { data: org, error: fetchError } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at')
      .eq('id', orgId)
      .single()

    if (fetchError) {
      // Last resort: construct the org object manually
      return {
        id: orgId,
        name,
        slug,
        created_at: new Date().toISOString(),
      }
    }

    return org
  },

  // Join organization by slug
  async joinOrg(slug) {
    const supabase = initSupabase()
    if (!supabase) throw new Error('Supabase not configured')

    const user = await auth.getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    // Find org by slug
    const { data: org, error: orgError } = await supabase.from('organizations').select('id').eq('slug', slug).single()

    if (orgError || !org) throw new Error('Organization not found')

    // Create membership
    const { error: membershipError } = await supabase.from('memberships').insert({
      user_id: user.id,
      org_id: org.id,
      role: 'member',
    })

    if (membershipError) {
      if (membershipError.code === '23505') {
        throw new Error('You are already a member of this organization')
      }
      throw membershipError
    }

    return org
  },
}

// Sermon data functions
const sermons = {
  // Get sermons for current org
  async getSermons(orgId) {
    const supabase = initSupabase()
    if (!supabase) return []

    const { data, error } = await supabase
      .from('sermons')
      .select('*')
      .eq('org_id', orgId)
      .order('started_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Create new sermon
  async createSermon(orgId, transcript, title = null) {
    const supabase = initSupabase()
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase
      .from('sermons')
      .insert({
        org_id: orgId,
        transcript: Array.isArray(transcript) ? transcript : [transcript],
        title,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Update sermon
  async updateSermon(sermonId, updates) {
    const supabase = initSupabase()
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.from('sermons').update(updates).eq('id', sermonId).select().single()

    if (error) throw error
    return data
  },

  // Get assets for a sermon
  async getAssets(sermonId) {
    const supabase = initSupabase()
    if (!supabase) return {}

    const { data, error } = await supabase.from('assets').select('*').eq('sermon_id', sermonId)

    if (error) throw error

    // Convert to object keyed by asset_type
    const assetsObj = {}
    ;(data || []).forEach(asset => {
      assetsObj[asset.asset_type] = asset.content
    })

    return assetsObj
  },

  // Save asset
  async saveAsset(sermonId, assetType, content, metadata = {}) {
    const supabase = initSupabase()
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase
      .from('assets')
      .upsert(
        {
          sermon_id: sermonId,
          asset_type: assetType,
          content,
          duration: metadata.duration,
          tokens: metadata.tokens,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'sermon_id,asset_type',
        },
      )
      .select()
      .single()

    if (error) throw error
    return data
  },
}

// Export
if (typeof window !== 'undefined') {
  window.supabaseAuth = auth
  window.supabaseOrgs = orgs
  window.supabaseSermons = sermons
  window.initSupabase = initSupabase
}
