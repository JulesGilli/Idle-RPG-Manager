import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  KEYWORDS,
  ABILITY_KEYWORDS,
  PASSIVE_KEYWORD,
  abilityKeywords,
  passiveKeyword,
  keywordsForEffects,
  keywordById,
  FAMILY_COLOR,
} from './keywords.ts';
import { PASSIVE_META } from './jewelry.ts';
import { SKILL_TREES } from './skills.ts';
import { SETS } from './sets.ts';

/**
 * Le lexique n'a de valeur que s'il est EXHAUSTIF et STABLE : un effet sans
 * mot-clé, c'est un effet que le joueur ne peut pas relier aux autres — soit
 * exactement l'opacité qu'on cherche à supprimer. Ces tests attrapent l'oubli au
 * moment où une nouvelle mécanique est ajoutée au moteur, pas six mois après.
 */

/** `kind` d'abilité déclarés dans le type `Ability` (source = le moteur). */
function engineAbilityKinds(): string[] {
  const src = readFileSync(resolve(__dirname, '../combat/types.ts'), 'utf8');
  return [...new Set([...src.matchAll(/kind: '([a-z_]+)'/g)].map((m) => m[1]!))];
}

/** `inert` = marqueur d'effet neutralisé : il n'y a rien à étiqueter. */
const NO_KEYWORD = new Set(['inert']);

describe('lexique — intégrité', () => {
  it('les ids sont uniques et les familles connues', () => {
    const ids = KEYWORDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of KEYWORDS) expect(FAMILY_COLOR[k.family], k.id).toBeTruthy();
  });

  it('chaque mot-clé a un libellé, une icône et une DÉFINITION non vides', () => {
    for (const k of KEYWORDS) {
      expect(k.label.length, k.id).toBeGreaterThan(2);
      expect(k.icon.length, k.id).toBeGreaterThan(0);
      expect(k.desc.length, k.id).toBeGreaterThan(20);
    }
  });

  it('aucun mot-clé ORPHELIN : chacun est atteignable par au moins un effet', () => {
    const used = new Set<string>([
      ...Object.values(ABILITY_KEYWORDS).flat(),
      ...Object.values(PASSIVE_KEYWORD),
    ]);
    for (const k of KEYWORDS) expect(used.has(k.id), `mot-clé « ${k.label} » jamais accordé`).toBe(true);
  });
});

describe('lexique — couverture du moteur', () => {
  it('TOUT kind d’abilité du moteur a au moins un mot-clé', () => {
    const missing = engineAbilityKinds().filter(
      (k) => !NO_KEYWORD.has(k) && (ABILITY_KEYWORDS[k] ?? []).length === 0,
    );
    expect(missing, `kinds sans mot-clé : ${missing.join(', ')}`).toEqual([]);
  });

  it('aucun mapping ne pointe vers un mot-clé inexistant', () => {
    for (const [kind, ids] of Object.entries(ABILITY_KEYWORDS)) {
      for (const id of ids) expect(keywordById(id), `${kind} → ${id}`).toBeDefined();
    }
    for (const [type, id] of Object.entries(PASSIVE_KEYWORD)) {
      expect(keywordById(id), `${type} → ${id}`).toBeDefined();
    }
  });

  it('TOUT passif de combat a son mot-clé, et il porte le MÊME nom qu’en joaillerie', () => {
    // Une gemme « Égide » et un nœud d'arbre « Égide » doivent être le même mot :
    // deux libellés pour un seul effet, c'est deux effets pour le joueur.
    for (const type of Object.keys(PASSIVE_META) as (keyof typeof PASSIVE_META)[]) {
      const kw = passiveKeyword(type);
      expect(kw, type).toBeDefined();
      expect(kw!.label, type).toBe(PASSIVE_META[type].label);
    }
  });
});

describe('lexique — couverture du contenu jouable', () => {
  it('chaque nœud d’arbre APPRENABLE affiche au moins un mot-clé', () => {
    const orphans: string[] = [];
    for (const [classId, branches] of Object.entries(SKILL_TREES)) {
      for (const b of branches) {
        for (const node of b.nodes) {
          if (node.pending) continue; // effet pas encore branché au moteur
          const kws = keywordsForEffects(
            (node.abilities ?? []).map((a) => a.kind),
            (node.passives ?? []).map((p) => p.type),
          );
          if (kws.length === 0) orphans.push(`${classId}/${node.id}`);
        }
      }
    }
    expect(orphans, `nœuds sans mot-clé : ${orphans.join(', ')}`).toEqual([]);
  });

  it('chaque effet de set complet est étiqueté', () => {
    const orphans = SETS.filter(
      (s) => keywordsForEffects(s.abilities4.map((a) => a.kind)).length === 0,
    ).map((s) => s.id);
    expect(orphans, `sets sans mot-clé : ${orphans.join(', ')}`).toEqual([]);
  });
});

describe('lexique — rendu', () => {
  it('les mots-clés sortent dans l’ORDRE du lexique, sans doublon', () => {
    // Deux nœuds portant les mêmes mécaniques doivent afficher la même suite de
    // chips, quel que soit l'ordre dans lequel leurs effets sont déclarés.
    const a = keywordsForEffects(['barrier', 'taunt', 'revive']).map((k) => k.id);
    const b = keywordsForEffects(['revive', 'taunt', 'barrier']).map((k) => k.id);
    expect(a).toEqual(b);
    expect(keywordsForEffects(['barrier', 'ally_shield']).map((k) => k.id)).toEqual(['barriere', 'soin']);
  });

  it('un kind inconnu ne casse rien — il ne rend simplement aucun chip', () => {
    expect(abilityKeywords('kind_qui_nexiste_pas')).toEqual([]);
    expect(keywordsForEffects(['inert'])).toEqual([]);
  });
});
