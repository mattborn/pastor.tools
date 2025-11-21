// Supabase Configuration
const SUPABASE_CONFIG = {
  url: 'https://xgqgkdoclnoncdeiitdw.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncWdrZG9jbG5vbmNkZWlpdGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTA2NzcsImV4cCI6MjA3OTI4NjY3N30.7HMf2WIb7TqVep4gDrlIyVnPZc4q3zfS1F7snzLE9UY',
}

// Expose globally for non-module environments
if (typeof window !== 'undefined') {
  window.SUPABASE_CONFIG = SUPABASE_CONFIG
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SUPABASE_CONFIG
}
