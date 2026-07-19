import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables Supabase manquantes : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE plutôt qu'implicit : le lien de récupération revient alors avec un
    // `?code=` en QUERY STRING. En implicit, les jetons arrivent dans le HASH
    // (`#access_token=…`) — or l'app utilise un HashRouter, et les deux se
    // disputeraient le même fragment d'URL.
    flowType: 'pkce',
    detectSessionInUrl: true,
  },
});
