import { useEffect, useState } from 'react';
import { useUnlocks, activityUnlocked } from '@/hooks/useUnlocks';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account';
import { UiIcon } from '@/components/synty/GameIcons';
import type { UiIconName } from '@/lib/synty';

type TutoKey = ActivityKey | 'welcome';

/** Mini-tuto affiché quand le joueur débloque une activité (ou au tout début). */
const TUTORIALS: Record<TutoKey, { title: string; icon: UiIconName; body: string }> = {
  welcome: {
    title: 'Bienvenue, Commandant !',
    icon: 'map',
    body: "Tu diriges une escouade de héros. Déploie-les sur la Carte pour combattre en continu : ils gagnent de l'or et de l'XP, et font monter ton niveau de compte — qui débloque peu à peu toutes les activités du royaume.",
  },
  inventory: {
    title: 'Le Sac débloqué',
    icon: 'bag',
    body: "Ton premier matériau ! Retrouve ici tout ton butin et ton équipement. Verrouille tes objets favoris pour ne pas les nettoyer par erreur.",
  },
  village: {
    title: 'Le Village débloqué',
    icon: 'craft',
    body: "Ton escouade a flanché ! Le Village t'ouvre ses portes : va à la Taverne t'entourer d'alliés. Les autres échoppes (Forge, Joaillerie…) ouvriront en montant de niveau.",
  },
  tavern: {
    title: 'La Taverne débloquée',
    icon: 'tavern',
    body: "Un guerrier seul ne suffit pas : recrute un soigneur et un archer pour l'épauler. Choisis une recrue et clique « Recruter » — tu as reçu de l'or de départ pour ça !",
  },
  forge: {
    title: 'La Forge débloquée',
    icon: 'forge',
    body: "Fabrique armes et armures avec les matériaux ramassés sur la carte. Le composant choisi fixe la puissance et le thème ; renforce ensuite tes objets.",
  },
  library: {
    title: 'La Bibliothèque débloquée',
    icon: 'book',
    body: "Dépense les points de compétence de tes héros dans les arbres propres à chaque classe pour débloquer passifs et capacités.",
  },
  encyclopedia: {
    title: "L'Encyclopédie débloquée",
    icon: 'boss',
    body: "Le grand grimoire du royaume : classes, déroulé des combats, sets et leurs bonus, passifs, recettes et provenance des matériaux. Tout ce qu'il faut savoir pour équiper ton escouade.",
  },
  tower: {
    title: 'La Tour débloquée',
    icon: 'power',
    body: "Un seul héros grimpe étage par étage, la difficulté monte sans cesse. Chaque étage franchi rapporte des matériaux de base — mais une seule fois. Un moyen rapide de récolter du matériau : pousse ton héros le plus haut possible.",
  },
  dungeon: {
    title: 'Les Donjons débloqués',
    icon: 'skull',
    body: "Des combats d'endurance enchaînés sans soin jusqu'au boss : tenez ou c'est le wipe. Un temps de repos s'applique entre deux tentatives.",
  },
  arc_boss: {
    title: "Les Boss d'arc débloqués",
    icon: 'dragon',
    body: "Le grand boss qui clôt un arc. Le vaincre débloque l'arc suivant et un nouveau tier de matériaux, plus puissants.",
  },
  jewelry: {
    title: 'La Joaillerie débloquée',
    icon: 'jewel',
    body: "Sertis des bijoux qui octroient des passifs (vampirisme, critique, épines…) grâce aux gemmes lâchées par les boss, puis raffine-les pour renforcer leur effet.",
  },
  relic: {
    title: "L'Autel des Reliques débloqué",
    icon: 'relic',
    body: "Façonne des reliques puissantes, à forte composante PV, à partir du butin des donjons.",
  },
  expedition: {
    title: 'Les Expéditions débloquées',
    icon: 'map',
    body: "Envoie une escouade en expédition (plusieurs heures) : elle revient avec de l'or, de l'XP et des matériaux uniques, indispensables aux pièces de set.",
  },
  guild: {
    title: 'La Guilde débloquée',
    icon: 'guild',
    body: "Rejoins ou fonde une guilde, monte-la en niveau, et lance des raids en mettant tes héros en commun avec d'autres joueurs.",
  },
};

// Stocke l'ensemble des activités débloquées à la DERNIÈRE vérification. On compare
// à l'ensemble courant → on ne montre que les NOUVEAUX déblocages (transition). En
// remplaçant (et non en cumulant) cet ensemble, un reset de compte fonctionne : il
// rétrécit, puis les popups réapparaissent à mesure qu'on re-débloque.
const STORAGE_KEY = 'unlock-tutorials-prev-v1';

function loadPrev(): Set<string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}
function savePrev(s: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
  } catch {
    /* localStorage indisponible : tant pis, pas de persistance */
  }
}

export function UnlockTutorials() {
  const { isLoading, level, hasMaterial, hasLost } = useUnlocks();
  const [queue, setQueue] = useState<TutoKey[]>([]);

  useEffect(() => {
    if (isLoading) return;
    // Ensemble actuellement débloqué (Sac = 1er matériau, village/taverne = 1re
    // défaite, reste = niveau), trié.
    const current = (Object.keys(ACTIVITY_UNLOCKS) as ActivityKey[])
      .filter((a) => activityUnlocked(a, { level, hasMaterial, hasLost }))
      .sort((a, b) => ACTIVITY_UNLOCKS[a] - ACTIVITY_UNLOCKS[b]);
    const prev = loadPrev();

    if (prev === null) {
      // Première session sur ce navigateur : on n'inonde pas de rappels des
      // déblocages déjà acquis. Compte tout neuf → petit mot de bienvenue.
      if (current.length === 0) setQueue((q) => (q.includes('welcome') ? q : [...q, 'welcome']));
      savePrev(new Set(current));
      return;
    }

    const newly = current.filter((a) => !prev.has(a));
    if (newly.length > 0) {
      setQueue((q) => [...q, ...newly.filter((a) => !q.includes(a))]);
    }
    // Remplace (pas cumule) → compatible avec un reset de compte.
    savePrev(new Set(current));
  }, [level, hasMaterial, hasLost, isLoading]);

  if (queue.length === 0) return null;
  const key = queue[0]!;
  const t = TUTORIALS[key];
  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <div
      className="anim-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
      onClick={dismiss}
    >
      <div
        className="panel anim-pop w-full max-w-sm p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-arcane)]/15">
          <UiIcon name={t.icon} size={36} color="var(--color-gold-soft)" />
        </div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-arcane)]">
          {key === 'welcome' ? 'Bienvenue' : 'Nouveau déblocage'}
        </div>
        <h3 className="heading text-lg">{t.title}</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{t.body}</p>
        <button onClick={dismiss} className="btn btn-primary mt-5 w-full text-sm">
          {queue.length > 1 ? `Compris (${queue.length - 1} autre(s))` : 'Compris !'}
        </button>
      </div>
    </div>
  );
}
