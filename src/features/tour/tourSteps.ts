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
  /** Modale de déploiement ouverte (clic sur un niveau). */
  deployModalOpen: boolean;
  /** Au moins un héros composé dans la modale de déploiement. */
  deployHeroChosen: boolean;
  /** Fenêtre de combat (replay d'assaut) ouverte. */
  fightOpen: boolean;
  /** Le combat en cours a fini de se dérouler. */
  fightDone: boolean;
  /** Un assaut a déjà été validé (au moins un déploiement a combattu). */
  hasFought: boolean;
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
    id: 'pick-level',
    target: 'tour-map-level',
    title: 'Le premier niveau',
    body: 'Clique le niveau 1 de la première zone pour préparer ton assaut.',
    advance: (n) => n.deployModalOpen,
  },
  {
    id: 'pick-hero',
    target: 'tour-deploy-hero',
    title: 'Compose ta Garde',
    body: 'Ajoute ton Guerrier à la composition (clique-le).',
    advance: (n) => n.deployHeroChosen,
  },
  {
    id: 'confirm-deploy',
    target: 'tour-deploy-confirm',
    title: 'Déploie',
    body: 'Valide pour envoyer ta Garde sur le niveau.',
    advance: (n, b) => n.deploymentCount > b.deploymentCount,
  },
  {
    id: 'launch-fight',
    target: 'tour-fight',
    title: 'Ton premier combat',
    body: 'Lance l’assaut sur le niveau.',
    advance: (n) => n.fightOpen,
  },
  {
    id: 'combat-window',
    target: 'tour-combat-window',
    title: 'La fenêtre de combat',
    body: 'Voici ton affrontement. Regarde-le se dérouler tour par tour.',
    manual: true,
  },
  {
    id: 'combat-speed',
    target: 'tour-combat-speed',
    title: 'Accélère si tu veux',
    body: 'Passe le combat en ×2 ou ×4 pour aller plus vite.',
    advance: (n) => n.fightDone,
  },
  {
    id: 'combat-confirm',
    target: 'tour-combat-confirm',
    title: 'Valide le combat',
    body: 'Le combat est terminé — valide pour empocher le résultat.',
    advance: (n) => n.hasFought,
  },
  {
    id: 'go-village',
    target: 'nav-village',
    title: 'Il te faut une équipe',
    body: 'Seul, c’est rude ! Direction le Village : la Taverne y recrute des aventuriers.',
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
    body: 'Recrute tes deux renforts (offerts) pour compléter ton trio. Ensuite, à toi de jouer !',
    advance: (n) => n.heroCount >= 3,
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
