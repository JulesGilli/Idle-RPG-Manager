import { arcTuning } from '@shared/progression/arc';
import { useArc } from './useArc';
import { UiIcon } from '@/components/synty/GameIcons';

/**
 * Bandeau d'arc des ATELIERS (Forge, Joaillerie, Autel).
 *
 * Problème résolu : passé en arc 2, rien ne changeait à l'écran. Les matériaux
 * portent les mêmes noms d'un arc à l'autre — seul le TIER diffère
 * (`player_resources` est clé par `(player_id, resource, tier)`, et `useResources`
 * ne remonte que le tier de l'arc courant). Le joueur voyait donc un stock
 * différent d'hier, sans la moindre explication, et un équipement bien plus
 * puissant sans savoir pourquoi.
 *
 * Ne s'affiche qu'à partir de l'arc 2 : en arc 1 il n'y a rien à distinguer, et
 * un bandeau permanent ne serait que du bruit pour la quasi-totalité des joueurs.
 */
export function ArcCraftNotice() {
  const { currentArc } = useArc();
  if (currentArc < 2) return null;

  const t = arcTuning(currentArc);
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-xs"
      style={{ borderColor: `${t.accent}66`, background: `${t.accent}12`, color: t.accent }}
    >
      <span className="inline-flex items-center gap-1.5 font-display text-sm font-semibold">
        <UiIcon name="craft" size={15} color={t.accent} />
        Arc {currentArc} — {t.region}
      </span>
      <span className="text-[var(--color-ink)]/80">
        Tu forges avec ton stock d'<strong>Arc {currentArc}</strong> : mêmes matériaux, réserve
        distincte de celle de l'arc précédent.
      </span>
      <span className="chip bg-black/25 text-[10px] font-semibold" style={{ color: t.accent }}>
        stats ×{t.gearStatMult}
      </span>
    </div>
  );
}

/**
 * État vide du catalogue de SETS d'un arc. Chaque arc a son propre catalogue
 * (`setArc`), et un arc dont les sets ne sont pas encore écrits affichait une
 * grille VIDE, sans un mot — indiscernable d'un bug d'affichage.
 */
export function ArcSetsEmpty({ arc }: { arc: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-4 text-center">
      <div className="mb-1 flex justify-center">
        <UiIcon name="lock" size={20} color="var(--color-muted)" />
      </div>
      <p className="text-sm font-semibold text-[var(--color-ink)]">
        Aucun set d'Arc {arc} pour l'instant
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Chaque arc a son propre catalogue de sets : ceux de l'arc précédent ne se forgent plus ici.
        Ceux de l'Arc {arc} arrivent — en attendant, l'arme et l'armure divines de la Forge Sacrée
        prennent le relais.
      </p>
    </div>
  );
}
