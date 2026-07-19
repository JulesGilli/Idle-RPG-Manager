/**
 * Rareté d'un objet, lisible SANS dépendre de la couleur.
 *
 * Les cinq raretés étaient signalées uniquement par la teinte du nom, sur un
 * dégradé unique gris → doré : « peu commun » (#cbab63), « avancé » (#e0a642) et
 * « ultime » (#e07a38) sont trois nuances de doré, pratiquement indiscernables
 * côte à côte — et totalement pour un joueur daltonien, soit environ 8 % des
 * hommes. Le badge porte donc l'information en TEXTE ; la couleur ne fait plus
 * que la renforcer.
 *
 * `compact` réduit au sigle (MÉD / COM / PEU / AVA / ULT) pour les listes
 * étroites, où le libellé complet ne tiendrait pas.
 */
import { rarityColor, rarityMeta } from '@/lib/gameUi';

/** Sigles courts — assez distincts pour être lus d'un coup d'œil. */
const SHORT: Record<string, string> = {
  poor: 'MÉD',
  common: 'COM',
  uncommon: 'PEU',
  advanced: 'AVA',
  ultimate: 'ULT',
};

export function RarityBadge({
  rarity,
  compact = false,
  className = '',
}: {
  rarity: string;
  compact?: boolean;
  className?: string;
}) {
  const color = rarityColor(rarity);
  const label = compact ? (SHORT[rarity] ?? rarity.slice(0, 3).toUpperCase()) : rarityMeta(rarity).label;
  return (
    <span
      // Fond ET bordure teintés en plus du texte : à taille de sigle, un simple
      // texte coloré restait trop discret dans une liste dense.
      className={`inline-flex shrink-0 items-center rounded px-1 py-px text-[9px] font-bold uppercase leading-tight tracking-wide ${className}`}
      style={{ color, backgroundColor: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}66` }}
      title={`Rareté : ${rarityMeta(rarity).label}`}
    >
      {label}
    </span>
  );
}
