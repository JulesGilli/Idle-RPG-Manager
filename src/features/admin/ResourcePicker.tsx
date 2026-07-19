/**
 * Sélecteur de matériau pour le panneau admin.
 *
 * Remplace les champs où il fallait taper la clé brute (`ecorce`,
 * `poussiere_etoile`…) : personne ne les connaît par cœur, et une faute de
 * frappe créait silencieusement une ressource fantôme — `player_resources` n'a
 * aucune contrainte d'énumération, donc `ecorse` aurait été accepté et crédité
 * dans le vide.
 */
import { useMemo, useState } from 'react';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { RESOURCE_META, resourceMeta } from '@/hooks/useResources';

/** Familles de matériaux, dans l'ordre où on les cherche. */
const DUNGEON_KEYS = new Set([
  'ossement',
  'fragment_relique',
  'sceau_catacombe',
  'larme_astrale',
  'plume_appel',
]);
const EXPEDITION_KEYS = new Set([
  'seve_primordiale', 'ambre_vivant', 'coeur_sylve_ancien', 'poussiere_arcane',
  'tablette_oubliee', 'relique_noyee', 'minerai_stellaire', 'gemme_brute', 'eclat_du_noyau',
]);
const BOSS_KEYS = new Set([
  'coeur_sylve', 'givre_pur', 'oeil_sphinx', 'coeur_hydre', 'braise_eternelle',
  'fragment_titan', 'encre_kraken', 'foudre_condensee', 'coeur_ombre', 'essence_astrale',
]);
const LEGACY_KEYS = new Set(['iron', 'essence']);

type Cat = 'zone' | 'boss' | 'gemme' | 'donjon' | 'expedition' | 'legacy';

const CAT_LABEL: Record<Cat, string> = {
  zone: 'Matériaux de zone',
  boss: 'Composants de boss',
  gemme: 'Gemmes',
  donjon: 'Donjons',
  expedition: 'Expéditions',
  legacy: 'Obsolètes',
};
const CAT_ORDER: Cat[] = ['zone', 'boss', 'gemme', 'donjon', 'expedition', 'legacy'];

function catOf(key: string): Cat {
  if (key.startsWith('gemme_')) return 'gemme';
  if (DUNGEON_KEYS.has(key)) return 'donjon';
  if (EXPEDITION_KEYS.has(key)) return 'expedition';
  if (BOSS_KEYS.has(key)) return 'boss';
  if (LEGACY_KEYS.has(key)) return 'legacy';
  return 'zone';
}

export function ResourcePicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (key: string) => void;
  /** Liste plus courte, pour les colonnes étroites. */
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();

  const groups = useMemo(() => {
    const keys = Object.keys(RESOURCE_META).filter(
      (k) =>
        !needle ||
        k.toLowerCase().includes(needle) ||
        resourceMeta(k).label.toLowerCase().includes(needle),
    );
    const by = new Map<Cat, string[]>();
    for (const k of keys) {
      const c = catOf(k);
      if (!by.has(c)) by.set(c, []);
      by.get(c)!.push(k);
    }
    return CAT_ORDER.filter((c) => by.has(c)).map((c) => [c, by.get(c)!] as const);
  }, [needle]);

  const field =
    'w-full rounded-lg border border-[var(--color-edge)] bg-black/40 px-2.5 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]';

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/10 px-2 py-1 text-xs">
        <ResourceIcon resKey={value} size={14} />
        <span className="truncate font-semibold text-[var(--color-ink)]">
          {resourceMeta(value).label}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[9px] text-[var(--color-muted)]/70">
          {value}
        </span>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 filtrer les matériaux…"
        className={field}
      />
      <div className={`mt-1 space-y-1.5 overflow-y-auto pr-1 ${compact ? 'max-h-32' : 'max-h-44'}`}>
        {groups.map(([cat, keys]) => (
          <div key={cat}>
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-muted)]/70">
              {CAT_LABEL[cat]}
            </div>
            <div className="flex flex-wrap gap-1">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => onChange(k)}
                  title={k}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition ${
                    value === k
                      ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
                      : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-[var(--color-arcane)]/50 hover:text-[var(--color-ink)]'
                  }`}
                >
                  <ResourceIcon resKey={k} size={12} />
                  {resourceMeta(k).label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-[11px] text-[var(--color-muted)]">Aucun matériau ne correspond.</p>
        )}
      </div>
    </div>
  );
}
