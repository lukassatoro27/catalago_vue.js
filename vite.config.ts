import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// Accept existing Vercel Supabase integrations (Next.js / server naming) while
// exposing ONLY the public Supabase project URL and publishable/anon key.
// These values are public by design. Never map service_role, secret, JWT or DB keys.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const publicUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const publicKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';

  return {
    plugins: [vue()],
    server: { port: 5173 },
    build: { outDir: 'dist' },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(publicUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(publicKey),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(publicKey),
    },
  };
});
