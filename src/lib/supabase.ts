import { createClient, type SupabaseClient } from '@supabase/supabase-js';
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anon = ((import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined)?.trim();
export const configured = Boolean(url && anon && url.startsWith('https://'));
export const supabase: SupabaseClient | null = configured ? createClient(url!, anon!, {
  auth: { autoRefreshToken:true, persistSession:true, detectSessionInUrl:true }
}) : null;
export function db() { if (!supabase) throw Error('Supabase não configurado. Confira as variáveis públicas de Supabase na Vercel e faça um novo deploy'); return supabase; }
export async function isAdmin() {
 const client=db(); const {data:{user}}=await client.auth.getUser(); if(!user) return false;
 const {data,error}=await client.from('digital_catalog_admins').select('user_id').eq('user_id',user.id).maybeSingle();
 if(error) throw error; return Boolean(data);
}
