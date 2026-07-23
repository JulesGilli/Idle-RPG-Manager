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
  'Arc 3 : une troisième traversée du monde, avec son propre palier de puissance et ses sets.',
  'Titre de boss de la semaine : le porter donnera un bonus, en plus du prestige.',
  'Suite de l’équilibrage : vos retours sur l’Arc 2 nourrissent la prochaine passe.',
];

export const RELEASES: Release[] = [
  {
    version: 'V2.1',
    date: '22 juillet 2026',
    title: 'Arc 2 jouable de bout en bout, et une grosse passe mobile',
    summary:
      'Quatre jours à traquer ce qui coinçait dans l’Arc 2 — et une refonte de l’affichage sur téléphone.',
    entries: [
      {
        tag: 'Correctif',
        highlight: true,
        text: 'Arc 2 : les ateliers réclamaient encore des matériaux d’Arc 1 (essences de boss, sceaux, gemmes). Forge, Autel, Joaillerie et renforcement demandent enfin les bons — et affichent le vrai coût.',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Héros favoris : une étoile les épingle en tête de TOUTES les listes, quelle que soit l’activité.',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Mobile : header, barre de navigation, fiches et popups revus. Fini le débordement horizontal et les boutons coincés sous la barre d’état.',
      },
      {
        tag: 'Nouveau',
        text: 'Assaut de carte : à la fin d’un combat gagné, tu choisis d’avancer ou de rester sur place pour refarmer.',
      },
      {
        tag: 'Nouveau',
        text: 'Les 8 donjons de l’Arc 2 débloquent leurs propres slots : le vivier monte à 21 héros, et le prix d’une recrue plafonne à 1 million d’or.',
      },
      {
        tag: 'Nouveau',
        text: 'Les 16 sets d’Arc 2 décrivent enfin leur effet (ils affichaient tous « Effet spécial »), et 7 ont été renommés pour coller à ce qu’ils font.',
      },
      {
        tag: 'Nouveau',
        text: 'L’Autel détaille les stats de la relique pour CHAQUE qualité, au lieu d’une simple fourchette.',
      },
      {
        tag: 'Nouveau',
        text: 'Un bouton pour soutenir le jeu, sur ton profil. Don libre, aucune contrepartie en jeu — ceux qui ne donnent pas ne perdent rien.',
      },
      {
        tag: 'Équilibrage',
        highlight: true,
        text: 'Composition : 2 héros maximum de la même classe en combat (4 sur les champs de bataille). Les activités de guilde ne sont pas concernées.',
      },
      {
        tag: 'Équilibrage',
        text: 'Les passifs de gemme ne se cumulent plus : arme, armure, bijou et relique portant le même passif ne comptent qu’une fois, à la valeur la plus forte.',
      },
      {
        tag: 'Correctif',
        highlight: true,
        text: 'Butin de farm : un plafond caché de 100 tirages faisait perdre jusqu’à 95 % du butin d’une nuit. Supprimé — seul reste le plafond de 12 h.',
      },
      {
        tag: 'Correctif',
        text: 'Résurrection partielle relève enfin un ALLIÉ tombé : elle ne ressuscitait que son propre porteur, donc presque jamais.',
      },
      {
        tag: 'Correctif',
        text: 'Or et ressources ne peuvent plus se perdre lors de récupérations simultanées (deux onglets, reprise d’appli sur mobile).',
      },
      {
        tag: 'Correctif',
        text: 'Plumes d’appel et larmes astrales sont communes aux deux arcs : celles gagnées en Arc 1 se dépensent en Arc 2, et inversement.',
      },
      {
        tag: 'Correctif',
        text: 'Récupérer plusieurs groupes de farm d’un coup est nettement plus rapide.',
      },
    ],
  },
  {
    version: 'V2',
    date: '18 juillet 2026',
    title: 'La refonte 🔥',
    summary:
      'Trois nouvelles classes, un monde qui se rejoue à une tout autre échelle, des invocations, un boss communautaire — et un nouveau départ pour tout le monde.',
    entries: [
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Trois classes : Voleur (esquive et ripostes), Nécromancien (invocations) et Inquisiteur (afflictions).',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Arc 2 : une fois le monde bouclé, on le rejoue — mêmes zones, tout autre échelle. Matériaux et sets dédiés, et l’équipement Divin à la Forge Sacrée.',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Boss de la semaine : tout le royaume frappe le même boss, une fois par jour. Paliers mutualisés, classement des dégâts et titre éphémère.',
      },
      {
        tag: 'Nouveau',
        text: 'Invocations : le Nécromancien fait apparaître des créatures qui combattent avec l’escouade, avec leurs propres barres de vie.',
      },
      {
        tag: 'Nouveau',
        text: 'Bestiaire : les monstres ont enfin des noms et des silhouettes propres à leur espèce, zone par zone.',
      },
      {
        tag: 'Nouveau',
        text: 'Oratoire Astral : la bénédiction d’arme quitte la Forge et devient un lieu. Les larmes astrales tombent dans les donjons.',
      },
      {
        tag: 'Nouveau',
        text: 'Champs de bataille : des batailles rangées jusqu’à 10 héros — la seule activité où l’effectif compte.',
      },
      {
        tag: 'Nouveau',
        text: 'Ateliers refondus : un rituel commun aux trois, une maîtrise par atelier, l’auto-craft côté serveur, et l’essence de boss qui oriente les stats secondaires.',
      },
      {
        tag: 'Nouveau',
        text: 'Week-ends à bonus : double XP, or et butin sur la carte.',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Nouveau départ pour tout le monde. Les comptes créés avant la bascule gardent le titre honorifique « Fondateur ».',
      },
      {
        tag: 'Équilibrage',
        text: 'Zone 1 dégrossie : le tout premier combat passe de 95 tours à 11.',
      },
    ],
  },
  {
    version: 'V1.1',
    date: '12 juillet 2026',
    title: 'Rééquilibrage : combats plus longs & tactiques',
    summary:
      'Fini le full-DPS qui one-shot : les combats durent plus longtemps et récompensent les équipes équilibrées (encaisse + soin + DPS).',
    entries: [
      {
        tag: 'Équilibrage',
        highlight: true,
        text: 'PV ×4 pour tout le monde (héros et monstres) : les combats durent nettement plus longtemps.',
      },
      {
        tag: 'Équilibrage',
        highlight: true,
        text: 'Monstres et boss frappent plus fort (×1.6) : une équipe full-DPS ne suffit plus, il faut de l’encaisse et du soin.',
      },
      {
        tag: 'Équilibrage',
        text: 'Enrage repoussé (manches 50 puis 100) et durée max portée à 150 manches pour accompagner ces combats plus longs.',
      },
    ],
  },
  {
    version: 'V1.0',
    date: '9 juillet 2026',
    title: 'Lancement officiel 🎉',
    summary:
      'La V1 est là ! Nouveau départ pour tout le monde, et un grand merci à ceux sans qui rien de tout ça : nos playtesteurs.',
    entries: [
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Merci à Pitot et Arthur, playtesteurs de la première heure — cette V1 vous doit énormément. 🙏',
      },
      {
        tag: 'Nouveau',
        highlight: true,
        text: 'Nouveau départ : les compteurs repartent à zéro pour un lancement équitable. Récupère ton cadeau avec le code BIENVENUE (bouton « Codes »).',
      },
      {
        tag: 'Nouveau',
        text: 'La suite est déjà tracée : jette un œil à la roadmap « Prochainement », tout en haut de ce panneau.',
      },
    ],
  },
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
