/**
 * Client Supabase minimal en fetch pur (pas de supabase-js : MV3 interdit les
 * scripts distants et on ne veut pas de bundler). Auth GoTrue + PostgREST.
 * La session vit dans chrome.storage.local ; le refresh token est ROTATIF :
 * chaque refresh renvoie un nouveau couple qu'on re-stocke aussitôt.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SESSION_KEY = 'session';

/**
 * chrome.storage.local dans l'extension ; localStorage en page web normale
 * (permet de tester la popup dans un simple onglet, sans la charger dans Chrome).
 */
const storage =
  typeof chrome !== 'undefined' && chrome.storage?.local
    ? chrome.storage.local
    : {
        async get(key) {
          const raw = localStorage.getItem(key);
          return raw ? { [key]: JSON.parse(raw) } : {};
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v));
        },
        async remove(key) {
          localStorage.removeItem(key);
        },
      };

async function storeSession(tok) {
  const session = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    // Marge de 60 s pour ne jamais présenter un token à la limite de l'expiration.
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
    email: tok.user?.email ?? '',
  };
  await storage.set({ [SESSION_KEY]: session });
  return session;
}

export async function getStoredSession() {
  const data = await storage.get(SESSION_KEY);
  return data[SESSION_KEY] ?? null;
}

export async function signOut() {
  await storage.remove(SESSION_KEY);
}

async function authRequest(grant, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error_description || json.msg || json.error || `Erreur ${res.status}`;
    throw new Error(
      /invalid login credentials/i.test(msg) ? 'E-mail ou mot de passe incorrect.' : msg,
    );
  }
  return storeSession(json);
}

export function signIn(email, password) {
  return authRequest('password', { email, password });
}

/** Session valide, rafraîchie si besoin. null → il faut se (re)connecter. */
export async function ensureSession() {
  const session = await getStoredSession();
  if (!session) return null;
  if (Date.now() < session.expires_at) return session;
  try {
    return await authRequest('refresh_token', { refresh_token: session.refresh_token });
  } catch {
    await signOut();
    return null;
  }
}

/** GET PostgREST authentifié. `path` = "table?select=..." ; la RLS filtre par joueur. */
export async function rest(session, path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Requête échouée (${res.status})`);
  return res.json();
}
