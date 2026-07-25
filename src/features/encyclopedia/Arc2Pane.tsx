import { arcTuning } from '@shared/progression/arc';
import { setsForArc } from '@shared/progression/sets';
import {
  BATTLEFIELDS,
  BATTLEFIELD_MAX_TEAM,
  BATTLEFIELD_ENEMY_COUNT,
  BATTLEFIELD_COOLDOWN_HOURS,
  BATTLEFIELD_DUST_REWARD,
} from '@shared/progression/battlefield';
import {
  divineEventCost,
  DIVINE_STAT_MULT,
  DIVINE_ARMOR_HPDEF_MULT,
} from '@shared/progression/divine';
import {
  ETERNITY_PRODUCTION_TIERS,
  GAUNTLET_MAX_WAVE,
} from '@shared/progression/gauntlet';
import { ARC2_TWINS } from '@shared/progression/arcMaterials';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';
import { UiIcon } from '@/components/synty/GameIcons';

/**
 * Table des jumeaux d'arc 2 par FAMILLE, dans l'ordre où le joueur les rencontre.
 * Les clés sont celles d'arc 1 ; le jumeau est lu dans `ARC2_TWINS` (source de
 * vérité) — la page ne peut donc pas se désynchroniser du jeu.
 */
const TWIN_GROUPS: { title: string; where: string; keys: string[] }[] = [
  {
    title: 'Matériaux de zone',
    where: 'Carte (niv. 1-4) et Tour — ils donnent la puissance de l’objet forgé',
    keys: [
      'ecorce', 'cristal', 'sable_noir', 'spore', 'obsidienne',
      'rune', 'nacre_noire', 'plume_orage', 'ombre_pure', 'poussiere_etoile',
    ],
  },
  {
    title: 'Composants de boss',
    where: 'Boss de zone (niv. 5) et paliers de la Tour — ils orientent les stats',
    keys: [
      'coeur_sylve', 'givre_pur', 'oeil_sphinx', 'coeur_hydre', 'braise_eternelle',
      'fragment_titan', 'encre_kraken', 'foudre_condensee', 'coeur_ombre', 'essence_astrale',
    ],
  },
  {
    title: 'Gemmes',
    where: 'Boss de zone — le passif reste le même, seule la coquille change',
    keys: [
      'gemme_seve', 'gemme_glace', 'gemme_solaire', 'gemme_venin', 'gemme_braise',
      'gemme_runique', 'gemme_abyssale', 'gemme_orage', 'gemme_ombre', 'gemme_astrale',
    ],
  },
  {
    title: 'Butin d’expédition',
    where: 'Expéditions — consommé par les pièces de set d’arc 2',
    keys: [
      'seve_primordiale', 'ambre_vivant', 'coeur_sylve_ancien', 'poussiere_arcane',
      'tablette_oubliee', 'relique_noyee', 'minerai_stellaire', 'gemme_brute', 'eclat_du_noyau',
    ],
  },
  {
    title: 'Butin de donjon',
    where: 'Donjons — consommé par les reliques et les pièces de set',
    keys: ['ossement', 'fragment_relique', 'sceau_catacombe'],
  },
];

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
        {TWIN_GROUPS.map((g) => (
          <div key={g.title} className="mt-3">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink)]">
                {g.title}
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">{g.where}</span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {g.keys.map((baseKey) => {
                const twin = ARC2_TWINS[baseKey];
                if (!twin) return null;
                return (
                  <div
                    key={baseKey}
                    className="flex items-center gap-2 rounded-md border border-[var(--color-edge)] bg-black/20 p-2 text-xs"
                  >
                    <ResourceIcon resKey={baseKey} size={16} />
                    <span className="min-w-0 truncate text-[var(--color-muted)]">
                      {resourceMeta(baseKey).label}
                    </span>
                    <span aria-hidden className="shrink-0 text-[var(--color-muted)]">→</span>
                    <ResourceIcon resKey={twin.key} size={16} />
                    <span className="min-w-0 truncate font-medium" style={{ color: t.accent }}>
                      {twin.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className="mt-3 text-[11px] text-[var(--color-muted)]">
          Survole (ou touche) n'importe quelle icône pour savoir{' '}
          <strong className="text-[var(--color-ink)]">où farmer</strong> la ressource.
        </p>
        <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
          Trois ressources seulement échappent à la règle et forment un{' '}
          <strong className="text-[var(--color-ink)]">tas unique</strong> partagé par les deux arcs :
          la <strong className="text-[var(--color-ink)]">Larme astrale</strong> (Oratoire et craft de
          runes), la <strong className="text-[var(--color-ink)]">Plume d'appel</strong> (reroll de
          la Taverne) et l'<strong className="text-[var(--color-ink)]">Éclat d'Éternité</strong>{' '}
          (Gauntlet, renforcement divin) — leurs systèmes sont communs aux deux arcs, il serait
          absurde de scinder la réserve. Tout le reste est compté séparément par arc.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="forge" size={16} color="var(--color-gold-soft)" /> La Forge Sacrée
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          Réservée à l'arc 2. Elle fabrique une{' '}
          <strong className="text-[var(--color-ink)]">arme</strong> ou une{' '}
          <strong className="text-[var(--color-ink)]">armure</strong> divine (sceau ✦) : les stats
          d'un ultime majorées de {Math.round((DIVINE_STAT_MULT - 1) * 100)} %, plus l'effet d'une
          gemme portée par l'objet. Ni bijou ni relique — ces deux emplacements appartiennent aux
          sets.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">
          <li>
            • <strong className="text-[var(--color-ink)]">Arme</strong> :{' '}
            {divineEventCost('weapon')} <ResourceIcon resKey="poussiere_benie" size={12} /> Poussières
            bénies, gagnées aux Champs de bataille. Monnaie d'effort, accessible à qui joue
            régulièrement. L'arme divine porte aussi l'amplificateur de type de son modèle
            (dégâts physiques ou magiques).
          </li>
          <li>
            • <strong className="text-[var(--color-ink)]">Armure</strong> :{' '}
            {divineEventCost('armor')} <ResourceIcon resKey="eclat_sacre" size={12} /> Éclats sacrés,
            distribués au classement hebdomadaire du Boss de la Semaine (à réclamer le week-end,
            nouveau boss chaque dimanche). Monnaie de compétition, très rare. L'armure divine porte{' '}
            <strong className="text-[var(--color-ink)]">
              PV et Armure ×{DIVINE_ARMOR_HPDEF_MULT}
            </strong>{' '}
            et une <strong className="text-[var(--color-ink)]">stat d'Attaque</strong> — aucune autre
            armure du jeu n'en a.
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          <strong className="text-[var(--color-ink)]">Renforcement divin</strong> : les équipements ✦
          se renforcent à <strong className="text-[var(--color-ink)]">100 % de réussite</strong>{' '}
          (aucun recul possible) contre de l'
          <ResourceIcon resKey="eclat_eternite" size={12} />{' '}
          <strong className="text-[var(--color-ink)]">Éclat d'Éternité</strong> (Gauntlet) et le
          matériau de la zone de leur craft.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="attack" size={16} color="#c084fc" /> Le Gauntlet
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          L'Arène d'Éternité : ton escouade de 5 affronte des{' '}
          <strong className="text-[var(--color-ink)]">vagues sans fin</strong>, à PV pleins à chaque
          vague, jusqu'à la première défaite. Tentatives illimitées — seule ta{' '}
          <strong className="text-[var(--color-ink)]">meilleure vague</strong> compte. Elle fixe une{' '}
          <strong className="text-[var(--color-ink)]">
            rente quotidienne d'
            <ResourceIcon resKey="eclat_eternite" size={12} /> Éclat d'Éternité
          </strong>
          , l'unique ressource qui renforce les équipements divins.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {ETERNITY_PRODUCTION_TIERS.map((t) => (
            <div
              key={t.wave}
              className="rounded-md border border-[var(--color-edge)] bg-black/20 p-1.5 text-center text-[11px]"
            >
              <div className="text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
                Vague {t.wave}
              </div>
              <div className="font-semibold text-[var(--color-ink)]">{t.perDay}/jour</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          La difficulté monte vite au début puis de moins en moins d'une vague à l'autre : il n'y a
          pas de mur infranchissable, seulement ton build. Le plafond absolu est la vague{' '}
          {GAUNTLET_MAX_WAVE.toLocaleString('fr-FR')} — réservée aux escouades parfaites. La rente
          s'accumule 7 jours au maximum : pense à l'encaisser.
        </p>
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
          éveillé peut donc porter l'effet d'un set sans en équiper une seule pièce. Tous accordent
          de la <strong className="text-[var(--color-ink)]">Vie</strong> en plus de leur effet — un
          set d'arc 2 n'est jamais purement offensif.
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
