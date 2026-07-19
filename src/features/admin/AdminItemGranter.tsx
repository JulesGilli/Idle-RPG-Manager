/**
 * Donneur d'objets du panneau admin.
 *
 * Principe : on ne tape aucun identifiant. On choisit une FAMILLE (forge, set,
 * relique, bijou), on filtre le catalogue, on clique le modèle voulu, puis on
 * règle zone / rareté / renfort / bénédiction. L'aperçu affiche les stats
 * EXACTES que le serveur va écrire — calculées avec les mêmes fonctions
 * partagées, donc ce qui est montré est ce qui sera créé.
 */
import { useMemo, useState } from 'react';
import {
  FORGE_BASES,
  FORGE_MATERIALS,
  craftItemAtRarity,
  weaponPassiveFor,
  effectiveBonus,
  getMaterialTier,
  getBase,
  UPGRADE_MAX,
} from '@shared/progression/forge';
import { RELIC_BASES, craftRelicAtRarity, getRelicBase } from '@shared/progression/relic';
import { GEMS, craftJewelAtRarity, getGem, refinedJewelPct, PASSIVE_META } from '@shared/progression/jewelry';
import { SETS, SET_PIECES, craftSetPieceStats, setPieceById } from '@shared/progression/sets';
import { BLESSING_MAX } from '@shared/progression/blessing';
import { zoneBossMaterial } from '@shared/progression/forge';
import { rarityColor, rarityMeta, WEIGHT_META } from '@/lib/gameUi';
import type { Rarity } from '@shared/progression/loot';

export type ItemKind = 'forge' | 'set' | 'relic' | 'jewel';

const RARITIES: Rarity[] = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'];
const KIND_LABEL: Record<ItemKind, string> = {
  forge: '⚔️ Arme / Armure',
  set: '🏅 Pièce de set',
  relic: '🗿 Relique',
  jewel: '💍 Bijou',
};

type Preview = {
  name: string;
  item_type: string;
  rarity: Rarity;
  weight: string | null;
  atk: number;
  def: number;
  hp: number;
  passive: { type: string; value: number } | null;
  setName?: string | undefined;
};

export function AdminItemGranter({
  disabled,
  busy,
  onGive,
}: {
  disabled: boolean;
  busy: boolean;
  onGive: (body: Record<string, unknown>, label: string) => void;
}) {
  const [kind, setKind] = useState<ItemKind>('forge');
  const [search, setSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState<'all' | 'weapon' | 'armor'>('all');
  const [weightFilter, setWeightFilter] = useState<'all' | 'light' | 'medium' | 'heavy'>('all');
  const [setFilter, setSetFilter] = useState<'all' | string>('all');

  const [baseId, setBaseId] = useState(FORGE_BASES[0]!.id);
  const [setPiece, setSetPiece] = useState(SET_PIECES[0]!.id);
  const [relicBase, setRelicBase] = useState(RELIC_BASES[0]!.id);
  const [gemId, setGemId] = useState(GEMS[0]!.id);

  const [materialId, setMaterialId] = useState(FORGE_MATERIALS[FORGE_MATERIALS.length - 1]!.id);
  const [rarity, setRarity] = useState<Rarity>('ultimate');
  const [upgrade, setUpgrade] = useState(0);
  const [blessing, setBlessing] = useState(0);

  const mat = getMaterialTier(materialId)!;
  const needle = search.trim().toLowerCase();

  /* ------------------------------------------------------------ catalogues */
  const forgeList = useMemo(
    () =>
      FORGE_BASES.filter(
        (b) =>
          b.label.toLowerCase().includes(needle) &&
          (slotFilter === 'all' || b.itemType === slotFilter) &&
          (weightFilter === 'all' || b.weight === weightFilter),
      ),
    [needle, slotFilter, weightFilter],
  );
  const setList = useMemo(
    () =>
      SET_PIECES.filter(
        (p) =>
          p.label.toLowerCase().includes(needle) &&
          (setFilter === 'all' || p.setId === setFilter) &&
          (weightFilter === 'all' || p.weight === weightFilter || p.weight === null),
      ),
    [needle, setFilter, weightFilter],
  );
  const gemList = useMemo(
    () =>
      GEMS.filter(
        (g) =>
          g.label.toLowerCase().includes(needle) || g.passiveLabel.toLowerCase().includes(needle),
      ),
    [needle],
  );

  /* --------------------------------------------------------------- aperçu */
  // L'objet n'est une ARME que dans la famille forge (ou une pièce de set de
  // slot weapon) : la bénédiction n'a de sens que là, et jamais au-delà du
  // niveau de renfort — même règle que `validateBless` côté Oratoire.
  const preview: Preview | null = useMemo(() => {
    try {
      if (kind === 'forge') {
        const base = getBase(baseId);
        if (!base) return null;
        const c = craftItemAtRarity(base, mat, null, rarity);
        const wp = weaponPassiveFor(base, mat);
        return {
          name: c.name,
          item_type: c.item_type,
          rarity: c.rarity,
          weight: c.weight,
          atk: effectiveBonus(c.atk_bonus, upgrade),
          def: effectiveBonus(c.def_bonus, upgrade),
          hp: effectiveBonus(c.hp_bonus, upgrade),
          passive: wp ? { type: wp.type, value: wp.pct } : null,
        };
      }
      if (kind === 'set') {
        const piece = setPieceById(setPiece);
        if (!piece) return null;
        const s = craftSetPieceStats(piece, mat);
        const set = SETS.find((x) => x.id === piece.setId);
        return {
          name: `${piece.label} (${set?.name ?? 'Set'})`,
          item_type: piece.slot,
          rarity: 'ultimate',
          weight: piece.weight,
          atk: effectiveBonus(s.atk, upgrade),
          def: effectiveBonus(s.def, upgrade),
          hp: effectiveBonus(s.hp, upgrade),
          passive: null,
          setName: set?.name,
        };
      }
      if (kind === 'relic') {
        const rb = getRelicBase(relicBase);
        if (!rb) return null;
        const c = craftRelicAtRarity(rb, mat, zoneBossMaterial(mat.zone), rarity);
        return {
          name: c.name,
          item_type: c.item_type,
          rarity: c.rarity,
          weight: null,
          atk: effectiveBonus(c.atk_bonus, upgrade),
          def: effectiveBonus(c.def_bonus, upgrade),
          hp: effectiveBonus(c.hp_bonus, upgrade),
          passive: null,
        };
      }
      const gem = getGem(gemId);
      if (!gem) return null;
      const c = craftJewelAtRarity(mat, gem, rarity);
      return {
        name: c.name,
        item_type: 'jewel',
        rarity: c.rarity,
        weight: null,
        atk: 0,
        def: 0,
        hp: 0,
        // Un bijou ne gagne pas de stats brutes au renfort : c'est un RAFFINAGE
        // qui pousse le pourcentage du passif.
        passive: { type: c.passive_type, value: refinedJewelPct(c.passive_value, upgrade, gem) },
      };
    } catch {
      return null;
    }
  }, [kind, baseId, setPiece, relicBase, gemId, mat, rarity, upgrade]);

  const isWeapon = preview?.item_type === 'weapon';
  const maxBless = Math.min(BLESSING_MAX, upgrade);
  const effBless = isWeapon ? Math.min(blessing, maxBless) : 0;

  const field =
    'rounded-lg border border-[var(--color-edge)] bg-black/40 px-2.5 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]';
  const pick = (active: boolean) =>
    `w-full rounded-lg border px-2 py-1.5 text-left text-xs transition ${
      active
        ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-[var(--color-ink)]'
        : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-[var(--color-arcane)]/50'
    }`;

  function submit() {
    const common = {
      action: 'give_item',
      kind,
      material_id: materialId,
      rarity,
      upgrade_level: upgrade,
      blessing_level: effBless,
    };
    const body =
      kind === 'set'
        ? { ...common, set_piece_id: setPiece }
        : kind === 'relic'
          ? { ...common, relic_base_id: relicBase }
          : kind === 'jewel'
            ? { ...common, gem_id: gemId }
            : { ...common, base_id: baseId };
    onGive(body, `${preview?.name ?? 'Objet'} offert`);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      {/* ------------------------------------------------ CATALOGUE FILTRÉ */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                kind === k
                  ? 'bg-[var(--color-arcane)]/25 text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 filtrer les modèles…"
            className={`${field} min-w-0 flex-1`}
          />
          {kind === 'forge' && (
            <>
              <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value as never)} className={field}>
                <option value="all">Tout</option>
                <option value="weapon">Armes</option>
                <option value="armor">Armures</option>
              </select>
              <select value={weightFilter} onChange={(e) => setWeightFilter(e.target.value as never)} className={field}>
                <option value="all">Tout poids</option>
                <option value="light">Léger</option>
                <option value="medium">Moyen</option>
                <option value="heavy">Lourd</option>
              </select>
            </>
          )}
          {kind === 'set' && (
            <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} className={field}>
              <option value="all">Tous les sets</option>
              {SETS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Grille de modèles — un clic, pas d'identifiant à taper. */}
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {kind === 'forge' &&
            forgeList.map((b) => (
              <button key={b.id} onClick={() => setBaseId(b.id)} className={pick(baseId === b.id)}>
                <span className="font-semibold text-[var(--color-ink)]">{b.label}</span>
                <span className="ml-1.5 text-[10px]">
                  {b.itemType === 'weapon' ? 'arme' : 'armure'}
                  {b.weight ? ` · ${WEIGHT_META[b.weight]?.label ?? b.weight}` : ''}
                </span>
              </button>
            ))}
          {kind === 'set' &&
            setList.map((p) => (
              <button key={p.id} onClick={() => setSetPiece(p.id)} className={pick(setPiece === p.id)}>
                <span className="font-semibold text-[var(--color-ink)]">{p.label}</span>
                <span className="ml-1.5 text-[10px]">
                  {SETS.find((s) => s.id === p.setId)?.name} · {p.slot}
                </span>
              </button>
            ))}
          {kind === 'relic' &&
            RELIC_BASES.map((r) => (
              <button key={r.id} onClick={() => setRelicBase(r.id)} className={pick(relicBase === r.id)}>
                <span className="font-semibold text-[var(--color-ink)]">
                  {r.icon} {r.label}
                </span>
                <span className="ml-1.5 text-[10px]">stat {r.primary.toUpperCase()}</span>
              </button>
            ))}
          {kind === 'jewel' &&
            gemList.map((g) => (
              <button key={g.id} onClick={() => setGemId(g.id)} className={pick(gemId === g.id)}>
                <span className="font-semibold text-[var(--color-ink)]">
                  {g.icon} {g.passiveLabel}
                </span>
                <span className="ml-1.5 text-[10px]">{g.label} · zone {g.zone}</span>
              </button>
            ))}
        </div>

        {/* Réglages communs */}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-[var(--color-muted)]">
            Zone (puissance)
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={`${field} mt-0.5 w-full`}>
              {FORGE_MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  Z{m.zone} · {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-[var(--color-muted)]">
            Rareté {kind === 'set' && <span className="text-[9px]">(forcée à ultime)</span>}
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value as Rarity)}
              disabled={kind === 'set'}
              className={`${field} mt-0.5 w-full disabled:opacity-40`}
            >
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {rarityMeta(r).label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-[var(--color-muted)]">
            Renfort +{upgrade}
            <input
              type="range"
              min={0}
              max={UPGRADE_MAX}
              value={upgrade}
              onChange={(e) => setUpgrade(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--color-gold)]"
            />
          </label>
          <label className="text-[11px] text-[var(--color-muted)]">
            Bénédiction ★{effBless}
            <input
              type="range"
              min={0}
              max={BLESSING_MAX}
              value={blessing}
              onChange={(e) => setBlessing(Number(e.target.value))}
              disabled={!isWeapon}
              className="mt-1 w-full accent-[#fb7185] disabled:opacity-30"
            />
            {!isWeapon ? (
              <span className="text-[9px] text-[var(--color-muted)]/70">armes uniquement</span>
            ) : blessing > maxBless ? (
              <span className="text-[9px] text-[var(--color-ember)]">
                plafonnée au renfort (+{upgrade})
              </span>
            ) : null}
          </label>
        </div>
      </div>

      {/* ---------------------------------------------------------- APERÇU */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Aperçu — ce qui sera créé
        </h4>
        {preview ? (
          <div className="rounded-xl border border-[var(--color-edge)] bg-black/25 p-3">
            <div className="font-display text-sm font-bold" style={{ color: rarityColor(preview.rarity) }}>
              {preview.name}
              {upgrade > 0 && <span className="ml-1 text-[var(--color-gold-soft)]">+{upgrade}</span>}
              {effBless > 0 && <span className="ml-1 text-[#fb7185]">★{effBless}</span>}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {preview.item_type} · {rarityMeta(preview.rarity).label}
              {preview.weight ? ` · ${WEIGHT_META[preview.weight]?.label ?? preview.weight}` : ''}
              {` · zone ${mat.zone}`}
            </div>
            <div className="mt-2 space-y-0.5 text-[12px]">
              {preview.atk > 0 && <div>ATK <strong className="text-[var(--color-ink)]">{preview.atk}</strong></div>}
              {preview.def > 0 && <div>DEF <strong className="text-[var(--color-ink)]">{preview.def}</strong></div>}
              {preview.hp > 0 && <div>PV <strong className="text-[var(--color-ink)]">{preview.hp}</strong></div>}
              {preview.passive && (
                <div className="text-[var(--color-arcane)]">
                  {PASSIVE_META[preview.passive.type as keyof typeof PASSIVE_META]?.label ?? preview.passive.type}{' '}
                  +{preview.passive.value}%
                </div>
              )}
              {preview.atk === 0 && preview.def === 0 && preview.hp === 0 && !preview.passive && (
                <div className="text-[var(--color-muted)]">Aucun bonus</div>
              )}
            </div>
            {preview.setName && (
              <div className="mt-2 text-[10px] text-[var(--color-gold-soft)]">
                Compte pour le set « {preview.setName} »
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-ember)]">Combinaison invalide.</p>
        )}

        <button
          onClick={submit}
          disabled={disabled || busy || !preview}
          className="btn btn-arcane w-full py-2 text-sm disabled:opacity-40"
        >
          🎁 Offrir cet objet
        </button>
        {disabled && (
          <p className="text-[11px] text-[var(--color-ember)]">Choisis d'abord un joueur cible.</p>
        )}
      </div>
    </div>
  );
}
