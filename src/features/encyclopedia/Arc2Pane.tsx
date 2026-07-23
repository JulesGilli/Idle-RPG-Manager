import { arcTuning } from '@shared/progression/arc';
import { setsForArc } from '@shared/progression/sets';
import { forgeMaterialsForArc } from '@shared/progression/arcMaterials';
import {
  BATTLEFIELDS,
  BATTLEFIELD_MAX_TEAM,
  BATTLEFIELD_ENEMY_COUNT,
  BATTLEFIELD_COOLDOWN_HOURS,
  BATTLEFIELD_DUST_REWARD,
} from '@shared/progression/battlefield';
import { divineEventCost, DIVINE_STAT_MULT } from '@shared/progression/divine';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon } from '@/components/synty/GameIcons';

/**
 * ENCYCLOPÉDIE — tout ce qui est PROPRE à l'arc 2.
 *
 * Une section à part, et non des paragraphes saupoudrés dans les autres : un
 * joueur d'arc 1 doit pouvoir lire d'un bloc ce qui l'attend, et un joueur
 * d'arc 2 retrouver ses règles sans les chercher.
 *
 * Fichier séparé parce que `EncyclopediaScreen` frôle déjà les 1000 lignes.
 */
export function Arc2Pane() {
  const t = arcTuning(2);
  const a2Sets = setsForArc(2);
  const arc1Mats = forgeMaterialsForArc(1);
  const arc2Mats = forgeMaterialsForArc(2);

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: `${t.accent}66`, background: `${t.accent}12` }}
      >
        <h3 className="font-display text-lg font-semibold" style={{ color: t.accent }}>
          Arc 2 — {t.region}
        </h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          L'Arc 2 est un <strong className="text-[var(--color-ink)]">New Game+</strong> : tu rejoues
          les 10 mêmes zones, bien plus dures, et presque tout y est remplacé — matériaux, gemmes,
          sets. Tes héros, leurs niveaux et leurs compétences sont conservés.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label="Équipement forgé" value={`×${t.gearStatMult}`} />
          <Fact label="PV ennemis" value={`×${t.enemyHpMult}`} />
          <Fact label="ATK ennemie" value={`×${t.enemyAtkMult}`} />
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          L'équipement monte moins vite que les ennemis, et c'est voulu : tu es à la traîne en début
          d'arc et tu dois compenser par les sets, les gemmes, les runes et les objets divins. En
          revanche la <strong className="text-[var(--color-ink)]">pire</strong> pièce d'arc 2 reste
          supérieure à la <strong className="text-[var(--color-ink)]">meilleure</strong> d'arc 1,
          renforcement maximal compris — changer d'arc ne fait jamais reculer.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="materials" size={16} color="var(--color-gold-soft)" /> Les matériaux changent
          de nom
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          Chaque matériau d'arc 1 a son <strong className="text-[var(--color-ink)]">jumeau</strong>{' '}
          corrompu. Ce sont eux que lâchent les zones, les boss, la Tour, les donjons et les
          expéditions — et eux seuls que la forge accepte.
        </p>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {arc1Mats.slice(0, 6).map((m, i) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-md border border-[var(--color-edge)] bg-black/20 p-2 text-xs"
            >
              <ResourceIcon resKey={m.materials[0]!.key} size={16} />
              <span className="text-[var(--color-muted)]">{m.label}</span>
              <span aria-hidden className="text-[var(--color-muted)]">→</span>
              <span className="font-medium" style={{ color: t.accent }}>
                {arc2Mats[i]!.label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          …et ainsi de suite pour les 10 zones, leurs boss et leurs gemmes — mais aussi pour le butin
          de <strong className="text-[var(--color-ink)]">donjon</strong> et d'
          <strong className="text-[var(--color-ink)]">expédition</strong>, qui ont eux aussi leurs
          jumeaux d'arc 2 (ce sont eux que consomment les reliques et les pièces de set d'arc 2).
        </p>
        <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
          Deux ressources seulement échappent à la règle et forment un{' '}
          <strong className="text-[var(--color-ink)]">tas unique</strong> partagé par les deux arcs :
          la <strong className="text-[var(--color-ink)]">Larme astrale</strong> (Oratoire et craft de
          runes) et la <strong className="text-[var(--color-ink)]">Plume d'appel</strong> (reroll de
          la Taverne) — leurs systèmes sont communs aux deux arcs, il serait absurde de scinder la
          réserve. Tout le reste est compté séparément par arc.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="forge" size={16} color="var(--color-gold-soft)" /> La Forge Sacrée
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          Réservée à l'arc 2. Elle fabrique une{' '}
          <strong className="text-[var(--color-ink)]">arme</strong> ou une{' '}
          <strong className="text-[var(--color-ink)]">armure</strong> divine : les stats d'un ultime
          majorées de {Math.round((DIVINE_STAT_MULT - 1) * 100)} %, plus l'effet d'une gemme portée
          par l'objet. Ni bijou ni relique — ces deux emplacements appartiennent aux sets.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">
          <li>
            • <strong className="text-[var(--color-ink)]">Arme</strong> :{' '}
            {divineEventCost('weapon')} Éclats sacrés, distribués au classement hebdomadaire du Boss
            de la Semaine. Monnaie de compétition, très rare.
          </li>
          <li>
            • <strong className="text-[var(--color-ink)]">Armure</strong> :{' '}
            {divineEventCost('armor')} Poussières bénies, gagnées aux Champs de bataille. Monnaie
            d'effort, accessible à qui joue régulièrement.
          </li>
        </ul>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="raid" size={16} color="var(--color-ember)" /> Les Champs de bataille
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          La seule activité où tu engages jusqu'à{' '}
          <strong className="text-[var(--color-ink)]">{BATTLEFIELD_MAX_TEAM} héros</strong> — contre
          5 partout ailleurs — face à une armée de {BATTLEFIELD_ENEMY_COUNT}.{' '}
          <strong className="text-[var(--color-ink)]">
            Cooldown de {BATTLEFIELD_COOLDOWN_HOURS} h par bataille
          </strong>{' '}
          — chaque bataille redevient disponible séparément, gagnée ou perdue.
        </p>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {BATTLEFIELDS.map((bf) => (
            <div
              key={bf.id}
              className="rounded-md border border-[var(--color-edge)] bg-black/20 p-2 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">{bf.idx}</span>
                <span className="min-w-0 truncate font-medium text-[var(--color-ink)]">{bf.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
                <ResourceIcon resKey="poussiere_benie" size={12} /> {BATTLEFIELD_DUST_REWARD}
                <UiIcon name="gold" size={11} /> {bf.gold.toLocaleString('fr-FR')}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Elles se débloquent l'une après l'autre : remporte la précédente pour ouvrir la suivante.
          À effectif plein c'est {BATTLEFIELD_MAX_TEAM} contre {BATTLEFIELD_ENEMY_COUNT} ; avec moins
          de héros tu combats en infériorité et vises les batailles basses. Recruter et boucler des
          donjons agrandit ton effectif.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="jewel" size={16} color="var(--color-arcane)" /> Sets et runes
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          Les <strong className="text-[var(--color-ink)]">{a2Sets.length} sets d'arc 2</strong>{' '}
          tiennent tous en 2 pièces (bijou + relique). Deux conséquences : ils cohabitent avec l'arme
          et l'armure divines, et ils sont{' '}
          <strong className="text-[var(--color-ink)]">tous extractibles en rune</strong> — un héros
          éveillé peut donc porter l'effet d'un set sans en équiper une seule pièce.
        </p>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Les sets d'arc 1 ne se forgent plus en arc 2, et réciproquement : chaque arc a son propre
          catalogue. Consulte-les dans « Sets d'ensemble » en changeant d'arc.
        </p>
      </div>
    </div>
  );
}

/** Encart chiffré (multiplicateurs d'arc). */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-edge)] bg-black/25 p-2 text-center">
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">{label}</div>
      <div className="font-display text-lg font-bold text-[var(--color-ink)]">{value}</div>
    </div>
  );
}
