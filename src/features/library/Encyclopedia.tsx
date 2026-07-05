import { useState } from 'react';
import { resourceMeta, RESOURCE_META } from '@/hooks/useResources';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, ItemTypeIcon, PassiveIcon } from '@/components/synty/GameIcons';
import {
  SETS,
  SET_PIECES,
  setPieceRecipe,
  SET_BOSS_COMPONENT,
  type SlotType,
} from '@shared/progression/sets';
import { FORGE_BASES, FORGE_MATERIALS } from '@shared/progression/forge';
import { RELIC_BASES } from '@shared/progression/relic';
import { GEMS } from '@shared/progression/jewelry';
import { ARCS } from '@shared/progression/arcs';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account';

/* ------------------------------------------------------------------ helpers */

const SLOT_LABEL: Record<SlotType, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  jewel: 'Bijou',
  relic: 'Relique',
};
const SLOT_ATELIER: Record<SlotType, string> = {
  weapon: 'Forge',
  armor: 'Forge',
  jewel: 'Joaillerie',
  relic: 'Autel des Reliques',
};

function statLine(b: { atk: number; def: number; hp: number }): string {
  return (
    [b.atk ? `+${b.atk} ATK` : null, b.def ? `+${b.def} DEF` : null, b.hp ? `+${b.hp} PV` : null]
      .filter(Boolean)
      .join(' · ') || '—'
  );
}

/** Catégorie d'une ressource (pour la section Matériaux). */
type MatCat = 'zone' | 'boss' | 'gemme' | 'donjon' | 'expedition' | 'legacy';

const DUNGEON_KEYS = new Set(['ossement', 'fragment_relique', 'sceau_catacombe']);
const EXPEDITION_KEYS = new Set([
  'seve_primordiale', 'ambre_vivant', 'coeur_sylve_ancien', 'poussiere_arcane',
  'tablette_oubliee', 'relique_noyee', 'minerai_stellaire', 'gemme_brute', 'eclat_du_noyau',
]);
const BOSS_KEYS = new Set([
  'coeur_sylve', 'givre_pur', 'oeil_sphinx', 'coeur_hydre', 'braise_eternelle',
  'fragment_titan', 'encre_kraken', 'foudre_condensee', 'coeur_ombre', 'essence_astrale',
]);
const LEGACY_KEYS = new Set(['iron', 'essence']);

function matCategory(key: string): MatCat {
  if (key.startsWith('gemme_')) return 'gemme';
  if (DUNGEON_KEYS.has(key)) return 'donjon';
  if (EXPEDITION_KEYS.has(key)) return 'expedition';
  if (BOSS_KEYS.has(key)) return 'boss';
  if (LEGACY_KEYS.has(key)) return 'legacy';
  return 'zone';
}

const CAT_META: Record<MatCat, { label: string; source: string }> = {
  zone: { label: 'Matériaux de zone', source: 'Butin des combats gagnés sur la carte (un par zone).' },
  boss: { label: 'Composants de boss', source: 'Lâchés par les boss de zone (niveau 5 de chaque zone).' },
  gemme: { label: 'Gemmes', source: 'Drop rare des boss de zone (~2 %). Donnent le passif des bijoux.' },
  donjon: { label: 'Butin de donjon', source: 'Récupéré dans les Donjons. Sert aux reliques et aux sets.' },
  expedition: { label: "Matériaux d'expédition", source: 'Rapportés par les Expéditions. Cœur des pièces de set.' },
  legacy: { label: 'Anciennes ressources', source: 'Reliquats d’anciens systèmes.' },
};

/* -------------------------------------------------------------------- pane */

type Section = 'sets' | 'passifs' | 'craft' | 'materiaux' | 'progression';

const SECTIONS: { id: Section; label: string; icon: 'boss' | 'jewel' | 'forge' | 'materials' | 'xp' }[] = [
  { id: 'sets', label: "Sets d'ensemble", icon: 'boss' },
  { id: 'passifs', label: 'Passifs & gemmes', icon: 'jewel' },
  { id: 'craft', label: 'Forge & reliques', icon: 'forge' },
  { id: 'materiaux', label: 'Matériaux', icon: 'materials' },
  { id: 'progression', label: 'Progression', icon: 'xp' },
];

export function Encyclopedia() {
  const [section, setSection] = useState<Section>('sets');

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)]">
        Le grand grimoire du royaume : sets et leurs bonus, passifs, recettes et provenance des
        matériaux. Tout ce qu'il faut savoir pour équiper ton escouade.
      </p>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              section === s.id
                ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
            }`}
          >
            <UiIcon name={s.icon} size={15} color="currentColor" /> {s.label}
          </button>
        ))}
      </div>

      {section === 'sets' && <SetsPane />}
      {section === 'passifs' && <PassifsPane />}
      {section === 'craft' && <CraftPane />}
      {section === 'materiaux' && <MateriauxPane />}
      {section === 'progression' && <ProgressionPane />}
    </div>
  );
}

/* -------------------------------------------------------------------- SETS */

function SetsPane() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-muted)]">
        Porter <strong>2 pièces</strong> d'un même set octroie un bonus, <strong>4 pièces</strong> un
        bonus majeur (cumulatif). Les pièces sont universelles (toutes classes) et se forgent dans
        l'atelier correspondant au slot.
      </p>
      {SETS.map((set) => {
        const pieces = SET_PIECES.filter((p) => p.setId === set.id);
        return (
          <div key={set.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-display font-semibold text-[var(--color-ink)]">{set.name}</div>
                <div className="text-[11px] italic text-[var(--color-muted)]">{set.theme}</div>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="chip bg-white/5 text-[var(--color-muted)]">
                  2 pièces : <span className="text-[var(--color-gold-soft)]">{statLine(set.bonus2)}</span>
                </span>
                <span className="chip bg-white/5 text-[var(--color-muted)]">
                  4 pièces : <span className="text-[var(--color-gold-soft)]">{statLine(set.bonus4)}</span>
                </span>
              </div>
            </div>

            {SET_BOSS_COMPONENT[set.id] && (
              <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                <span>Composant signature :</span>
                <ResourceIcon resKey={SET_BOSS_COMPONENT[set.id]!} size={13} />
                {resourceMeta(SET_BOSS_COMPONENT[set.id]!).label}
              </div>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {pieces.map((p) => {
                const recipe = setPieceRecipe(p);
                return (
                  <div key={p.id} className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium text-[var(--color-ink)]">
                        <ItemTypeIcon type={p.slot} size={16} color="var(--color-muted)" /> {p.label}
                      </span>
                      <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
                        {SLOT_LABEL[p.slot]} · {SLOT_ATELIER[p.slot]}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--color-ink)]/80">{statLine(p)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="text-[var(--color-gold-soft)]">
                        <UiIcon name="gold" size={10} /> {recipe.gold}
                      </span>
                      {recipe.materials.map((m) => (
                        <span key={m.key} className="inline-flex items-center gap-1 text-[var(--color-ink)]/75">
                          <ResourceIcon resKey={m.key} size={12} /> {resourceMeta(m.key).label} ×{m.qty}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- PASSIFS */

function PassifsPane() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)]">
        Un <strong>bijou</strong> ne donne aucune stat brute : il porte un <strong>passif en %</strong>.
        La gemme (drop rare des boss) fixe le type de passif ; le composant de zone fixe sa puissance.
        Le <strong>raffinage</strong> à la Joaillerie augmente le %, jusqu'au plafond.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {GEMS.map((g) => (
          <div key={g.id} className="panel p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--color-ink)]">
                <ResourceIcon resKey={g.id} size={16} /> {g.label}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-arcane)]">
                <PassiveIcon passive={g.passive} size={12} /> {g.passiveLabel}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              {g.description.replace('{X}', `${g.basePct}–${g.maxPct}`)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]/80">
              <span>Boss de la zone {g.zone}</span>
              <span className="chip bg-white/5">Plafond {g.maxPct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- CRAFT */

const WEIGHT_LABEL: Record<string, string> = { light: 'Léger', medium: 'Moyen', heavy: 'Lourd' };

function CraftPane() {
  const materials = [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone);
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="forge" size={16} color="var(--color-gold-soft)" /> Comment se forge un objet
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          On choisit un <strong>modèle</strong> (le type d'objet) puis un <strong>composant</strong> de
          zone. Le composant fixe la <strong>puissance</strong> (croît avec la zone et le tier) et le{' '}
          <strong>thème</strong> de stats. La <strong>rareté</strong> module la qualité de −20 %
          (Médiocre) à +35 % (Ultime). Armes/armures à la Forge, bijoux à la Joaillerie (+ gemme),
          reliques à l'Autel (+ butin de donjon).
        </p>
      </div>

      <div className="panel p-4">
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">Modèles</div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {FORGE_BASES.map((b) => (
            <span key={b.id} className="chip bg-white/5 text-[var(--color-ink)]/85">
              <ItemTypeIcon type={b.itemType} size={11} color="currentColor" /> {b.label} ·{' '}
              {WEIGHT_LABEL[b.weight]}
            </span>
          ))}
          {RELIC_BASES.map((b) => (
            <span key={b.id} className="chip bg-white/5 text-[var(--color-ink)]/85">
              <ItemTypeIcon type="relic" size={11} color="currentColor" /> {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
          Composants de zone (puissance & thème)
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m) => {
            const theme =
              [
                m.theme.atk ? 'ATK' : null,
                m.theme.def ? 'DEF' : null,
                m.theme.hp ? 'PV' : null,
              ]
                .filter(Boolean)
                .join(' / ') || 'équilibré';
            return (
              <div key={m.id} className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--color-ink)]">{m.label}</span>
                  <span className="flex items-center gap-1 text-[10px]">
                    <span className="chip bg-[var(--color-gold)]/15 font-semibold text-[var(--color-gold-soft)]">
                      T{m.craftTier}
                    </span>
                    <span className="chip bg-white/5 text-[var(--color-muted)]">Zone {m.zone}</span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                  <span>Puissance {m.magnitude}</span>
                  <span>Thème : {theme}</span>
                  {m.materials.map((x) => (
                    <span key={x.key} className="inline-flex items-center gap-1 text-[var(--color-ink)]/70">
                      <ResourceIcon resKey={x.key} size={11} /> ×{x.qty}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- MATÉRIAUX */

function MateriauxPane() {
  const byCat = new Map<MatCat, string[]>();
  for (const key of Object.keys(RESOURCE_META)) {
    const cat = matCategory(key);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(key);
  }
  const order: MatCat[] = ['zone', 'boss', 'gemme', 'donjon', 'expedition', 'legacy'];

  return (
    <div className="space-y-3">
      {order.map((cat) => {
        const keys = byCat.get(cat);
        if (!keys || keys.length === 0) return null;
        return (
          <div key={cat} className="panel p-4">
            <h3 className="font-display font-semibold text-[var(--color-ink)]">{CAT_META[cat].label}</h3>
            <p className="mb-2 text-[11px] text-[var(--color-muted)]">{CAT_META[cat].source}</p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {keys.map((k) => (
                <span key={k} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]/85">
                  <ResourceIcon resKey={k} size={13} /> {resourceMeta(k).label}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ PROGRESSION */

const ACTIVITY_LABEL: Partial<Record<ActivityKey, string>> = {
  inventory: 'Sac',
  village: 'Village',
  tavern: 'Taverne',
  forge: 'Forge',
  library: 'Bibliothèque',
  dungeon: 'Donjons',
  arc_boss: "Boss d'arc",
  jewelry: 'Joaillerie',
  relic: 'Autel des Reliques',
  expedition: 'Expéditions',
  guild: 'Guilde',
};

function ProgressionPane() {
  const activities = (Object.keys(ACTIVITY_UNLOCKS) as ActivityKey[]).sort(
    (a, b) => ACTIVITY_UNLOCKS[a] - ACTIVITY_UNLOCKS[b],
  );
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="map" size={16} color="var(--color-gold-soft)" /> Arcs & tiers de matériaux
        </h3>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          La carte est découpée en <strong>arcs</strong>. Terminer un arc et vaincre son{' '}
          <strong>boss d'arc</strong> débloque l'arc suivant et son <strong>tier de matériaux</strong>
          {' '}(objets plus puissants).
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {ARCS.map((a) => (
            <span key={a.id} className="chip bg-white/5 text-[var(--color-ink)]/85">
              {a.name} · Tier {a.tier}
              {a.mapIds.length === 0 && (
                <span className="ml-1 text-[var(--color-muted)]">(à venir)</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="xp" size={16} color="var(--color-gold-soft)" /> Déblocage des activités
        </h3>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          Ton <strong>niveau de compte</strong> (10 % de l'XP de tes héros) débloque les activités du
          royaume.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {activities.map((a) => (
            <div
              key={a}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-sm"
            >
              <span className="text-[var(--color-ink)]">{ACTIVITY_LABEL[a] ?? a}</span>
              <span className="chip bg-[var(--color-arcane)]/15 text-[11px] text-[var(--color-arcane)]">
                Niv. {ACTIVITY_UNLOCKS[a]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
