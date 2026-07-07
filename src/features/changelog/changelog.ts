/**
 * Journal des mises à jour — volontairement TRÈS léger en texte (une ligne par
 * changement) pour rester rapide à lire. Ordre : le plus récent en haut.
 * Ajoute simplement une entrée en tête de `CHANGELOG` à chaque mise à jour.
 */

export type ChangeTag = 'Nouveau' | 'Équilibrage' | 'Correctif';

export type ChangeEntry = { tag: ChangeTag; text: string };

/** Date de la dernière mise à jour (affichée en tête du panneau). */
export const CHANGELOG_UPDATED = '7 juillet 2026';

export const CHANGELOG: ChangeEntry[] = [
  { tag: 'Nouveau', text: 'Arène PvP : défie les joueurs mieux classés et échange vos places (récompense hebdo).' },
  { tag: 'Équilibrage', text: 'Boss d’arc désormais débloqués au niveau 12.' },
  { tag: 'Équilibrage', text: 'Donjons : cooldowns allongés (8 h / 12 h / 16 h / 24 h).' },
  { tag: 'Nouveau', text: 'Codes de récompense : entre un code pour un cadeau exclusif.' },
  { tag: 'Nouveau', text: 'Vitesse des combats réglable (×1 / ×2 / ×4).' },
  { tag: 'Équilibrage', text: 'Taverne : meilleures recrues au fil de ta progression.' },
  { tag: 'Équilibrage', text: 'Début de partie : une recrue de chaque classe garantie.' },
  { tag: 'Équilibrage', text: 'La Tour : ennemis bien plus coriaces (×2 PV et attaque).' },
  { tag: 'Nouveau', text: 'Récompense journalière sur 10 jours (jour 10 : objet ultime).' },
  { tag: 'Nouveau', text: 'Classement de progression + fiches joueur cliquables.' },
  { tag: 'Nouveau', text: 'Garnison de guilde : prête un héros à tes coéquipiers.' },
  { tag: 'Équilibrage', text: 'Archer & Mage : poison cumulatif, marques arcaniques, double tir.' },
  { tag: 'Correctif', text: 'Correction du chargement de la page (joueurs en ligne).' },
];
