/**
 * Donneur d'objets du panneau admin.
 *
 * Principe : on ne tape aucun identifiant. On choisit une FAMILLE (forge, set,
 * relique, bijou), on filtre le catalogue, on clique le modèle voulu, puis on
 * règle zone / rareté / renfort / bénédiction. L'aperçu affiche les stats
 * EXACTES que le serveur va écrire — calculées avec les mêmes fonctions
 * partagées, donc ce qui est montré est ce qui sera créé.
 */
import { useEffect, useMemo, useState } from 'react';
import { displayHp, HERO_HP_SCALE } from '@shared/progression/formulas';
import {
  FORGE_BASES,
  FORGE_MATERIALS,
  craftItemAtRarity,
  weaponPassiveFor,
  effectiveBonus,

  getBase,
  UPGRADE_MAX,
} from '@shared/progression/forge';
import { RELIC_BASES, craftRelicAtRarity, getRelicBase } from '@shared/progression/relic';
import { GEMS, craftJewelAtRarity, refinedJewelPct, PASSIVE_META } from '@shared/progression/jewelry';
import { SETS, SET_PIECES, craftSetPieceStats, setPieceById, setPieceWrongArc } from '@shared/progression/sets';
import { divineStats, divinePassive, divineName, isDivineForgeable, DIVINE_MIN_ARC } from '@shared/progression/divine';
import {
  forgeMaterialsForArc,
  gemsForArc,
  materialForArc,
  gemForArc,
} from '@shared/progression/arcMaterials';
import { tierGearMult } from '@shared/progression/arc';
import { BLESSING_MAX } from '@shared/progression/blessing';
import { zoneBossMaterial } from '@shared/progression/forge';
import { rarityColor, rarityMeta, WEIGHT_META } from '@/lib/gameUi';
import type { Rarity } from '@shared/progression/loot';

export type ItemKind = 'forge' | 'divine' | 'set' | 'relic' | 'jewel' | 'custom';

const RARITIES: Rarity[] = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'];
const KIND_LABEL: Record<ItemKind, string> = {
  forge: '⚔️ Arme / Armure',
  divine: '✦ Divin',
  set: '🏅 Pièce de set',
  relic: '🗿 Relique',
  jewel: '💍 Bijou',
  custom: '🟣 Admin',
};

type CustomSlot = 'weapon' | 'armor' | 'jewel' | 'relic';
type CustomWeight = 'light' | 'medium' | 'heavy';
const CUSTOM_SLOT_LABEL: Record<CustomSlot, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  jewel: 'Bijou',
  relic: 'Relique',
};

type Preview = {
  name: string;
  item_type: string;
  // 'admin' = palier violet hors système de butin (objet sur-mesure).
  rarity: Rarity | 'admin';
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
  arc,
  onGive,
}: {
  disabled: boolean;
  busy: boolean;
  /**
   * Arc COURANT du joueur ciblé. Le serveur estampille l'objet à cet arc et met
   * ses stats à l'échelle : le panneau doit donc proposer les catalogues de CET
   * arc (les ids de matériaux et de gemmes diffèrent d'un arc à l'autre) et
   * afficher l'aperçu au même barème, sinon il annonce un objet qu'il ne donne pas.
   */
  arc: number;
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

  // Objet admin sur-mesure : slot, poids et stats LIBRES (rareté violette).
  const [customSlot, setCustomSlot] = useState<CustomSlot>('weapon');
  const [customWeight, setCustomWeight] = useState<CustomWeight>('heavy');
  const [customName, setCustomName] = useState('Objet admin');
  const [customAtk, setCustomAtk] = useState(0);
  const [customDef, setCustomDef] = useState(0);
  const [customHp, setCustomHp] = useState(0);
  const customHasWeight = customSlot === 'weapon' || customSlot === 'armor';

  /* ------------------------------------------------- catalogues DE L'ARC -- */
  // Les ids diffèrent d'un arc à l'autre (`ecorce` ↔ son jumeau d'arc 2) : une
  // sélection faite dans un arc n'existe pas dans l'autre. On RÉSOUT donc avec
  // repli sur le premier élément de l'arc plutôt que de planter, et on remet la
  // sélection d'aplomb quand l'arc change (cf. effet plus bas).
  const materials = useMemo(() => forgeMaterialsForArc(arc), [arc]);
  const gems = useMemo(() => gemsForArc(arc), [arc]);
  const mat = materialForArc(materialId, arc) ?? materials[materials.length - 1]!;
  const gem = gemForArc(gemId, arc) ?? gems[0]!;
  /**
   * Stat telle que le SERVEUR va l'écrire : barème de l'arc d'abord, renfort
   * ensuite — exactement l'ordre de `admin-actions`. L'inverser donnerait des
   * chiffres proches mais faux, et l'aperçu ne servirait plus de garantie.
   */
  const scaled = (v: number): number => effectiveBonus(Math.round(v * tierGearMult(arc)), upgrade);

  useEffect(() => {
    if (!materialForArc(materialId, arc)) setMaterialId(materials[materials.length - 1]!.id);
    if (!gemForArc(gemId, arc)) setGemId(gems[0]!.id);
    if (setPieceWrongArc(setPiece, arc)) {
      const first = SET_PIECES.find((p) => !setPieceWrongArc(p.id, arc));
      if (first) setSetPiece(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arc]);

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
          // Les sets d'un AUTRE arc n'existent pas pour ce joueur : les offrir
          // donnerait une pièce dont le bonus d'ensemble ne se déclenche jamais.
          !setPieceWrongArc(p.id, arc) &&
          p.label.toLowerCase().includes(needle) &&
          (setFilter === 'all' || p.setId === setFilter) &&
          (weightFilter === 'all' || p.weight === weightFilter || p.weight === null),
      ),
    [needle, setFilter, weightFilter, arc],
  );
  const gemList = useMemo(
    () =>
      gems.filter(
        (g) =>
          g.label.toLowerCase().includes(needle) || g.passiveLabel.toLowerCase().includes(needle),
      ),
    [needle, gems],
  );

  /* --------------------------------------------------------------- aperçu */
  // L'objet n'est une ARME que dans la famille forge (ou une pièce de set de
  // slot weapon) : la bénédiction n'a de sens que là, et jamais au-delà du
  // niveau de renfort — même règle que `validateBless` côté Oratoire.
  const preview: Preview | null = useMemo(() => {
    try {
      if (kind === 'custom') {
        // Stats saisies TELLES QUELLES (aucune mise à l'échelle). Les PV sont
        // saisis en valeur affichée : on repasse en brut (÷ échelle) pour que
        // `displayHp` réaffiche exactement le chiffre voulu, comme le fera le
        // serveur au stockage.
        return {
          name: customName.trim() || 'Objet admin',
          item_type: customSlot,
          rarity: 'admin',
          weight: customHasWeight ? customWeight : null,
          atk: customAtk,
          def: customDef,
          hp: Math.round(customHp / HERO_HP_SCALE),
          passive: null,
        };
      }
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
          atk: scaled(c.atk_bonus),
          def: scaled(c.def_bonus),
          hp: scaled(c.hp_bonus),
          passive: wp ? { type: wp.type, value: wp.pct } : null,
        };
      }
      if (kind === 'divine') {
        // Forge Sacrée : arme/armure + gemme (passif unique, à son plafond). Les
        // stats de base viennent de `divineStats` (ultime dopé) ; le passif n'est
        // PAS raffiné par le renfort (valeur fixe de la gemme), comme au craft réel.
        const base = getBase(baseId);
        if (!base || !isDivineForgeable(base)) return null;
        const s = divineStats(base, mat);
        const passive = divinePassive(gem);
        return {
          name: divineName(base, gem),
          item_type: base.itemType,
          rarity: 'ultimate',
          weight: base.weight,
          atk: scaled(s.atk),
          def: scaled(s.def),
          hp: scaled(s.hp),
          passive: { type: passive.type, value: passive.value },
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
          atk: scaled(s.atk),
          def: scaled(s.def),
          hp: scaled(s.hp),
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
          atk: scaled(c.atk_bonus),
          def: scaled(c.def_bonus),
          hp: scaled(c.hp_bonus),
          passive: null,
        };
      }
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
  }, [
    kind,
    baseId,
    setPiece,
    relicBase,
    gemId,
    mat,
    rarity,
    upgrade,
    customSlot,
    customWeight,
    customHasWeight,
    customName,
    customAtk,
    customDef,
    customHp,
  ]);

  // Bénédiction : armes NON divines seulement. Un objet divin porte déjà un
  // passif de gemme et suit un renforcement spécial (Éclat d'Éternité) — le
  // bénir n'a pas de sens et l'Oratoire refuserait ensuite de le retoucher.
  const isDivine = kind === 'divine';
  const canBless = preview?.item_type === 'weapon' && !isDivine;
  const maxBless = Math.min(BLESSING_MAX, upgrade);
  const effBless = canBless ? Math.min(blessing, maxBless) : 0;

  const field =
    'rounded-lg border border-[var(--color-edge)] bg-black/40 px-2.5 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]';
  const pick = (active: boolean) =>
    `w-full rounded-lg border px-2 py-1.5 text-left text-xs transition ${
      active
        ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-[var(--color-ink)]'
        : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-[var(--color-arcane)]/50'
    }`;

  function submit() {
    if (kind === 'custom') {
      onGive(
        {
          action: 'give_item',
          kind: 'custom',
          item_type: customSlot,
          weight: customHasWeight ? customWeight : null,
          name: customName.trim() || 'Objet admin',
          atk: customAtk,
          def: customDef,
          hp: customHp,
        },
        `${customName.trim() || 'Objet admin'} offert`,
      );
      return;
    }
    const common = {
      action: 'give_item',
      kind,
      material_id: mat.id,
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
            ? { ...common, gem_id: gem.id }
            : kind === 'divine'
              ? { ...common, base_id: baseId, gem_id: gem.id }
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

        {kind === 'custom' ? (
          <div className="space-y-3 rounded-lg border border-[#a855f7]/40 bg-[#a855f7]/5 p-3">
            <p className="text-[11px] text-[var(--color-muted)]">
              Objet sur-mesure : stats libres, rareté violette « admin ». Aucune mise à l'échelle
              d'arc — les valeurs sont écrites telles quelles.
            </p>
            <label className="block text-[11px] text-[var(--color-muted)]">
              Nom
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={60}
                placeholder="Objet admin"
                className={`${field} mt-0.5 w-full`}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-[var(--color-muted)]">
                Type
                <select
                  value={customSlot}
                  onChange={(e) => setCustomSlot(e.target.value as CustomSlot)}
                  className={`${field} mt-0.5 w-full`}
                >
                  {(Object.keys(CUSTOM_SLOT_LABEL) as CustomSlot[]).map((s) => (
                    <option key={s} value={s}>
                      {CUSTOM_SLOT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-[var(--color-muted)]">
                Poids {!customHasWeight && <span className="text-[9px]">(bijou/relique : n/a)</span>}
                <select
                  value={customWeight}
                  onChange={(e) => setCustomWeight(e.target.value as CustomWeight)}
                  disabled={!customHasWeight}
                  className={`${field} mt-0.5 w-full disabled:opacity-40`}
                >
                  <option value="light">Léger</option>
                  <option value="medium">Moyen</option>
                  <option value="heavy">Lourd</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] text-[var(--color-muted)]">
                ATK
                <input
                  type="number"
                  min={0}
                  value={customAtk}
                  onChange={(e) => setCustomAtk(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                  className={`${field} mt-0.5 w-full`}
                />
              </label>
              <label className="text-[11px] text-[var(--color-muted)]">
                DEF
                <input
                  type="number"
                  min={0}
                  value={customDef}
                  onChange={(e) => setCustomDef(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                  className={`${field} mt-0.5 w-full`}
                />
              </label>
              <label className="text-[11px] text-[var(--color-muted)]">
                PV
                <input
                  type="number"
                  min={0}
                  value={customHp}
                  onChange={(e) => setCustomHp(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                  className={`${field} mt-0.5 w-full`}
                />
              </label>
            </div>
            <p className="text-[9px] text-[var(--color-muted)]/70">
              PV en valeur AFFICHÉE (comme sur la carte). ATK / DEF directs. Le poids fixe qui peut
              équiper l'arme/l'armure.
            </p>
          </div>
        ) : (
          <>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 filtrer les modèles…"
            className={`${field} min-w-0 flex-1`}
          />
          {(kind === 'forge' || kind === 'divine') && (
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
          {kind === 'divine' && (
            // La gemme fixe le PASSIF unique de l'objet divin (à son plafond).
            <select value={gemId} onChange={(e) => setGemId(e.target.value)} className={field} title="Gemme (passif divin)">
              {gems.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.passiveLabel}
                </option>
              ))}
            </select>
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
          {(kind === 'forge' || kind === 'divine') &&
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

        {/* Arc de la cible : sans ce rappel, l'admin ne sait pas à quel barème
            correspondent les chiffres qu'il lit — et les catalogues changent
            sous ses yeux en changeant de joueur, sans explication. */}
        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
            arc >= 2
              ? 'border-[var(--color-ember)]/50 bg-[var(--color-ember)]/10 text-[var(--color-ember)]'
              : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)]'
          }`}
        >
          <span className="font-semibold">Arc {arc}</span>
          <span className="text-[var(--color-muted)]">
            {arc >= 2
              ? `catalogues et stats de l'Arc ${arc} (×${tierGearMult(arc)})`
              : 'catalogues et stats de base'}
            {' — l’objet suit l’arc du joueur ciblé.'}
          </span>
          {isDivine && arc < DIVINE_MIN_ARC && (
            <span className="w-full text-[10px] text-[var(--color-ember)]">
              Le Divin est du contenu d’Arc {DIVINE_MIN_ARC} : donné à un joueur d’Arc {arc}, il sort à
              l’échelle de base (bien plus faible).
            </span>
          )}
        </div>

        {/* Réglages communs */}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-[var(--color-muted)]">
            Zone (puissance)
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={`${field} mt-0.5 w-full`}>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  Z{m.zone} · {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-[var(--color-muted)]">
            Rareté {(kind === 'set' || kind === 'divine') && <span className="text-[9px]">(forcée à ultime)</span>}
            <select
              value={kind === 'divine' ? 'ultimate' : rarity}
              onChange={(e) => setRarity(e.target.value as Rarity)}
              disabled={kind === 'set' || kind === 'divine'}
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
              disabled={!canBless}
              className="mt-1 w-full accent-[#fb7185] disabled:opacity-30"
            />
            {!canBless ? (
              <span className="text-[9px] text-[var(--color-muted)]/70">
                {isDivine ? 'objet divin : pas de bénédiction' : 'armes uniquement'}
              </span>
            ) : blessing > maxBless ? (
              <span className="text-[9px] text-[var(--color-ember)]">
                plafonnée au renfort (+{upgrade})
              </span>
            ) : null}
          </label>
        </div>
          </>
        )}
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
              {/* La zone n'a de sens que pour un objet issu d'un composant : un objet
                  admin sur-mesure n'en a pas. */}
              {kind !== 'custom' && ` · zone ${mat.zone}`}
            </div>
            <div className="mt-2 space-y-0.5 text-[12px]">
              {preview.atk > 0 && <div>ATK <strong className="text-[var(--color-ink)]">{preview.atk}</strong></div>}
              {preview.def > 0 && <div>DEF <strong className="text-[var(--color-ink)]">{preview.def}</strong></div>}
              {/* PV en valeur EFFECTIVE (xHERO_HP_SCALE), comme partout ailleurs : un PV brut
                  ici induirait en erreur au moment de diagnostiquer un objet. */}
              {preview.hp > 0 && <div>PV <strong className="text-[var(--color-ink)]">{displayHp(preview.hp)}</strong></div>}
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
