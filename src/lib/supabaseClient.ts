import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables Supabase manquantes : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local',
  );
}

// Configuration d'auth laissée aux DÉFAUTS.
//
// J'avais basculé `flowType` en 'pkce' pour que le lien de récupération revienne
// en query string plutôt que dans le hash (que le HashRouter utilise déjà).
// Constat après coup : la session stockée avait disparu du localStorage et le
// joueur se retrouvait déconnecté. Le lien de cause à effet n'est pas prouvé,
// mais le changement était DÉJÀ EN PRODUCTION et touche la connexion de tout le
// monde — donc retour aux défauts tant que ce n'est pas vérifié posément.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
