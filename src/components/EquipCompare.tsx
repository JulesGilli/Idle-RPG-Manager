/**
 * Comparatif « objet porté → objet candidat » affiché au survol d'un bouton
 * d'équipement. Le gain/perte par stat est ce qu'on veut voir AVANT de cliquer :
 * un objet plus rare n'est pas forcément meilleur que celui déjà en place.
 *
 * Rendu en `position: fixed` et non en absolu : les cartes d'inventaire sont en
 * `overflow-hidden` (pour le voile de confirmation de suppression), ce qui
 * rognerait un tooltip positionné dans le flux de la carte.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { PassiveIcon } from '@/components/synty/GameIcons';
import { STAT_GLYPH } from '@/lib/synty';
import { rarityColor } from '@/lib/gameUi';
import { PASSIVE_META } from '@shared/progression/jewelry';
import { setById } from '@shared/progression/sets';
import type { PassiveType } from '@shared/combat';

const STAT_COLOR = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;
const GAIN = '#5fd39b';
const LOSS = '#f87171';

/** Le minimum commun à `ItemRow` (inventaire) et `ItemView` (héros équipé). */
export type ComparableItem = {
  name: string;
  rarity: string;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  set_id?: string | null;
  passive_type?: string | null;
  passive_value?: number;
};

/** Position d'ancrage : le rectangle écran de l'élément survolé. */
export type AnchorRect = { top: number; left: number; width: number };

/** Ancre un survol : mémorise l'élément et son rectangle pour le placement fixe. */
export function anchorOf(el: HTMLElement): AnchorRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width };
}

function passiveOf(item: ComparableItem | null): { type: PassiveType; value: number } | null {
  if (!item?.passive_type || !item.passive_value || item.passive_value <= 0) return null;
  return { type: item.passive_type as PassiveType, value: item.passive_value };
}

function StatRow({
  glyph,
  color,
  label,
  from,
  to,
  suffix = '',
}: {
  glyph: ReactNode;
  color: string;
  label: string;
  from: number;
  to: number;
  suffix?: string;
}) {
  const delta = to - from;
  return (
    <div className="flex items-center gap-2 text-[11px] leading-tight">
      <span className="flex w-4 shrink-0 justify-center">{glyph}</span>
      <span className="w-8 shrink-0 font-semibold" style={{ color }}>
        {label}
      </span>
      <span className="text-[var(--color-muted)]">
        {from}
        {suffix}
      </span>
      <span className="text-[var(--color-muted)]/50">→</span>
      <span className="font-semibold text-[var(--color-ink)]">
        {to}
        {suffix}
      </span>
      <span
        className="ml-auto font-bold tabular-nums"
        style={{ color: delta > 0 ? GAIN : delta < 0 ? LOSS : 'var(--color-muted)' }}
      >
        {delta > 0 ? '+' : ''}
        {delta}
        {suffix}
      </span>
    </div>
  );
}

/**
 * Carte de comparaison. `current` à `null` = le slot est vide (tout est gain).
 * Les stats à 0 des DEUX côtés sont masquées : une arme n'a pas à afficher
 * « DEF 0 → 0 ».
 */
export function EquipCompare({
  candidate,
  current,
  heroName,
  anchor,
}: {
  candidate: ComparableItem;
  current: ComparableItem | null;
  heroName: string;
  anchor: AnchorRect;
}) {
  // Mesure après montage pour basculer au-dessus/en-dessous selon la place.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [placeBelow, setPlaceBelow] = useState(false);
  useEffect(() => {
    if (!el) return;
    setPlaceBelow(anchor.top - el.offsetHeight - 10 < 8);
  }, [el, anchor.top]);

  const WIDTH = 232;
  // Recentre sur l'ancre, en restant dans la fenêtre.
  const left = Math.min(
    Math.max(8, anchor.left + anchor.width / 2 - WIDTH / 2),
    Math.max(8, window.innerWidth - WIDTH - 8),
  );

  const pCur = passiveOf(current);
  const pNew = passiveOf(candidate);
  const rows: ReactNode[] = [];
  for (const key of ['atk', 'def', 'hp'] as const) {
    const field = key === 'hp' ? 'hp_bonus' : key === 'atk' ? 'atk_bonus' : 'def_bonus';
    const from = current?.[field] ?? 0;
    const to = candidate[field];
    if (from === 0 && to === 0) continue;
    rows.push(
      <StatRow
        key={key}
        glyph={<SyntyGlyph src={STAT_GLYPH[key]} size={12} color={STAT_COLOR[key]} />}
        color={STAT_COLOR[key]}
        label={key === 'hp' ? 'PV' : key.toUpperCase()}
        from={from}
        to={to}
      />,
    );
  }
  // Passif : comparable seulement s'il s'agit du MÊME type (crit vs crit). Deux
  // types différents ne se soustraient pas — on montre alors les deux lignes.
  if (pCur && pNew && pCur.type === pNew.type) {
    rows.push(
      <StatRow
        key="passive"
        glyph={<PassiveIcon passive={pNew.type} size={12} />}
        color="var(--color-arcane)"
        label={PASSIVE_META[pNew.type]?.label ?? pNew.type}
        from={pCur.value}
        to={pNew.value}
        suffix="%"
      />,
    );
  } else {
    if (pCur)
      rows.push(
        <StatRow
          key="p-cur"
          glyph={<PassiveIcon passive={pCur.type} size={12} />}
          color="var(--color-arcane)"
          label={PASSIVE_META[pCur.type]?.label ?? pCur.type}
          from={pCur.value}
          to={0}
          suffix="%"
        />,
      );
    if (pNew)
      rows.push(
        <StatRow
          key="p-new"
          glyph={<PassiveIcon passive={pNew.type} size={12} />}
          color="var(--color-arcane)"
          label={PASSIVE_META[pNew.type]?.label ?? pNew.type}
          from={0}
          to={pNew.value}
          suffix="%"
        />,
      );
  }

  const lostSet = current?.set_id && current.set_id !== candidate.set_id ? current.set_id : null;

  return (
    <div
      ref={setEl}
      role="tooltip"
      className="panel pointer-events-none fixed z-[60] space-y-1.5 p-2.5 shadow-xl"
      style={{
        width: WIDTH,
        left,
        ...(placeBelow
          ? { top: anchor.top + 34 }
          : { top: anchor.top - (el?.offsetHeight ?? 0) - 10 }),
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {heroName}
      </div>
      <div className="flex items-baseline gap-1.5 text-[11px]">
        <span className="min-w-0 flex-1 truncate text-[var(--color-muted)]">
          {current ? (
            <span style={{ color: rarityColor(current.rarity) }}>{current.name}</span>
          ) : (
            <em className="not-italic text-[var(--color-muted)]/60">Rien d'équipé</em>
          )}
        </span>
        <span className="text-[var(--color-muted)]/50">→</span>
        <span
          className="min-w-0 flex-1 truncate text-right font-semibold"
          style={{ color: rarityColor(candidate.rarity) }}
        >
          {candidate.name}
        </span>
      </div>

      <div className="space-y-1 border-t border-[var(--color-edge)] pt-1.5">
        {rows.length > 0 ? (
          rows
        ) : (
          <div className="text-[11px] text-[var(--color-muted)]">Stats identiques</div>
        )}
      </div>

      {lostSet && (
        <div className="border-t border-[var(--color-edge)] pt-1.5 text-[10px] leading-snug text-[var(--color-gold-soft)]">
          Retire une pièce du set «&nbsp;{setById(lostSet)?.name ?? lostSet}&nbsp;» — le bonus
          d'ensemble peut sauter.
        </div>
      )}
    </div>
  );
}
