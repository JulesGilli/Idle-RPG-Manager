/**
 * Journal des mises à jour — une ligne par changement pour rester rapide à lire.
 * Les entrées sont regroupées par version (la plus récente en haut). Marque
 * `highlight: true` sur les 2-3 changements phares d'une version : ils sont mis
 * en avant dans le panneau. Pour publier une mise à jour, ajoute une entrée en
 * tête de `RELEASES`.
 */

export type ChangeTag = 'Nouveau' | 'Équilibrage' | 'Correctif';

export type ChangeEntry = { tag: ChangeTag; text: string; highlight?: boolean };

export type Release = {
  version: string;
  date: string;
  title: string;
  summary?: string;
  entries: ChangeEntry[];
};

/**
 * Aperçu du contenu à venir (annoncé aux joueurs, pas encore livré). Affiché en
 * tête du panneau Nouveautés. Garder court : des intentions, pas des promesses de date.
 */
export const UPCOMING: string[] = [
  'Types & faiblesses : héros, zones et équipements gagnent un type — de la tactique dans le choix des escouades.',
  'Nouvelles classes : Voleur, Nécromancien, Inquisiteur.',
  'Boss mondial : tout le royaume tape le même boss, classement des dégâts.',
  'Arbre de guilde : nouvelles stats avancées et particularités par branche.',
];

export const RELEASES: Release[] = [
  {
    version: 'v0.11',
    date: '9 juillet 2026',
    title: 'Guilde : raids progressifs & arbre de compétences',
    summary:
      'La guilde devient un vrai moteur de progression collective : 10 niveaux de raid et un arbre qui buffe toute la guilde.',
    entries: [
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Raids à 10 niveaux : le même raid, de plus en plus dur. Battre un niveau débloque le suivant et rapporte un point de guilde.',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Arbre de compétences de guilde : dépense les points de raid (ATK/PV/Armure/XP/Or, +5% ×3) et les points de niveau (crit, +1%/point). Bonus actifs pour tous les membres dans tous les combats — sauf l’arène.',
      },
      {
        tag: 'Nouveau',
        text: 'Dégâts critiques : nouveau levier de dégâts, alimenté par l’arbre de guilde.',
      },
      {
        tag: 'Équilibrage',
        text: 'Réservé au fondateur et aux officiers : eux seuls répartissent les points de l’arbre de guilde.',
      },
    ],
  },
  {
    version: 'v0.10',
    date: '9 juillet 2026',
    title: 'Confort de jeu : repères & retour idle',
    summary:
      'Une passe de lisibilité avant tout : on voit d’un coup d’œil ce qui est prêt, ce qu’on récolte au retour, et d’où vient chaque objet.',
    entries: [
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Gommettes de notification : une pastille rouge signale ce qui vient de devenir dispo (donjon ressorti de cooldown, expédition finie, recrue, point de compétence). Elle s’éteint dès que tu ouvres la page — elle ne revient qu’avec un nouvel événement.',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Écran de retour : à ta reconnexion, un récap de ce qui t’attend (combats de carte accumulés, expéditions terminées, donjons prêts, récompense du jour).',
      },
      {
        tag: 'Nouveau',
        text: 'Carte du monde : un repère « Farm » indique la zone où tes héros farment en boucle, même une fois la zone terminée.',
      },
      {
        tag: 'Nouveau',
        text: 'Navigation : bouton « Retour aux activités » sur chaque activité (carte, tour, donjon, expéditions, arène, boss d’arc).',
      },
      {
        tag: 'Nouveau',
        text: 'Tier affiché : chaque objet montre son tier (arc), et chaque matériau sa zone d’origine et son tier.',
      },
      {
        tag: 'Nouveau',
        text: 'Suppression à l’unité : jette un objet précis directement depuis sa carte (verrouillés et équipés protégés).',
      },
      {
        tag: 'Nouveau',
        text: 'Taverne transparente : les chances de grade des recrues (S/A/B/C/D) sont désormais affichées.',
      },
      {
        tag: 'Nouveau',
        text: 'Classement filtrable : bascule entre le classement global et celui de ta guilde.',
      },
    ],
  },
  {
    version: 'v0.9',
    date: '9 juillet 2026',
    title: 'Grande refonte : navigation & équilibrage',
    summary:
      'Toutes les activités réunies, la forge automatisée, et un rééquilibrage complet des combats.',
    entries: [
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Nouvelle navigation : un hub « Activités » (carte, tour, donjon, expédition), un pôle « Inventaire » (héros, équipement, sac, matériaux) et le Village pour le reste.',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Auto-craft : lance la forge en boucle jusqu’à obtenir la qualité ou la rareté visée.',
      },
      {
        tag: 'Nouveau',
        text: 'Compositions d’équipe : enregistre et nomme jusqu’à 3 compos pour les déployer en un clic.',
      },
      {
        tag: 'Nouveau',
        text: 'Récompenses journalières repensées : matériaux, gemmes et reliques selon ta zone — jour 10 = pièce d’équipement complète.',
      },
      {
        tag: 'Nouveau',
        text: 'Puissance des ennemis affichée sur la carte et la tour pour situer chaque combat.',
      },
      {
        tag: 'Équilibrage',
        highlight: true,
        text: 'Difficulté progressive : les boss de carte montent en puissance (zones 6 à 10) — le jeu dépasse peu à peu le joueur.',
      },
      {
        tag: 'Équilibrage',
        text: 'DPS repensés en archétypes : Œil de faucon devient roi du mono-cible, Brasier roi de l’AoE, la Vipère (poison) recadrée, la Tempête passe devant en AoE.',
      },
      {
        tag: 'Équilibrage',
        text: 'Paladin : nouveau passif « Sacre du carnage » — +20 % ATK & DEF par mort sur le champ de bataille (cumulatif).',
      },
      {
        tag: 'Équilibrage',
        text: 'Guerrier Berserker remonté en dégâts mono-cible (ignore une partie de l’armure).',
      },
      {
        tag: 'Équilibrage',
        text: 'Héros prêté en garnison : limité à 1 donjon et 5 combats de carte par jour.',
      },
      {
        tag: 'Correctif',
        text: 'Bastion (paladin) réparé : provocation et bouclier tiennent bien toute la durée.',
      },
      {
        tag: 'Correctif',
        text: 'Pseudos affichés correctement en guilde et en messages privés (fini les « Joueur »).',
      },
      {
        tag: 'Correctif',
        text: 'Le village ne se reverrouille plus quand tu changes d’appareil.',
      },
      {
        tag: 'Correctif',
        text: 'Forge : les objets de set, bijoux et reliques sont grisés correctement quand ils ne sont pas craftables.',
      },
      {
        tag: 'Correctif',
        text: 'L’arbre de compétences s’ouvre sur le bon héros après un gain de niveau.',
      },
      {
        tag: 'Correctif',
        text: 'Les rubriques du header se ferment en cliquant à côté.',
      },
    ],
  },
  {
    version: 'v0.8',
    date: '7 juillet 2026',
    title: 'Arène, guilde & progression',
    entries: [
      {
        tag: 'Nouveau',
        text: 'Arène PvP : défie les joueurs mieux classés et échangez vos places (récompense hebdo).',
      },
      { tag: 'Nouveau', text: 'Codes de récompense : entre un code pour un cadeau exclusif.' },
      { tag: 'Nouveau', text: 'Vitesse des combats réglable (×1 / ×2 / ×4).' },
      { tag: 'Nouveau', text: 'Classement de progression + fiches joueur cliquables.' },
      { tag: 'Nouveau', text: 'Garnison de guilde : prête un héros à tes coéquipiers.' },
      { tag: 'Équilibrage', text: 'Boss d’arc désormais débloqués au niveau 12.' },
      { tag: 'Équilibrage', text: 'Donjons : cooldowns allongés (8 h / 12 h / 16 h / 24 h).' },
      { tag: 'Équilibrage', text: 'Taverne : meilleures recrues au fil de ta progression.' },
      { tag: 'Équilibrage', text: 'Début de partie : une recrue de chaque classe garantie.' },
      { tag: 'Équilibrage', text: 'La Tour : ennemis bien plus coriaces (×2 PV et attaque).' },
      { tag: 'Correctif', text: 'Correction du chargement de la page (joueurs en ligne).' },
    ],
  },
];

/** Date de la dernière mise à jour (raccourci pratique). */
export const CHANGELOG_UPDATED = RELEASES[0]?.date ?? '';
