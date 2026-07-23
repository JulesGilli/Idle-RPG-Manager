import type { ReactNode } from 'react';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { STAT_GLYPH, type UiIconName } from '@/lib/synty';
import { rarityMeta } from '@/lib/gameUi';
import { type StatKey } from '@shared/progression/forge';
import { bossMaterialsForArc } from '@shared/progression/arcMaterials';
import { scaleRecipeForArc } from '@shared/progression/arc';
import { displayHp } from '@shared/progression/formulas';

/**
 * Briques d'UI PARTAGÉES par les ateliers guidés (Forge, Joaillerie, Autel).
 * Même langage visuel partout : étapes numérotées, ingrédients, pastilles.
 */

export const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

const STAT_SHORT: Record<StatKey, string> = { atk: 'ATK', def: 'DEF', hp: 'PV' };

/**
 * LE CHOIX DE L'ESSENCE — partagé par la Forge et l'Autel, qui suivent la même
 * règle. Le matériau de boss était une taxe : imposé par la zone du composant,
 * payé sans rien décider. Il décide désormais des stats SECONDAIRES, et c'est le
 * seul endroit du craft où le joueur arbitre autre chose que de la puissance.
 *
 * Pas de picker à la Joaillerie : un bijou n'a aucune stat brute à orienter, son
 * « boss » à lui c'est la gemme, et elle décide déjà du passif.
 *
 * « Aucune » est une option pleine, pas un défaut par dépit : les zones 1 à 3
 * n'ont pas de boss, et forger sans essence reste légitime pour ne pas gâcher
 * une essence rare sur un craft de masse.
 */
export function BossPicker({
  res,
  value,
  onPick,
  disabled,
  /** Stat déjà prioritaire (relique) : l'essence qui ne verse QUE ça ne sert à rien. */
  primary,
  /** Arc courant : il décide du CATALOGUE d'essences ET de leur coût réel. */
  arc,
}: {
  res: Record<string, number>;
  value: string | null;
  onPick: (key: string | null) => void;
  disabled: boolean;
  primary?: StatKey;
  arc: number;
}) {
  // En arc 2 les essences sont les JUMELLES (Cœur flétri, Givre mort…) et leur
  // quantité suit `forgeCostMult`. Lister celles d'arc 1 affichait des essences
  // que le joueur ne possède pas — et que le serveur refuse.
  const essences = bossMaterialsForArc(arc).map((b) => ({
    ...b,
    qty: scaleRecipeForArc({ gold: 0, materials: [{ key: b.key, qty: b.qty }] }, arc).materials[0]!.qty,
  }));
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
      <p className="mb-2 text-[11px] text-[var(--color-muted)]">
        L'<strong className="text-[var(--color-ink)]">essence de boss</strong> oriente les stats{' '}
        <strong className="text-[var(--color-ink)]">secondaires</strong> : sa zone dose, le composant amplifie.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPick(null)}
          disabled={disabled}
          title="Aucune stat secondaire — seul le profil du modèle joue."
          className={`chip border text-[10px] transition ${
            value === null
              ? 'border-current bg-white/5 text-[var(--color-ink)]'
              : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
          } ${disabled ? 'opacity-60' : ''}`}
        >
          Aucune
        </button>
        {essences.map((b) => {
          const have = res[b.key] ?? 0;
          const active = value === b.key;
          const enough = have >= b.qty;
          // Une essence dont TOUTES les stats sont déjà la prioritaire du modèle
          // ne donnerait aucun secondaire : on le dit plutôt que de le laisser
          // découvrir après coup.
          const wasted = !!primary && b.stats.every((s) => s === primary);
          return (
            <button
              key={b.key}
              onClick={() => onPick(b.key)}
              disabled={disabled}
              title={
                wasted
                  ? `${b.label} — ne verse que ${STAT_SHORT[primary]}, déjà prioritaire ici : aucun secondaire.`
                  : `${b.label} — boss de la zone ${b.zone}. Verse ${b.stats
                      .map((s) => STAT_SHORT[s])
                      .join(' + ')} en secondaire.`
              }
              className={`chip inline-flex items-center gap-1 border text-[10px] transition ${
                active
                  ? 'border-current bg-[var(--color-arcane)]/10 text-[var(--color-arcane)]'
                  : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
              } ${disabled ? 'opacity-60' : ''} ${wasted && !active ? 'opacity-45' : ''}`}
            >
              <ResourceIcon resKey={b.key} size={12} />
              <span className={active ? '' : 'text-[var(--color-ink)]/70'}>
                {b.stats.map((s) => STAT_SHORT[s]).join('+')}
              </span>
              <span className={enough ? 'text-[var(--color-muted)]' : 'text-[var(--color-ember)]'}>
                {have}/{b.qty}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Progression de maîtrise, commune aux trois ateliers de craft. */
export type MasteryInfo = { level: number; xpInto: number; xpForNext: number };

/**
 * Barre de maîtrise d'un atelier. Les trois (forge, joaillerie, reliquaire)
 * partagent la même courbe et le même effet — meilleures raretés en montant —
 * donc la même barre, plutôt que trois copies à faire diverger.
 */
export function MasteryBar({
  icon,
  info,
  maxLevel,
}: {
  icon: UiIconName;
  info: MasteryInfo;
  maxLevel: number;
}) {
  const atMax = info.level >= maxLevel;
  const pct = atMax ? 100 : info.xpForNext > 0 ? Math.round((info.xpInto / info.xpForNext) * 100) : 0;
  return (
    <div className="mt-3 max-w-xs">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name={icon} size={12} color="var(--color-gold-soft)" /> Maîtrise Nv.{info.level}
          {atMax && <span className="font-normal text-[var(--color-gold-soft)]">· max</span>}
        </span>
        <span className="tabular-nums text-[var(--color-muted)]">
          {atMax ? '—' : `${info.xpInto}/${info.xpForNext} XP`}
        </span>
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-black/40">
        <span
          className="block h-full rounded-full bg-[var(--color-gold-soft)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

/** Un « ingrédient » de la recette : icône encadrée + libellé (pour l'assemblage visuel). */
export function Ingredient({
  glyph,
  icon,
  label,
  tone,
}: {
  glyph?: string | undefined;
  icon?: ReactNode | undefined;
  label: string;
  tone?: 'gold' | 'result' | undefined;
}) {
  const ring =
    tone === 'gold'
      ? 'border-[var(--color-gold-soft)]/50 bg-[var(--color-gold-soft)]/10'
      : tone === 'result'
        ? 'border-[var(--color-arcane)]/50 bg-[var(--color-arcane)]/10'
        : 'border-[var(--color-edge)] bg-black/25';
  return (
    <span className="flex w-[62px] flex-col items-center gap-1 text-center">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${ring}`}>
        {glyph ? <SyntyGlyph src={glyph} size={24} color="var(--color-gold-soft)" /> : icon}
      </span>
      <span className="text-[9px] leading-tight text-[var(--color-muted)]">{label}</span>
    </span>
  );
}

export function StatOut({ kind, label, text }: { kind: 'atk' | 'def' | 'hp'; label: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
      <SyntyGlyph src={STAT_GLYPH[kind]} color={STAT_TINT[kind]} size={13} /> {label} {text}
    </span>
  );
}

export function setBonusLine(b: { atk: number; def: number; hp: number }): string {
  return [b.atk ? `+${b.atk} ATK` : null, b.def ? `+${b.def} DEF` : null, b.hp ? `+${b.hp} PV` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Applique le multiplicateur d'arc à des stats d'APERÇU.
 *
 * `craftSetPieceStats` / `craftRanges` renvoient les stats de BASE : c'est le
 * serveur qui les multiplie par `tierGearMult(arc)` au craft. Sans cette mise à
 * l'échelle côté affichage, un atelier d'arc 2 annonce les chiffres de l'arc 1
 * pour un objet livré bien plus fort — et un T2 zone 1 semble plus faible qu'un
 * T1 zone 10, alors qu'il est très au-dessus.
 */
export function scaleStats<T extends { atk: number; def: number; hp: number }>(
  stats: T,
  mult: number,
): T {
  return {
    ...stats,
    atk: Math.round(stats.atk * mult),
    def: Math.round(stats.def * mult),
    hp: Math.round(stats.hp * mult),
  };
}

// PV d'affichage (×HERO_HP_SCALE) : défini dans `formulas.ts` (foyer de la règle),
// ré-exporté ici pour les ateliers, et importable directement par les écrans hors forge.
export { displayHp };

/** Stats d'item à AFFICHER : ATK/DEF inchangés, PV mis à l'échelle héros (×4). */
export function toDisplayStats<T extends { atk: number; def: number; hp: number }>(s: T): T {
  return { ...s, hp: displayHp(s.hp) };
}

/**
 * LIGNE DE COÛT d'un craft — or, matériaux principaux, puis (pour une pièce de
 * set) le BUTIN SIGNATURE dans le même encart, après un séparateur.
 *
 * Auparavant le butin signature était répété dans un second bloc sous l'effet de
 * set : deux endroits pour les mêmes ressources, qui avaient fini par afficher
 * deux chiffres différents. Un seul point de vérité, partagé par les trois
 * ateliers, supprime la duplication à la source.
 *
 * `signatureKeys` : clés à ranger sous « Signature » (le butin d'expé propre à la
 * pièce de set). Vide hors set → une simple ligne de coût plate.
 */
export function RecipeCost({
  recipe,
  res,
  gold,
  signatureKeys,
}: {
  recipe: { gold: number; materials: { key: string; qty: number }[] };
  res: Record<string, number>;
  gold: number;
  signatureKeys?: ReadonlySet<string>;
}) {
  const sig = signatureKeys ?? new Set<string>();
  const main = recipe.materials.filter((m) => !sig.has(m.key));
  const signature = recipe.materials.filter((m) => sig.has(m.key));
  const chip = (m: { key: string; qty: number }) => {
    const have = res[m.key] ?? 0;
    return (
      <span
        key={m.key}
        className={`inline-flex items-center gap-1 ${
          have >= m.qty ? 'text-[var(--color-ink)]/75' : 'text-[var(--color-ember)]'
        }`}
      >
        <ResourceIcon resKey={m.key} size={13} /> {have}/{m.qty}
      </span>
    );
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-edge)] pt-2 text-[11px]">
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Coût</span>
      <span className={gold >= recipe.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
        <UiIcon name="gold" size={11} /> {recipe.gold}
      </span>
      {main.map(chip)}
      {signature.length > 0 && (
        <>
          {/* Encart « Signature » DANS la ligne de coût : le butin d'expé propre à
              la pièce de set, plus jamais répété dans un bloc à part. */}
          <span className="mx-0.5 h-3.5 w-px bg-[var(--color-edge)]" aria-hidden />
          <span className="chip bg-[var(--color-gold-soft)]/12 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-gold-soft)]">
            Signature
          </span>
          {signature.map(chip)}
        </>
      )}
    </div>
  );
}

/**
 * TABLEAU « CE QUE DONNE CHAQUE QUALITÉ » — partagé par la Forge, l'Autel et la
 * Joaillerie. Une colonne Qualité + Chance, puis des colonnes de valeurs propres
 * à l'atelier (ATK/DEF/PV pour arme/armure/relique, un % de passif pour un
 * bijou). Née à l'Autel, généralisée pour ne pas la recopier trois fois.
 *
 * `columns` décrit l'en-tête et, par ligne, la valeur formatée + sa teinte. Une
 * cellule vide (`—`) se distingue d'un « 0 » : elle dit « cette stat n'existe pas
 * ici », pas « elle vaut zéro ».
 */
export type RarityStatRow = { rarity: string; cells: (string | null)[] };
export type RarityStatColumn = { label: string; color?: string };

export function RarityStatTable({
  masteryLevel,
  columns,
  rows,
  chanceOf,
}: {
  masteryLevel: number;
  columns: RarityStatColumn[];
  rows: RarityStatRow[];
  /** Probabilité en % (entier) d'obtenir cette rareté au niveau de maîtrise courant. */
  chanceOf: (rarity: string) => number;
}) {
  return (
    <div className="mt-2 overflow-x-auto">
      <div className="mb-1 text-[10px] text-[var(--color-muted)]">
        Ce que donne chaque qualité (maîtrise N.{masteryLevel}) :
      </div>
      <table className="w-full min-w-[280px] text-left text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
            <th className="py-0.5 pr-2 font-medium">Qualité</th>
            <th className="py-0.5 pr-2 text-right font-medium">Chance</th>
            {columns.map((c) => (
              <th key={c.label} className="py-0.5 pr-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const meta = rarityMeta(row.rarity);
            const chance = chanceOf(row.rarity);
            return (
              <tr key={row.rarity} className="border-t border-[var(--color-edge)]/60">
                <td className={`py-1 pr-2 font-semibold ${meta.text}`}>{meta.label}</td>
                {/* Une qualité à 0 % est GRISÉE plutôt que masquée : elle
                    réapparaît en montant la maîtrise. */}
                <td
                  className={`py-1 pr-2 text-right tabular-nums ${
                    chance === 0 ? 'text-[var(--color-muted)]/50' : 'text-[var(--color-ink)]/80'
                  }`}
                >
                  {chance}%
                </td>
                {row.cells.map((cell, i) => (
                  <td
                    key={columns[i]?.label ?? i}
                    className="py-1 pr-2 text-right tabular-nums"
                    style={cell ? { color: columns[i]?.color } : undefined}
                  >
                    {cell ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
