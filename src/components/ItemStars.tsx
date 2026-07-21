/**
 * Bandeau d'étoiles d'un objet : encode TROIS infos d'un coup, pour désencombrer
 * les cartes d'inventaire.
 *  - Remplissage (bleu acier) : zone du matériau utilisé (1→10) = puissance de base.
 *  - Contour doré : niveau d'amélioration (les N premières étoiles sont cerclées d'or).
 *  - ROUGE PLEIN : niveau de bénédiction — l'étoile est entièrement rouge
 *    (intérieur + contour), et écrase aussi bien le doré que le bleu de zone.
 * Ex. zone 2 + amélioration +4 + bénédiction +2 → les 2 premières étoiles
 * entièrement rouges, les 2 suivantes cerclées d'or sur fond bleu.
 *
 * Le rouge écrase l'or parce que la bénédiction est toujours plafonnée par le
 * renforcement (cf. `validateBless`) : une étoile bénie est forcément déjà
 * améliorée, garder les deux contours n'ajouterait aucune information et
 * noierait le signal qu'on veut justement voir de loin. Il écrase aussi le
 * remplissage de zone : un simple liseré rouge sur fond bleu ne se lisait pas.
 *
 * La zone (remplissage) vient de `materialZone` (déduite du suffixe du nom).
 * Purement cosmétique/front — aucune donnée de jeu modifiée.
 */
const STAR_PATH =
  'M12 2.6l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.6l-5.7 3.0 1.09-6.35-4.62-4.5 6.38-.93z';

const ZONE_FILL = '#3b82f6'; // bleu acier (zone du matériau)
const ZONE_STROKE = '#1d4ed8';
const UPGRADE_GOLD = '#f5b544'; // contour d'amélioration
const BLESS_FILL = '#dc2626'; // rouge de bénédiction (remplit l'étoile)
const BLESS_STROKE = '#7f1d1d'; // rouge sombre : garde l'étoile lisible sur fond clair
const EMPTY_STROKE = 'rgba(148,163,184,0.35)';

function Star({
  filled,
  upgraded,
  blessed,
  size,
}: {
  filled: boolean;
  upgraded: boolean;
  blessed: boolean;
  size: number;
}) {
  // Ordre de priorité : bénédiction > amélioration > zone > vide.
  // Une étoile BÉNIE est ENTIÈREMENT rouge — intérieur ET contour. Elle n'était
  // que cerclée de rouge sur un intérieur bleu de zone, ce qui se lisait mal :
  // la bénédiction est l'info la plus forte du bandeau, elle doit sauter aux yeux
  // sans qu'on ait à distinguer l'épaisseur d'un liseré.
  const fill = blessed ? BLESS_FILL : filled ? ZONE_FILL : 'none';
  const stroke = blessed
    ? BLESS_STROKE
    : upgraded
      ? UPGRADE_GOLD
      : filled
        ? ZONE_STROKE
        : EMPTY_STROKE;
  const strokeWidth = blessed || upgraded ? 2.6 : 1.3;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="block shrink-0" aria-hidden>
      <path d={STAR_PATH} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 10 étoiles : `zone` remplies, `upgrade` premières cerclées d'or, et les
 * `blessing` premières cerclées de ROUGE (le rouge remplace l'or).
 *
 * `blessing` est optionnel : les objets non bénissables (bijoux, reliques,
 * armures) l'omettent et rendent exactement comme avant.
 */
export function ZoneUpgradeStars({
  zone,
  upgrade,
  blessing = 0,
  size = 14,
}: {
  zone: number;
  upgrade: number;
  blessing?: number;
  size?: number;
}) {
  const z = Math.max(0, Math.min(10, Math.round(zone)));
  const u = Math.max(0, Math.min(10, Math.round(upgrade)));
  const b = Math.max(0, Math.min(10, Math.round(blessing)));
  const title =
    `Puissance : zone ${z}/10` +
    (u > 0 ? ` · Amélioration +${u}` : '') +
    (b > 0 ? ` · Bénédiction +${b}` : '');
  return (
    <div className="flex gap-[2px]" title={title} aria-label={title}>
      {Array.from({ length: 10 }, (_, i) => (
        <Star key={i} filled={i < z} upgraded={i < u} blessed={i < b} size={size} />
      ))}
    </div>
  );
}

/** Bandeau d'étoiles ROUGES : niveau de bénédiction d'une arme (V2, Arc 2).
 *  Réutilise BLESS_FILL / BLESS_STROKE : les deux bandeaux affichent donc
 *  exactement le même rouge, plein, pour la même notion. */
export function BlessingStars({ level, size = 14 }: { level: number; size?: number }) {
  const b = Math.max(0, Math.min(10, Math.round(level)));
  if (b <= 0) return null;
  const title = `Bénédiction : +${b}`;
  return (
    <div className="flex gap-[2px]" title={title} aria-label={title}>
      {Array.from({ length: b }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="block shrink-0" aria-hidden>
          <path d={STAR_PATH} fill={BLESS_FILL} stroke={BLESS_STROKE} strokeWidth={1.3} strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}
