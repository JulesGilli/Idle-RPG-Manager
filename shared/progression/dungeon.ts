/**
 * Donjon : un enchaînement de combats consécutifs (monstres normaux, mini-boss,
 * boss final) SANS reset complet des PV entre chaque combat. Entre deux combats,
 * les survivants récupèrent une fraction de leurs PV max (regen partielle) ;
 * les statuts temporaires disparaissent (chaque combat repart d'un état neuf).
 *
 * Fonction PURE et déterministe (mêmes inputs → mêmes outputs), rejouable depuis
 * la seed. Aucune I/O, aucun accès réseau/DB. Réutilise le moteur /shared/combat.
 */
import { resolveCombat } from '../combat/resolveCombat.ts';
import { createRng } from '../combat/prng.ts';
import {
  dungeonDamageMult,
  scaleMinibossMonster,
  scaleNormalMonster,
  withStunImmunity,
} from '../combat/difficulty.ts';
import { scaleEnemyStatsForArc } from './arc.ts';
import type { Rng } from '../combat/prng.ts';
import type { CombatantInput, CombatResult } from '../combat/types.ts';

/** Un combattant (monstre, mini-boss ou boss), stats de base. */
export type MonsterTemplate = {
  name: string;
  hp: number;
  atk: number;
  def: number;
  speed: number;
};

/** Un combat de la séquence : un GROUPE d'ennemis (pack de mobs, boss + gardes…). */
export type DungeonFightDef = {
  /** Libellé du combat ("Meute de goules", "Le Roi Déchu"…). */
  name: string;
  enemies: MonsterTemplate[];
};

/** Une entrée de table de loot : chance de dropper `min..max` d'une ressource. */
export type LootEntry = {
  resource: string;
  min: number;
  max: number;
  /** Probabilité de drop (0..1). */
  chance: number;
};

/** Configuration d'un type de donjon (miroir de la table `dungeon_types`). */
export type DungeonType = {
  id: string;
  name: string;
  tier: number;
  monsterSequence: DungeonFightDef[];
  /** PV récupérés entre deux combats, en fraction des PV max (0.10 = +10 %). */
  regenPctBetweenFights: number;
  /** Index (0-based) des mini-boss dans `monsterSequence`. */
  minibossIndices: number[];
  /** Index (0-based) du boss final dans `monsterSequence`. */
  bossIndex: number;
  lootTableNormal: LootEntry[];
  lootTableMiniboss: LootEntry[];
  lootTableBoss: LootEntry[];
};

/* ----------------------------------------------------------- COOLDOWN ---- */
// Un donjon est une activité « spéciale » (hors carte) : contrairement au farm
// idle continu, il impose un temps de repos avant de pouvoir le relancer. Le
// cooldown croît avec la difficulté (tier). Calculé côté serveur (anti-triche) ET
// côté client (affichage) à partir du timestamp du dernier run — d'où le partage.

/**
 * Nombre de donjons du jeu (= nombre de tiers). Chaque donjon terminé pour la
 * PREMIÈRE fois débloque un slot d'effectif — d'où `MAX_ROSTER = ROSTER_BASE + DUNGEON_COUNT`.
 * Les deux constantes doivent bouger ensemble, sinon les derniers donjons
 * promettent un slot qu'ils ne délivrent pas.
 */
export const DUNGEON_COUNT = 8;

/**
 * Cooldown d'un donjon selon sa difficulté (tier), en HEURES. Les donjons sont des
 * activités rares à très long repos.
 *
 * Passage de 4 à 8 donjons : la plage 8 h → 24 h est ÉTIRÉE sur 8 paliers au lieu
 * de 4, elle n'est pas prolongée. L'ancien fallback (`24 + (t−4)·8`) aurait donné
 * 56 h au T8 — plus de deux jours d'attente, alors que le T8 remplace un donjon
 * qui se rejouait toutes les 24 h.
 */
export const DUNGEON_COOLDOWN_HOURS_BY_TIER: Record<number, number> = {
  1: 8, 2: 10, 3: 13, 4: 15, 5: 17, 6: 19, 7: 22, 8: 24,
};

/** Cooldown d'un donjon selon sa difficulté (tier), en secondes. */
export function dungeonCooldownSeconds(tier: number): number {
  const t = Math.max(1, Math.round(tier));
  // Au-delà de la table (contenu futur) : on prolonge le pas moyen de ~2 h/tier.
  const hours = DUNGEON_COOLDOWN_HOURS_BY_TIER[t] ?? 24 + (t - 8) * 2;
  return hours * 3600;
}

/**
 * Secondes restantes avant de pouvoir relancer un donjon de ce tier.
 * `lastRunAtMs` = timestamp du dernier run de CE donjon (null si jamais joué).
 */
export function dungeonCooldownRemaining(
  lastRunAtMs: number | null,
  tier: number,
  nowMs: number,
): number {
  if (lastRunAtMs == null) return 0;
  const elapsed = (nowMs - lastRunAtMs) / 1000;
  return Math.max(0, Math.ceil(dungeonCooldownSeconds(tier) - elapsed));
}

export type DungeonFightKind = 'normal' | 'miniboss' | 'boss';

/** Résultat d'un combat de la séquence (pour le replay). */
export type DungeonFightResult = {
  index: number;
  kind: DungeonFightKind;
  enemyName: string;
  /** PV des alliés engagés au DÉBUT du combat (après regen inter-combat). */
  hpBefore: { id: string; hp: number; maxHp: number }[];
  combat: CombatResult;
};

/** Une ressource lootée, agrégée sur tout le run. */
export type DungeonLootDrop = { resource: string; amount: number };

export type DungeonRunResult = {
  fightResults: DungeonFightResult[];
  success: boolean;
  /** Index du dernier combat atteint (engagé), boss compris. -1 si aucun. */
  reachedIndex: number;
  lootRolled: DungeonLootDrop[];
};

/** Nature d'un combat selon sa position dans la séquence. */
function fightKind(dungeon: DungeonType, index: number): DungeonFightKind {
  if (index === dungeon.bossIndex) return 'boss';
  if (dungeon.minibossIndices.includes(index)) return 'miniboss';
  return 'normal';
}

/** Roll d'une table de loot dans un accumulateur (déterministe via `rng`). */
function rollLootInto(acc: Map<string, number>, table: LootEntry[], rng: Rng): void {
  for (const entry of table) {
    if (rng.next() < entry.chance) {
      const qty = rng.int(entry.min, entry.max);
      if (qty > 0) acc.set(entry.resource, (acc.get(entry.resource) ?? 0) + qty);
    }
  }
}

/**
 * Simule un run de donjon complet.
 * @param seed   seed serveur (jamais fournie par le client).
 * @param squad  combattants prêts (stats effectives, `hp` = PV max).
 * @param dungeon configuration du donjon.
 * @param arc    palier d'ARC courant (défaut 1 = neutre). En arc N, chaque ennemi
 *               voit ses PV/ATK montés par-dessus le scaling de base.
 */
export function simulateDungeonRun(
  seed: number,
  squad: CombatantInput[],
  dungeon: DungeonType,
  arc = 1,
): DungeonRunResult {
  const fightResults: DungeonFightResult[] = [];
  const loot = new Map<string, number>();
  // rng de loot dérivé de la seed (indépendant des seeds de combat).
  const lootRng = createRng((seed ^ 0x9e3779b9) >>> 0);

  // PV courants par héros (démarrent au max = squad[i].hp).
  const currentHp = new Map<string, number>(squad.map((h) => [h.id, h.hp]));
  const maxHp = new Map<string, number>(squad.map((h) => [h.id, h.hp]));

  let combatSeed = seed >>> 0;
  let reachedIndex = -1;
  let success = false;

  for (let i = 0; i < dungeon.monsterSequence.length; i++) {
    // Alliés engagés = survivants (PV > 0), avec leurs PV courants en `startHp`.
    const allies: CombatantInput[] = squad
      .filter((h) => (currentHp.get(h.id) ?? 0) > 0)
      .map((h) => ({ ...h, startHp: currentHp.get(h.id)! }));

    // Sécurité : plus personne debout → wipe (ne devrait pas arriver ici, le wipe
    // est détecté en fin de combat, mais on protège contre une séquence vide).
    if (allies.length === 0) break;

    const fight = dungeon.monsterSequence[i]!;
    const kind = fightKind(dungeon, i);
    const enemies: CombatantInput[] = fight.enemies.map((m, k) => {
      const base: CombatantInput = {
        id: `enemy-${i}-${k}`,
        name: m.name,
        role: 'enemy',
        hp: m.hp,
        atk: m.atk,
        def: m.def,
        speed: m.speed,
      };
      // Boss : insensible au stun (stats inchangées). Mobs classiques et
      // mini-boss : renforcés (les mini-boss plus légèrement).
      const scaled =
        kind === 'boss'
          ? withStunImmunity(base)
          : kind === 'miniboss'
            ? scaleMinibossMonster(base)
            : scaleNormalMonster(base);
      // Palier d'ARC appliqué PAR-DESSUS le scaling de base (PV/ATK ×arc, DEF
      // inchangée). Arc 1 = neutre → stats strictement identiques.
      const arcStats = scaleEnemyStatsForArc({ hp: scaled.hp, atk: scaled.atk }, arc);
      // Rampe de dégâts par TIER (T1 intact, T2+ frappe plus fort).
      const atk = Math.max(1, Math.round(arcStats.atk * dungeonDamageMult(dungeon.tier)));
      return { ...scaled, hp: arcStats.hp, atk };
    });

    combatSeed = (Math.imul(combatSeed, 1664525) + 1013904223) >>> 0;
    const combat = resolveCombat({ allies, enemies, seed: combatSeed });
    reachedIndex = i;

    fightResults.push({
      index: i,
      kind,
      enemyName: fight.name,
      hpBefore: allies.map((a) => ({ id: a.id, hp: a.startHp!, maxHp: maxHp.get(a.id)! })),
      combat,
    });

    // Report des PV de fin de combat sur les alliés engagés.
    for (const fs of combat.finalState) {
      if (fs.side === 'ally') currentHp.set(fs.id, fs.hp);
    }

    const monsterDefeated = combat.result === 'win';
    const teamAlive = combat.finalState.some((fs) => fs.side === 'ally' && fs.alive);

    // Loot : uniquement sur un combat GAGNÉ (monstre vaincu). Le loot boss n'est
    // donc rollé que si le boss est réellement battu (⇒ succès du run).
    if (monsterDefeated) {
      const table =
        kind === 'boss'
          ? dungeon.lootTableBoss
          : kind === 'miniboss'
            ? dungeon.lootTableMiniboss
            : dungeon.lootTableNormal;
      rollLootInto(loot, table, lootRng);
    }

    // Wipe : toute l'équipe à terre → arrêt, échec.
    if (!teamAlive) {
      success = false;
      break;
    }

    // Monstre non vaincu mais équipe encore debout (stalemate/timeout) : on ne
    // peut pas franchir ce combat → arrêt, échec.
    if (!monsterDefeated) {
      success = false;
      break;
    }

    // Séquence terminée (boss final vaincu) → succès.
    if (i === dungeon.monsterSequence.length - 1) {
      success = true;
      break;
    }

    // Regen partielle entre deux combats, pour les survivants (basée sur PV max).
    for (const h of squad) {
      const cur = currentHp.get(h.id) ?? 0;
      if (cur <= 0) continue; // un héros à terre le reste pour le run.
      const max = maxHp.get(h.id)!;
      if (cur >= max) continue;
      const heal = Math.round(max * dungeon.regenPctBetweenFights);
      currentHp.set(h.id, Math.min(max, cur + heal));
    }
  }

  const lootRolled: DungeonLootDrop[] = [...loot.entries()].map(([resource, amount]) => ({
    resource,
    amount,
  }));

  return { fightResults, success, reachedIndex, lootRolled };
}
