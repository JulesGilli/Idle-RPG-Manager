import type { ReactNode } from 'react';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { STAT_GLYPH, type UiIconName } from '@/lib/synty';
import { BOSS_MATERIALS, type StatKey } from '@shared/progression/forge';

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
}: {
  res: Record<string, number>;
  value: string | null;
  onPick: (key: string | null) => void;
  disabled: boolean;
  primary?: StatKey;
}) {
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
        {BOSS_MATERIALS.map((b) => {
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
