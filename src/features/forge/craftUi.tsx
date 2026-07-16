import type { ReactNode } from 'react';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { STAT_GLYPH } from '@/lib/synty';

/**
 * Briques d'UI PARTAGÉES par les ateliers guidés (Forge, Joaillerie…).
 * Même langage visuel partout : étapes numérotées, ingrédients, pastilles.
 */

export const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

/** Étape numérotée d'un atelier (« 1 Le plan », « 2 Matériau de base »…). */
export function SectionLabel({ n, label, hint }: { n?: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      {n != null && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-arcane)]/20 text-[10px] font-bold text-[var(--color-arcane)]">
          {n}
        </span>
      )}
      <span className="text-xs font-semibold text-[var(--color-ink)]">{label}</span>
      {hint && <span className="text-[11px] text-[var(--color-muted)]">— {hint}</span>}
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

export function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)]/15 text-[var(--color-gold-soft)]'
          : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
      }`}
    >
      {children}
    </button>
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
