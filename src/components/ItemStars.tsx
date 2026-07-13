/**
 * Bandeau d'étoiles d'un objet : encode DEUX infos d'un coup, pour désencombrer
 * les cartes d'inventaire.
 *  - Remplissage (bleu acier) : zone du matériau utilisé (1→10) = puissance de base.
 *  - Contour doré : niveau d'amélioration (les N premières étoiles sont cerclées d'or).
 * Ex. zone 2 + amélioration +4 → 2 étoiles pleines, 4 premières cerclées d'or.
 *
 * La zone (remplissage) vient de `materialZone` (déduite du suffixe du nom).
 * Purement cosmétique/front — aucune donnée de jeu modifiée.
 */
const STAR_PATH =
  'M12 2.6l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.6l-5.7 3.0 1.09-6.35-4.62-4.5 6.38-.93z';

const ZONE_FILL = '#3b82f6'; // bleu acier (zone du matériau)
const ZONE_STROKE = '#1d4ed8';
const UPGRADE_GOLD = '#f5b544'; // contour d'amélioration
const EMPTY_STROKE = 'rgba(148,163,184,0.35)';

function Star({ filled, upgraded, size }: { filled: boolean; upgraded: boolean; size: number }) {
  const fill = filled ? ZONE_FILL : 'none';
  const stroke = upgraded ? UPGRADE_GOLD : filled ? ZONE_STROKE : EMPTY_STROKE;
  const strokeWidth = upgraded ? 2.6 : 1.3;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="block shrink-0" aria-hidden>
      <path d={STAR_PATH} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

/** 10 étoiles : `zone` remplies, `upgrade` premières cerclées d'or. */
export function ZoneUpgradeStars({
  zone,
  upgrade,
  size = 14,
}: {
  zone: number;
  upgrade: number;
  size?: number;
}) {
  const z = Math.max(0, Math.min(10, Math.round(zone)));
  const u = Math.max(0, Math.min(10, Math.round(upgrade)));
  const title = `Puissance : zone ${z}/10${u > 0 ? ` · Amélioration +${u}` : ''}`;
  return (
    <div className="flex gap-[2px]" title={title} aria-label={title}>
      {Array.from({ length: 10 }, (_, i) => (
        <Star key={i} filled={i < z} upgraded={i < u} size={size} />
      ))}
    </div>
  );
}

const BLESS_FILL = '#dc2626'; // rouge (bénédiction d'arme)
const BLESS_STROKE = '#7f1d1d';

/** Bandeau d'étoiles ROUGES : niveau de bénédiction d'une arme (V2, Arc 2). */
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
