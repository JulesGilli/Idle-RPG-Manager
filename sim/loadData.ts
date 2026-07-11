/**
 * Chargement des donnees d'equilibrage (hero_classes + maps + levels).
 *
 * Mode LIVE : si SUPABASE_SERVICE_ROLE_KEY est present (dans .env.local ou
 * l'environnement), on lit la DB en direct (la service key bypass le RLS
 * "authenticated only" des tables levels/maps/hero_classes).
 *
 * Mode SNAPSHOT : sinon, on lit sim/data/enemies.snapshot.json (fallback
 * versionne, rafraichi via l'agent ou `--refresh-snapshot`). Toujours executable.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(HERE, 'data', 'enemies.snapshot.json');
const ENV_LOCAL = resolve(HERE, '..', '.env.local');

export type HeroClass = {
  id: string;
  name: string;
  base_hp: number;
  base_atk: number;
  base_def: number;
  base_speed: number;
};

export type EnemyDef = {
  name: string;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  armor?: number;
  // deno-lint-ignore no-explicit-any
  abilities?: any[];
};

export type LevelRow = {
  id: string;
  map_id: string;
  level_index: number;
  difficulty: number;
  name: string;
  is_boss: boolean;
  enemy_config: { enemies: EnemyDef[] };
};

export type MapRow = {
  id: string;
  name: string;
  sort: number;
  resource: string;
  boss_resource: string;
  max_rarity: string;
};

export type GameData = {
  source: 'live' | 'snapshot';
  heroClasses: Record<string, HeroClass>;
  maps: MapRow[];
  levels: LevelRow[];
};

/** Parse basique de .env.local (KEY=VALUE) sans dependance. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

function resolveCreds(): { url?: string; serviceKey?: string } {
  const fileEnv = readEnvFile(ENV_LOCAL);
  const url =
    process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceKey };
}

function indexClasses(rows: HeroClass[]): Record<string, HeroClass> {
  const out: Record<string, HeroClass> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}

function loadSnapshot(): GameData {
  const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  return {
    source: 'snapshot',
    heroClasses: indexClasses(raw.hero_classes),
    maps: raw.maps,
    levels: raw.levels,
  };
}

async function loadLive(url: string, serviceKey: string): Promise<GameData> {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [cls, maps, levels] = await Promise.all([
    admin.from('hero_classes').select('id,name,base_hp,base_atk,base_def,base_speed'),
    admin.from('maps').select('id,name,sort,resource,boss_resource,max_rarity').order('sort'),
    admin
      .from('levels')
      .select('id,map_id,level_index,difficulty,name,is_boss,enemy_config')
      .order('map_id')
      .order('level_index'),
  ]);
  if (cls.error) throw cls.error;
  if (maps.error) throw maps.error;
  if (levels.error) throw levels.error;
  return {
    source: 'live',
    heroClasses: indexClasses(cls.data as HeroClass[]),
    maps: maps.data as MapRow[],
    levels: levels.data as LevelRow[],
  };
}

/** Charge les donnees : live si service key dispo, sinon snapshot. */
export async function loadGameData(opts?: { forceSnapshot?: boolean }): Promise<GameData> {
  const { url, serviceKey } = resolveCreds();
  if (!opts?.forceSnapshot && url && serviceKey) {
    try {
      return await loadLive(url, serviceKey);
    } catch (e) {
      console.warn(`[sim] Lecture live echouee (${(e as Error).message}), fallback snapshot.`);
    }
  }
  return loadSnapshot();
}

/** Ecrit le snapshot depuis la DB live (necessite la service key). */
export async function refreshSnapshot(): Promise<void> {
  const { url, serviceKey } = resolveCreds();
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL requis pour --refresh-snapshot.');
  }
  const data = await loadLive(url, serviceKey);
  const payload = {
    _comment:
      "Snapshot des donnees d'equilibrage extrait de la DB live. Fallback quand la service key est absente.",
    generatedAt: new Date().toISOString().slice(0, 10),
    hero_classes: Object.values(data.heroClasses),
    maps: data.maps,
    levels: data.levels,
  };
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`[sim] Snapshot rafraichi : ${data.levels.length} niveaux ecrits.`);
}

/** Groupe les niveaux par map, tries par index. */
export function levelsByMap(data: GameData): Map<string, LevelRow[]> {
  const byMap = new Map<string, LevelRow[]>();
  for (const l of data.levels) {
    if (!byMap.has(l.map_id)) byMap.set(l.map_id, []);
    byMap.get(l.map_id)!.push(l);
  }
  for (const arr of byMap.values()) arr.sort((a, b) => a.level_index - b.level_index);
  return byMap;
}
