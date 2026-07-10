/**
 * Scénario du tutoriel « premiers pas » (spotlight). Deux chapitres :
 *  - CHAPTER1 : la boucle de base (combat → équipe → farm vs progression).
 *  - CHAPTER2 : craft + équipement, déclenché quand on a de quoi forger.
 *
 * Chaque étape vise un élément taggé `data-tour="<target>"`. Elle avance quand
 * `advance(now, base)` devient vrai (base = contexte figé au début de l'étape),
 * ou via un bouton « Compris » si `manual`. Guidage souple : toujours skippable.
 */

/** Contexte observé pour décider de l'avancement des étapes. */
export type TourCtx = {
  path: string;
  heroCount: number;
  deploymentCount: number;
  hasLoop: boolean;
  itemCount: number;
  equippedCount: number;
  villageUnlocked: boolean;
};

export type TourStep = {
  id: string;
  /** Clé `data-tour` de l'élément à éclairer. */
  target: string;
  /** Titre court de la bulle. */
  title: string;
  /** Une phrase : quoi faire + pourquoi. */
  body: string;
  /** Étape informative : avance sur un bouton « Compris » (pas d'action de jeu). */
  manual?: boolean;
  /** Condition d'avancement automatique (ignorée si `manual`). */
  advance?: (now: TourCtx, base: TourCtx) => boolean;
};

/** Quantité d'écorce (matériau zone 1) suffisante pour forger → déclenche le ch.2. */
export const CH2_TRIGGER_MATERIAL = 'ecorce';
export const CH2_TRIGGER_QTY = 10;

export const CHAPTER1: TourStep[] = [
  {
    id: 'open-map',
    target: 'activity-map',
    title: 'La Carte du monde',
    body: "C'est le cœur du jeu. Ouvre la Carte pour partir au combat.",
    advance: (n) => n.path === '/map',
  },
  {
    id: 'deploy',
    target: 'map-deploy',
    title: 'Déploie ta Garde',
    body: 'Envoie ton héros sur la première zone pour lancer ton combat.',
    advance: (n, b) => n.deploymentCount > b.deploymentCount,
  },
  {
    id: 'first-fight',
    target: 'map-deploy',
    title: 'Ton premier combat',
    body: "Seul, c'est rude — et perdre est normal. Il te faut une équipe.",
    advance: (n) => n.villageUnlocked,
  },
  {
    id: 'go-village',
    target: 'nav-village',
    title: 'Direction le Village',
    body: 'La Taverne y recrute des aventuriers. Ouvre le Village.',
    advance: (n) => n.path === '/village',
  },
  {
    id: 'enter-tavern',
    target: 'village-tavern',
    title: 'La Taverne',
    body: 'Entre à la Taverne pour engager des renforts.',
    advance: (n) => n.path === '/tavern',
  },
  {
    id: 'recruit',
    target: 'tavern-recruits',
    title: 'Monte ton équipe',
    body: 'Recrute un archer et un soigneur (offerts) pour compléter ton trio.',
    advance: (n) => n.heroCount >= 3,
  },
  {
    id: 'back-to-map',
    target: 'nav-activites',
    title: 'Retour au combat',
    body: 'Repars sur la Carte avec ton équipe complète.',
    advance: (n) => n.path === '/map',
  },
  {
    id: 'farm-vs-progress',
    target: 'deploy-mode',
    title: 'Farm ou progression ?',
    body: 'Avance : tu vises la zone suivante. Boucle : tu farmes ici en auto, les gains tombent seuls. À toi de choisir !',
    manual: true,
  },
];

export const CHAPTER2: TourStep[] = [
  {
    id: 'go-village-2',
    target: 'nav-village',
    title: 'Tu peux forger !',
    body: 'Tu as réuni des matériaux. Ouvre le Village.',
    advance: (n) => n.path === '/village',
  },
  {
    id: 'enter-forge',
    target: 'village-forge',
    title: 'La Forge',
    body: 'Entre à la Forge pour fabriquer ton premier équipement.',
    advance: (n) => n.path === '/forge',
  },
  {
    id: 'craft',
    target: 'forge-base',
    title: 'Fabrique une arme',
    body: 'Choisis une base et forge-la avec ton matériau de zone.',
    advance: (n, b) => n.itemCount > b.itemCount,
  },
  {
    id: 'go-equip',
    target: 'nav-equipe',
    title: 'Équipe ton arme',
    body: "Ton arme est dans ton sac. Ouvre l'onglet Équipe.",
    advance: (n) => n.path === '/inventory',
  },
  {
    id: 'equip',
    target: 'equip-hero',
    title: 'Renforce un héros',
    body: "Équipe l'arme sur un personnage. Et voilà, tu as tout compris !",
    advance: (n, b) => n.equippedCount > b.equippedCount,
  },
];
