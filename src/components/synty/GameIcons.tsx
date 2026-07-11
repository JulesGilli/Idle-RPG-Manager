/**
 * Icônes de jeu — 100% Synty, aucun emoji.
 * Petits wrappers autour de <SyntyGlyph> qui résolvent un concept d'UI
 * (action, type d'objet, classe, passif, relique) vers un sprite Synty teinté.
 */
import { SyntyGlyph, SyntyImg } from './SyntyIcon';
import {
  UI_GLYPH,
  ITEM_TYPE_GLYPH,
  PASSIVE_GLYPH,
  JEWEL_GEM_MASK,
  classWeaponCleanUrl,
  forgeBaseUrl,
  skillNodeGlyph,
  setPieceIconDef,
  syntyUrl,
  type UiIconName,
} from '@/lib/synty';
import { classMeta } from '@/lib/gameUi';
import { FORGE_BASES } from '@shared/progression/forge';

/** Icône d'interface générique (or, xp, combat, verrou, boss…). */
export function UiIcon({
  name,
  size = 16,
  color,
  className = '',
  title = '',
}: {
  name: UiIconName;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}) {
  const g = UI_GLYPH[name];
  return (
    <SyntyGlyph
      src={g.src}
      size={size}
      color={color ?? ('tint' in g ? (g.tint as string) : 'currentColor')}
      className={className}
      title={title}
    />
  );
}

/** Icône de classe de héros (silhouette d'arme teintée par l'accent de classe). */
export function ClassIcon({
  classId,
  size = 18,
  color,
  className = '',
}: {
  classId: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <SyntyGlyph
      src={classWeaponCleanUrl(classId)}
      size={size}
      color={color ?? classMeta(classId).accent}
      className={className}
      title={classMeta(classId).label}
    />
  );
}

/** Icône de type d'objet (arme / armure / bijou / relique). */
export function ItemTypeIcon({
  type,
  size = 18,
  color = 'currentColor',
  className = '',
}: {
  type: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const src = ITEM_TYPE_GLYPH[type] ?? ITEM_TYPE_GLYPH.weapon!;
  return <SyntyGlyph src={src} size={size} color={color} className={className} />;
}

/** Icône Synty d'un nœud d'arbre de compétence (silhouette teintée par thème). */
export function SkillNodeIcon({
  nodeId,
  size = 18,
  color,
  className = '',
}: {
  nodeId: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const g = skillNodeGlyph(nodeId);
  return <SyntyGlyph src={g.src} size={size} color={color ?? g.color} className={className} />;
}

/** Icône de passif de bijou. */
export function PassiveIcon({
  passive,
  size = 14,
  color,
  className = '',
}: {
  passive: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const g = PASSIVE_GLYPH[passive];
  if (!g) return null;
  return (
    <SyntyGlyph src={g.src} size={size} color={color ?? g.tint ?? 'currentColor'} className={className} />
  );
}

/** Icône de relique : silhouette unique (toutes les reliques la partagent). */
export function RelicIcon({
  size = 18,
  color,
  className = '',
}: {
  /** Ignoré : toutes les reliques partagent désormais une seule icône (option « 1 icône par type »). */
  baseId?: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <SyntyGlyph
      src={syntyUrl.inv('Currency01')}
      size={size}
      color={color ?? '#f5b544'}
      className={className}
    />
  );
}

/** Icône spéciale d'une pièce de set (pleine couleur ou silhouette teintée). */
export function SetPieceIcon({
  pieceId,
  size = 18,
  className = '',
}: {
  pieceId: string;
  size?: number;
  className?: string;
}) {
  const d = setPieceIconDef(pieceId);
  if (d.img) return <SyntyImg src={d.src} size={size} className={className} />;
  return <SyntyGlyph src={d.src} size={size} color={d.tint ?? '#f5b544'} className={className} />;
}

/** Icône de bijou : gemme taillée, teintée par la couleur du passif. */
export function JewelIcon({
  passive,
  size = 18,
  className = '',
}: {
  passive: string;
  size?: number;
  className?: string;
}) {
  const tint = PASSIVE_GLYPH[passive]?.tint ?? '#9aa4b2';
  return <SyntyGlyph src={JEWEL_GEM_MASK} size={size} color={tint} className={className} />;
}

/* -------------------------------------------------- ÉQUIPEMENT POSSÉDÉ ---- */
// Le nom d'un objet forgé est `<modèle> <suffixe>` (ex. « Grande épée en chêne »,
// « Idole de Guerre de givre »). On déduit donc le MODÈLE du préfixe du nom, sans
// dépendre d'une colonne DB. Bases triées par longueur décroissante pour que
// « Grande épée » l'emporte sur « Épée ».
const MODEL_BASES = [...FORGE_BASES].sort((a, b) => b.label.length - a.label.length);

function baseIdFromName(name: string, bases: { id: string; label: string }[]): string | null {
  const n = name.toLowerCase();
  for (const b of bases) if (n.startsWith(b.label.toLowerCase())) return b.id;
  return null;
}

/**
 * Icône d'un objet d'équipement POSSÉDÉ : une silhouette Synty « Inventory »
 * teintée, UNE par type/modèle (option « 1 icône par type »). Armes/armures →
 * silhouette du modèle (déduite du nom) ; relique → Currency01 ; bijou → Rings01 ;
 * repli → silhouette d'objet générique. La couleur (rareté) teinte la silhouette.
 */
export function EquipmentIcon({
  item,
  size = 26,
  color,
  className = '',
}: {
  item: { name: string; item_type: string; passive_type?: string | null };
  size?: number;
  color?: string;
  className?: string;
}) {
  const tint = color ?? 'currentColor';
  if (item.item_type === 'weapon' || item.item_type === 'armor') {
    // Repli par type si le modèle n'est pas déduit du nom (ex. pièces de set).
    const baseId =
      baseIdFromName(item.name, MODEL_BASES) ?? (item.item_type === 'armor' ? 'plaques' : 'epee');
    return (
      <SyntyGlyph src={forgeBaseUrl(baseId)} size={size} color={tint} className={className} title={item.name} />
    );
  }
  const invName = item.item_type === 'relic' ? 'Currency01' : item.item_type === 'jewel' ? 'Rings01' : 'Items01';
  return (
    <SyntyGlyph src={syntyUrl.inv(invName)} size={size} color={tint} className={className} title={item.name} />
  );
}
