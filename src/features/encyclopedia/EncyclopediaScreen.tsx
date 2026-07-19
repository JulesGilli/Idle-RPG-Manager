import { useState } from 'react';
import { resourceMeta, RESOURCE_META } from '@/hooks/useResources';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, ItemTypeIcon, PassiveIcon, ClassIcon } from '@/components/synty/GameIcons';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { STATUS_GLYPH, type UiIconName } from '@/lib/synty';
import {
  SETS,
  SET_PIECES,
  setEffectAt,
  describeSetEffect,
  type SlotType,
} from '@shared/progression/sets';
import {
  FORGE_BASES,
  FORGE_MATERIALS,
  BOSS_MATERIALS,
  bossSecondaryBudget,
  craftRarityWeights,
  upgradeSuccessChance,
  UPGRADE_MAX,
  MASTERY_SUCCESS_BONUS_MAX,
  PITY_STEP,
} from '@shared/progression/forge';
import { MAX_MASTERY_LEVEL, AUTO_UNLOCK_LEVEL } from '@shared/progression/mastery';
import { BLESSING_MAX, BLESSING_STEP, blessingCost } from '@shared/progression/blessing';
import { RELIC_BASES } from '@shared/progression/relic';
import { GEMS, PASSIVE_META } from '@shared/progression/jewelry';
import { ARCS } from '@shared/progression/arcs';
import { CLASS_ALLOWED_WEIGHTS, type Rarity } from '@shared/progression/loot';
import { combatRole, SLOT_MAX_RANK, ULTIMATE_GATE, PASSIVE_LIMIT } from '@shared/progression/skills';
import { LEVEL_GROWTH, SKILL_POINTS_PER_LEVEL } from '@shared/progression/formulas';
import { TOWER_MAX_FLOOR, FLOORS_PER_ZONE } from '@shared/progression/tower';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account';
import type { PassiveType, StatusType } from '@shared/combat';
import { BackToVillage } from '@/components/BackToVillage';

/* ------------------------------------------------------------------ helpers */

const SLOT_LABEL: Record<SlotType, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  jewel: 'Bijou',
  relic: 'Relique',
};
const SLOT_ATELIER: Record<SlotType, string> = {
  weapon: 'Forge',
  armor: 'Forge',
  jewel: 'Joaillerie',
  relic: 'Autel des Reliques',
};

function statLine(b: { atk: number; def: number; hp: number }): string {
  return (
    [b.atk ? `+${b.atk} ATK` : null, b.def ? `+${b.def} DEF` : null, b.hp ? `+${b.hp} PV` : null]
      .filter(Boolean)
      .join(' · ') || '—'
  );
}

/** Catégorie d'une ressource (pour la section Matériaux). */
type MatCat = 'zone' | 'boss' | 'gemme' | 'donjon' | 'expedition' | 'legacy';

// La larme astrale tombe sur les BOSS DE DONJON (0-1 au T1 → 3-4 au T4) : sans
// elle ici, `matCategory` la rangeait dans le fallback « matériau de zone » et
// l'encyclopédie annonçait qu'elle se ramassait sur la carte. Faux.
const DUNGEON_KEYS = new Set([
  'ossement',
  'fragment_relique',
  'sceau_catacombe',
  'larme_astrale',
  'plume_appel',
]);
const EXPEDITION_KEYS = new Set([
  'seve_primordiale', 'ambre_vivant', 'coeur_sylve_ancien', 'poussiere_arcane',
  'tablette_oubliee', 'relique_noyee', 'minerai_stellaire', 'gemme_brute', 'eclat_du_noyau',
]);
const BOSS_KEYS = new Set([
  'coeur_sylve', 'givre_pur', 'oeil_sphinx', 'coeur_hydre', 'braise_eternelle',
  'fragment_titan', 'encre_kraken', 'foudre_condensee', 'coeur_ombre', 'essence_astrale',
]);
const LEGACY_KEYS = new Set(['iron', 'essence']);

function matCategory(key: string): MatCat {
  if (key.startsWith('gemme_')) return 'gemme';
  if (DUNGEON_KEYS.has(key)) return 'donjon';
  if (EXPEDITION_KEYS.has(key)) return 'expedition';
  if (BOSS_KEYS.has(key)) return 'boss';
  if (LEGACY_KEYS.has(key)) return 'legacy';
  return 'zone';
}

const CAT_META: Record<MatCat, { label: string; source: string }> = {
  zone: { label: 'Matériaux de zone', source: 'Butin des combats gagnés sur la carte (un par zone).' },
  boss: { label: 'Composants de boss', source: 'Lâchés par les boss de zone (niveau 5 de chaque zone).' },
  gemme: { label: 'Gemmes', source: 'Drop rare des boss de zone (~2 %). Donnent le passif des bijoux.' },
  donjon: {
    label: 'Butin de donjon',
    source:
      'Récupéré dans les Donjons. Sert aux reliques et aux sets. La larme astrale tombe sur le boss (0-1 au T1 → 3-4 au T4) : c\'est la seule source du jeu.',
  },
  expedition: { label: "Matériaux d'expédition", source: 'Rapportés par les Expéditions. Cœur des pièces de set.' },
  legacy: { label: 'Anciennes ressources', source: 'Reliquats d’anciens systèmes.' },
};

/* -------------------------------------------------------------------- pane */

type Section =
  | 'classes'
  | 'activites'
  | 'combat'
  | 'competences'
  | 'sets'
  | 'passifs'
  | 'craft'
  | 'materiaux'
  | 'progression';

const SECTIONS: { id: Section; label: string; icon: UiIconName }[] = [
  { id: 'classes', label: 'Classes', icon: 'tavern' },
  { id: 'activites', label: 'Activités', icon: 'map' },
  { id: 'combat', label: 'Combat', icon: 'attack' },
  { id: 'competences', label: 'Compétences', icon: 'book' },
  { id: 'sets', label: "Sets d'ensemble", icon: 'boss' },
  { id: 'passifs', label: 'Passifs & gemmes', icon: 'jewel' },
  { id: 'craft', label: 'Forge & reliques', icon: 'forge' },
  { id: 'materiaux', label: 'Matériaux', icon: 'materials' },
  { id: 'progression', label: 'Progression', icon: 'xp' },
];

export function EncyclopediaScreen() {
  const [section, setSection] = useState<Section>('classes');

  return (
    <section className="anim-fade space-y-6">
      <BackToVillage />
      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <UiIcon name="boss" size={24} color="var(--color-gold-soft)" />
          Encyclopédie du Royaume
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Le grand grimoire du royaume : classes et rôles, toutes les activités, le déroulé du
          combat, l'arbre de compétences, les sets et leurs bonus, les passifs, les recettes de craft
          et la provenance des matériaux. Tout ce qu'il faut savoir pour mener ton escouade.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              section === s.id
                ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
            }`}
          >
            <UiIcon name={s.icon} size={15} color="currentColor" /> {s.label}
          </button>
        ))}
      </div>

      {section === 'classes' && <ClassesPane />}
      {section === 'activites' && <ActivitesPane />}
      {section === 'combat' && <CombatPane />}
      {section === 'competences' && <CompetencesPane />}
      {section === 'sets' && <SetsPane />}
      {section === 'passifs' && <PassifsPane />}
      {section === 'craft' && <CraftPane />}
      {section === 'materiaux' && <MateriauxPane />}
      {section === 'progression' && <ProgressionPane />}
    </section>
  );
}

/* ----------------------------------------------------------------- CLASSES */

const ROLE_LABEL: Record<string, string> = {
  tank: 'Tank',
  dps: 'DPS',
  healer: 'Soigneur',
  enemy: 'Ennemi',
};
const WEIGHT_TINT: Record<string, string> = { light: '#5fd39b', medium: '#e8b64a', heavy: '#f0934a' };

const CLASS_WIKI: { id: string; name: string; profil: string; blurb: string }[] = [
  {
    id: 'guerrier',
    name: 'Guerrier',
    profil: 'PV élevés, ATK correcte',
    blurb:
      'Tank offensif. Brise l’armure, exécute les cibles affaiblies, gagne en puissance à bas PV et vole de la vie.',
  },
  {
    id: 'paladin',
    name: 'Paladin',
    profil: 'PV très élevés, ATK faible',
    blurb:
      'Tank protecteur. Provoque les ennemis pour les détourner de tes fragiles, renvoie les coups (épines) et peut ressusciter une fois par combat.',
  },
  {
    id: 'archer',
    name: 'Archer',
    profil: 'ATK élevée, vitesse haute, PV faibles',
    blurb:
      'DPS à distance. Empoisonne (DoT qui s’amplifie et se propage) et amplifie ses dégâts contre les cibles empoisonnées ; peut frapper plusieurs ennemis.',
  },
  {
    id: 'mage',
    name: 'Mage',
    profil: 'ATK la plus élevée, PV très faibles',
    blurb:
      'DPS de zone. Embrase les ennemis (feu) et déchaîne des déflagrations qui se propagent à tout le groupe adverse.',
  },
  {
    id: 'soigneur',
    name: 'Oracle',
    profil: 'ATK faible, PV moyens',
    blurb:
      'Soutien. Soigne l’allié le plus blessé à chaque tour, affaiblit les ennemis et peut ressusciter un allié tombé.',
  },
  {
    id: 'voleur',
    name: 'Voleur',
    profil: 'ATK élevée, vitesse la plus haute, PV faibles',
    blurb:
      'DPS furtif à la dague. Coups critiques et exécutions, lames empoisonnées, esquive et frappes doubles ; peut étourdir et se rendre insaisissable.',
  },
  {
    id: 'necromancien',
    name: 'Nécromancien',
    profil: 'PV moyens, dégâts magiques',
    blurb:
      'Invocateur à la faux. Lève des goules et des squelettes qui combattent à ses côtés, ou draine la vie de ses ennemis (branche Faucheur).',
  },
  {
    id: 'inquisiteur',
    name: 'Inquisiteur',
    profil: 'PV élevés, ATK élevée',
    blurb:
      'Gros DPS de mêlée à l’épée élémentaire : embrasement (Feu), étourdissement et perce-armure (Foudre) ou affaiblissement (Givre).',
  },
];

function ClassesPane() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)]">
        Huit classes, trois rôles. Le <strong>rôle</strong> dicte le comportement en combat (le tank
        encaisse, le DPS frappe, le soigneur soigne). Chaque classe ne peut porter que certains{' '}
        <strong>poids</strong> d’arme et d’armure. Le détail des compétences se règle à la{' '}
        <strong>Bibliothèque</strong>.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CLASS_WIKI.map((c) => {
          const role = combatRole(c.id);
          const weights = CLASS_ALLOWED_WEIGHTS[c.id] ?? [];
          return (
            <div key={c.id} className="panel p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--color-ink)]">
                  <ClassIcon classId={c.id} size={20} /> {c.name}
                </span>
                <span className="chip bg-[var(--color-arcane)]/15 text-[10px] text-[var(--color-arcane)]">
                  {ROLE_LABEL[role] ?? role}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="text-[var(--color-muted)]">Équipe :</span>
                {weights.map((w) => (
                  <span
                    key={w}
                    className="chip bg-white/5 font-medium"
                    style={{ color: WEIGHT_TINT[w] }}
                  >
                    {WEIGHT_LABEL[w]}
                  </span>
                ))}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--color-muted)]/80">{c.profil}</div>
              <p className="mt-1.5 text-[11px] text-[var(--color-ink)]/80">{c.blurb}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--color-muted)]">
        Bijoux et reliques n’ont pas de poids : toutes les classes peuvent les équiper.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- ACTIVITÉS */

const ACTIVITIES_WIKI: { icon: UiIconName; name: string; desc: string }[] = [
  { icon: 'map', name: 'Carte & Zones', desc: "Déploie une escouade sur une zone : elle enchaîne les combats en idle, même hors-ligne. Chaque zone a 5 niveaux, le 5ᵉ est un boss. Le vaincre lâche un composant rare et ouvre la zone suivante." },
  { icon: 'tavern', name: 'Taverne — recrutement', desc: "Recrute des héros. Chaque recrue a un grade (S le meilleur, puis A, B, C, D) et un petit « roll de naissance » (bonus de stats de départ). L'offre se renouvelle régulièrement." },
  { icon: 'book', name: 'Bibliothèque du Savoir', desc: "Dépense les points de compétence de tes héros dans leur arbre (voir l'onglet Compétences)." },
  { icon: 'forge', name: 'Forge · Joaillerie · Autel des Reliques', desc: "Fabrique et améliore ton équipement : armes/armures à la Forge, bijoux à la Joaillerie (+ gemme), reliques à l'Autel (+ butin de donjon). Chaque atelier a sa MAÎTRISE, qui monte à chaque craft. Détail dans l'onglet Forge & reliques." },
  { icon: 'blessing', name: 'Oratoire Astral', desc: "Bénis tes armes avec une larme astrale : chaque bénédiction amplifie leur dégât de TYPE (physique, magique ou soin) — jamais leurs stats brutes. Plafonnée par le renforcement de l'arme, et une arme bénie ne peut PLUS être renforcée. Débloqué en Arc 2." },
  { icon: 'materials', name: 'Donjons', desc: "Combats enchaînés sans reset complet des PV, avec mini-boss et boss. Rapportent le butin de craft (ossements, fragments de relique, sceaux) pour les reliques et les sets. Cooldown selon le tier." },
  { icon: 'leaderboard', name: 'La Tour', desc: `Grimpe la tour de ta classe en solo : ${TOWER_MAX_FLOOR} étages (${FLOORS_PER_ZONE} par zone). Un seul héros monte, ses PV se reportent d'un étage à l'autre (petite régén). La montée s'arrête à la première défaite ; récompenses aux paliers.` },
  { icon: 'map', name: 'Expéditions', desc: "Envoie jusqu'à 4 héros au loin pendant plusieurs heures : ils reviennent avec or, XP et matériaux d'expédition (le cœur des pièces de set). Une équipe plus puissante revient plus vite." },
  { icon: 'boss', name: "Boss d'arc", desc: "Le gardien de fin d'arc. Le vaincre débloque l'arc suivant et son tier de matériaux (équipement plus puissant)." },
  { icon: 'attack', name: 'Arène (PvP)', desc: "Combats asynchrones entre joueurs : tu figes une équipe de défense (snapshot) et tu attaques celle des autres. Grimpe les rangs ; récompenses hebdomadaires." },
  { icon: 'guild', name: 'Guilde & raids', desc: "Rejoins ou fonde une guilde. Contribue pour la monter en niveau, débloque l'arbre de guilde (bonus de raid), mets des héros en garnison pour les prêter, et lance des raids coopératifs." },
  { icon: 'relic', name: 'Autel des Runes', desc: "Éveille tes héros de grade S arrivés au niveau max, et scelle l'effet 2-pièces d'un set dans une RUNE en sacrifiant deux pièces. Consomme des larmes astrales. Débloqué en Arc 2." },
  { icon: 'attack', name: "Pantin d'entraînement", desc: "Défi quotidien : inflige un maximum de dégâts au pantin. Ton meilleur score donne une récompense chaque jour." },
];

function ActivitesPane() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)]">
        Le royaume regorge d'activités qui se débloquent avec ton <strong>niveau de compte</strong>
        {' '}(voir l'onglet Progression). Voici à quoi sert chacune.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ACTIVITIES_WIKI.map((a) => (
          <div key={a.name} className="panel p-3">
            <div className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--color-ink)]">
              <UiIcon name={a.icon} size={17} color="var(--color-gold-soft)" /> {a.name}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-ink)]/80">{a.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- COMPÉTENCES */

function CompetencesPane() {
  const chip = (v: string) => (
    <span className="chip bg-[var(--color-arcane)]/15 text-[11px] font-semibold text-[var(--color-arcane)]">{v}</span>
  );
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="book" size={16} color="var(--color-gold-soft)" /> L'arbre de compétences
        </h3>
        <p className="text-[11px] text-[var(--color-ink)]/80">
          Chaque classe a <strong>3 branches</strong> distinctes. Une branche contient{' '}
          <strong>3 passifs</strong> (rang max {SLOT_MAX_RANK.passive}), <strong>1 actif</strong>{' '}
          (rang {SLOT_MAX_RANK.active}) et <strong>1 ultime</strong> (rang {SLOT_MAX_RANK.ultimate}).
          Les nœuds octroient des <strong>effets</strong> (passifs de combat, capacités), jamais des
          stats brutes.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 font-display font-semibold text-[var(--color-ink)]">Règles de progression</h3>
        <ul className="space-y-2 text-[11px] text-[var(--color-ink)]/85">
          <li className="flex items-start gap-2">{chip(`${SKILL_POINTS_PER_LEVEL} pt / niveau`)}<span>Chaque niveau gagné donne un point à dépenser. Au cap, tu ne peux pas tout prendre : il faut choisir.</span></li>
          <li className="flex items-start gap-2">{chip('Séquentiel')}<span>Pour apprendre un nœud, le nœud <strong>précédent</strong> de sa branche doit avoir au moins 1 rang.</span></li>
          <li className="flex items-start gap-2">{chip(`Ultime : ${ULTIMATE_GATE} pts`)}<span>L'ultime d'une branche exige d'avoir investi <strong>{ULTIMATE_GATE} points</strong> dans cette branche.</span></li>
          <li className="flex items-start gap-2">{chip(`Max ${PASSIVE_LIMIT} passifs`)}<span>Tu ne peux apprendre que <strong>{PASSIVE_LIMIT} passifs distincts</strong> : impossible de tout empiler, ça force la spécialisation.</span></li>
          <li className="flex items-start gap-2">{chip('Loadout')}<span>Un seul <strong>actif</strong> et un seul <strong>ultime</strong> sont équipés à la fois — choisis ceux qui s'activent en combat.</span></li>
        </ul>
        <p className="mt-2 text-[10px] text-[var(--color-muted)]">
          Tout se règle à la <strong>Bibliothèque du Savoir</strong>. Un reset (contre de l'or) permet de tout réattribuer.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ COMBAT */

const STATUSES: { id: StatusType; label: string; tint: string; effect: string }[] = [
  { id: 'poison', label: 'Poison', tint: '#8ade8a', effect: 'Dégâts par tour (fraction de l’ATK du lanceur). Peut se propager à un autre ennemi (contagion).' },
  { id: 'burn', label: 'Feu', tint: '#fb923c', effect: 'Dégâts par tour de feu. Se propage aux autres ennemis via la déflagration du mage.' },
  { id: 'stun', label: 'Étourdissement', tint: '#facc15', effect: 'La cible saute son tour.' },
  { id: 'weaken', label: 'Affaiblissement', tint: '#c084fc', effect: 'Réduit l’ATK et la DEF de la cible (cumulable, plafonné à 90 %).' },
  { id: 'taunt', label: 'Provocation', tint: '#fbbf24', effect: 'Force les ennemis à cibler le porteur pendant toute sa durée.' },
];

const PASSIVE_DESC: Record<PassiveType, string> = {
  regen: 'Récupère un % des PV max à chaque tour.',
  shield: 'Réduit les dégâts subis d’un %.',
  crit: 'Chance d’infliger un coup critique (dégâts ×2).',
  venom: '+% de dégâts contre les ennemis déjà blessés.',
  rage: '+% de dégâts sous 50 % de PV.',
  thorns: 'Renvoie un % des dégâts subis à l’attaquant.',
  lifesteal: 'Soigne un % des dégâts infligés.',
  first_strike: '+% de dégâts au premier tour.',
  dodge: 'Chance d’esquiver complètement une attaque.',
  execute: '+% de dégâts contre les cibles sous 30 % de PV.',
};

function CombatPane() {
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="loop" size={16} color="var(--color-gold-soft)" /> Déroulé d’une manche
        </h3>
        <ol className="list-inside list-decimal space-y-1 text-[11px] text-[var(--color-ink)]/80">
          <li>Les <strong>dégâts sur la durée</strong> (poison, feu) et la <strong>régénération</strong> s’appliquent en début de manche.</li>
          <li>Chacun agit dans l’ordre de <strong>vitesse décroissante</strong> (à égalité, tes héros d’abord).</li>
          <li>À son tour, un combattant lance sa capacité active si elle est prête, sinon attaque (ou soigne).</li>
        </ol>
        <p className="mt-2 text-[10px] text-[var(--color-muted)]">
          Chaque combat est déterministe : une même « seed » rejoue exactement les mêmes événements.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="attack" size={16} color="var(--color-gold-soft)" /> Qui vise qui ?
        </h3>
        <ul className="space-y-1.5 text-[11px] text-[var(--color-ink)]/80">
          <li>🎲 <strong>Ennemis</strong> : ils frappent une cible <strong>au hasard</strong> parmi tes héros vivants — tes fragiles ne meurent plus systématiquement en premier.</li>
          <li>⚔️ <strong>Tes héros</strong> : <strong>focus fire</strong> — ils achèvent l’ennemi au plus bas PV.</li>
          <li>🛡️ <strong>Provocation</strong> (Paladin) : prioritaire, elle force les ennemis à taper le provocateur.</li>
          <li>❤️ <strong>Soigneur</strong> : ne suit pas ces règles — il soigne l’allié le plus blessé, et n’attaque que s’il n’y a personne à soigner.</li>
        </ul>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="power" size={16} color="var(--color-gold-soft)" /> Calcul des dégâts
        </h3>
        <p className="text-[11px] text-[var(--color-ink)]/80">
          Dégâts ≈ <strong>ATK de l’attaquant − mitigation de la cible</strong> (DEF + armure), avec une{' '}
          <strong>variance de ±15 %</strong>. Un <strong>coup critique</strong> double les dégâts. La{' '}
          <strong>pénétration d’armure</strong> ignore une partie de la mitigation ; l’<strong>affaiblissement</strong>{' '}
          baisse l’ATK/DEF ; l’<strong>égide</strong> et le <strong>bouclier</strong> les réduisent. Un
          coup inflige toujours au moins 1 dégât.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="attack" size={16} color="var(--color-gold-soft)" /> Types de dégâts
        </h3>
        <p className="text-[11px] text-[var(--color-ink)]/80">
          Chaque attaque a un <strong>type de base</strong> : <strong>physique</strong> (guerrier,
          paladin, archer, voleur, inquisiteur) ou <strong>magique</strong> (mage, soigneur,
          nécromancien). Certains sorts et statuts portent en plus une <strong>école</strong> —{' '}
          <span style={{ color: '#fb923c' }}>feu</span>, <span style={{ color: '#8ade8a' }}>poison</span>,{' '}
          <span style={{ color: '#c084fc' }}>arcane</span>. Des <strong>sets</strong> et compétences{' '}
          <strong>amplifient</strong> un type précis (+% de dégâts de feu / poison / arcane / physique) :
          à combiner avec la bonne classe.
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="power" size={16} color="var(--color-gold-soft)" /> Stats & montée en niveau
        </h3>
        <ul className="space-y-1 text-[11px] text-[var(--color-ink)]/80">
          <li><strong>ATK</strong> : dégâts infligés · <strong>DEF + Armure</strong> : réduisent les dégâts subis · <strong>PV</strong> : points de vie · <strong>Vitesse</strong> : ordre d'action (le plus rapide agit en premier).</li>
          <li>Stats avancées : <strong>dégâts critiques</strong> (multiplicateur des coups critiques) et <strong>pénétration d'armure</strong> (ignore une part de la mitigation).</li>
          <li>Les stats de base montent de <strong>+{Math.round(LEVEL_GROWTH * 100)} % par niveau</strong> ; l'équipement ajoute des bonus plats par-dessus.</li>
          <li>La <strong>Puissance</strong> résume la force d'un héros (ATK/DEF/PV/vitesse pondérés) — elle sert de prérequis aux expéditions et de base aux classements.</li>
        </ul>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 font-display font-semibold text-[var(--color-ink)]">Statuts de combat</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {STATUSES.map((s) => (
            <div key={s.id} className="flex items-start gap-2 rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
              {STATUS_GLYPH[s.id] && <SyntyGlyph src={STATUS_GLYPH[s.id]!} color={s.tint} size={18} />}
              <div className="min-w-0">
                <div className="text-[12px] font-semibold" style={{ color: s.tint }}>{s.label}</div>
                <div className="text-[11px] text-[var(--color-muted)]">{s.effect}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 font-display font-semibold text-[var(--color-ink)]">Passifs de combat</h3>
        <p className="mb-2 text-[11px] text-[var(--color-muted)]">
          Fournis par les <strong>bijoux</strong> (gemmes) et certaines <strong>compétences</strong>.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(PASSIVE_DESC) as PassiveType[]).map((p) => (
            <div key={p} className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-2.5">
              <PassiveIcon passive={p} size={16} />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[var(--color-ink)]">
                  {PASSIVE_META[p].label}
                </div>
                <div className="text-[11px] text-[var(--color-muted)]">{PASSIVE_DESC[p]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- SETS */

function SetsPane() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)]">
        L'intérêt d'un set, c'est son <strong>effet d'ensemble</strong> : réunis assez de pièces
        d'un même set pour le débloquer. Les pièces sont universelles (toutes classes). Déplie un set
        pour voir le détail.
      </p>
      {SETS.map((set) => (
        <SetCard key={set.id} set={set} />
      ))}
    </div>
  );
}

function SetCard({ set }: { set: (typeof SETS)[number] }) {
  const [open, setOpen] = useState(false);
  const pieces = SET_PIECES.filter((p) => p.setId === set.id);
  const need = setEffectAt(set);

  return (
    <div className="panel overflow-hidden">
      {/* En-tête cliquable : nom + effet d'ensemble (l'essentiel). */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-white/[0.03]"
      >
        <span
          className={`mt-1 shrink-0 text-[var(--color-muted)] transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-display font-semibold text-[var(--color-ink)]">{set.name}</span>
            <span className="text-[11px] italic text-[var(--color-muted)]">{set.theme}</span>
          </span>
          <span className="mt-1.5 flex items-start gap-1.5 text-[12px] text-[var(--color-ink)]/90">
            <span className="chip shrink-0 bg-[var(--color-arcane)]/15 text-[10px] text-[var(--color-arcane)]">
              {need} pièces
            </span>
            <span className="text-[var(--color-gold-soft)]">{describeSetEffect(set)}</span>
          </span>
        </span>
      </button>

      {/* Détail déplié : bonus de stats + pièces qui composent le set (sans recette). */}
      {open && (
        <div className="border-t border-[var(--color-edge)] px-4 pb-4 pt-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--color-muted)]">Bonus dès 2 pièces :</span>
            <span className="text-[var(--color-gold-soft)]">{statLine(set.bonus2)}</span>
          </div>
          {/* Un set couvrant les trois poids n'est pas « réservé » : l'annoncer
              comme une restriction ferait croire à une contrainte inexistante. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {set.weights.length >= 3 ? (
              <span className="text-[var(--color-muted)]">Toutes les classes</span>
            ) : (
              <>
                <span className="text-[var(--color-muted)]">Réservé aux poids :</span>
                <span className="text-[var(--color-ink)]/90">
                  {set.weights.map((w) => WEIGHT_LABEL[w] ?? w).join(', ')}
                </span>
              </>
            )}
          </div>
          <div className="mt-3 text-[11px] text-[var(--color-muted)]">Pièces de l'ensemble</div>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {pieces.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-edge)] bg-black/20 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-[var(--color-ink)]">
                  <ItemTypeIcon type={p.slot} size={15} color="var(--color-muted)" />
                  <span className="truncate">{p.label}</span>
                </span>
                <span className="chip shrink-0 bg-white/5 text-[10px] text-[var(--color-muted)]">
                  {SLOT_LABEL[p.slot]} · {SLOT_ATELIER[p.slot]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- PASSIFS */

function PassifsPane() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)]">
        Un <strong>bijou</strong> ne donne aucune stat brute : il porte un <strong>passif en %</strong>.
        La gemme (drop rare des boss) fixe le type de passif ; le composant de zone fixe sa puissance.
        Le <strong>raffinage</strong> à la Joaillerie augmente le %, jusqu'au plafond.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {GEMS.map((g) => (
          <div key={g.id} className="panel p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--color-ink)]">
                <ResourceIcon resKey={g.id} size={16} /> {g.label}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-arcane)]">
                <PassiveIcon passive={g.passive} size={12} /> {g.passiveLabel}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              {g.description.replace('{X}', `${g.basePct}–${g.maxPct}`)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]/80">
              <span>Boss de la zone {g.zone}</span>
              <span className="chip bg-white/5">Plafond {g.maxPct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- CRAFT */

const WEIGHT_LABEL: Record<string, string> = { light: 'Léger', medium: 'Moyen', heavy: 'Lourd' };

/**
 * Ces trois helpers DÉRIVENT les chiffres des vraies formules au lieu de les
 * recopier en dur : une encyclopédie qui ment est pire que pas d'encyclopédie, et
 * ces valeurs ont déjà bougé trois fois cette semaine.
 */
const pct = (v: number): string => `${Math.round(v * 100)} %`;

/** Part d'une rareté dans les poids de craft, à un niveau de maîtrise donné. */
function rarityShare(masteryLevel: number, rarity: Rarity): string {
  const w = craftRarityWeights(masteryLevel);
  const total = Object.values(w).reduce((s, x) => s + x, 0);
  return pct((w[rarity] ?? 0) / total);
}

/** Larmes astrales pour une bénédiction +0 → +BLESSING_MAX. */
function blessingTotalTears(): number {
  let t = 0;
  for (let l = 0; l < BLESSING_MAX; l++) t += blessingCost(l).materials[0]?.qty ?? 0;
  return t;
}

function CraftPane() {
  const materials = [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone);
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="forge" size={16} color="var(--color-gold-soft)" /> Comment se forge un objet
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          On choisit un <strong>modèle</strong> (le type d'objet), un <strong>composant</strong> de
          zone, et — à la Forge et à l'Autel — une <strong>essence de boss</strong>. Le composant fixe
          la <strong>puissance</strong> (croît avec la zone et le tier) ; l'essence décide des{' '}
          <strong>stats secondaires</strong>. La <strong>rareté</strong>, tirée au craft, module la
          qualité de −20 % (Médiocre) à +35 % (Ultime) — et c'est la <strong>maîtrise</strong> de
          l'atelier qui pilote ses chances. Armes/armures à la Forge, bijoux à la Joaillerie
          (+ gemme, pas d'essence), reliques à l'Autel (+ butin de donjon).
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="xp" size={16} color="var(--color-gold-soft)" /> La maîtrise d'atelier
        </h3>
        <p className="mb-2 text-[11px] text-[var(--color-ink)]/80">
          Forge, Joaillerie et Autel ont chacun leur maîtrise (Nv.1 → Nv.{MAX_MASTERY_LEVEL}), qui
          monte à <strong>chaque craft</strong> — plus la zone et le tier du composant sont hauts,
          plus le craft rapporte. Elle ne s'achète pas : elle se pratique.
        </p>
        <ul className="space-y-1.5 text-[11px] text-[var(--color-ink)]/85">
          <li>
            <strong className="text-[var(--color-ink)]">Meilleures raretés.</strong> Les chances
            passent de{' '}
            {rarityShare(1, 'ultimate')} d'Ultime au Nv.1 à {rarityShare(MAX_MASTERY_LEVEL, 'ultimate')}{' '}
            au Nv.{MAX_MASTERY_LEVEL} — et le Médiocre s'effondre de {rarityShare(1, 'poor')} à{' '}
            {rarityShare(MAX_MASTERY_LEVEL, 'poor')}.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Auto-craft au Nv.{AUTO_UNLOCK_LEVEL}.</strong>{' '}
            L'atelier enchaîne les crafts jusqu'à la rareté visée. C'est la récompense de la maîtrise,
            pas un raccourci.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Renforcements plus sûrs.</strong> Jusqu'à +
            {Math.round(MASTERY_SUCCESS_BONUS_MAX * 100)} points de réussite au niveau max.
          </li>
        </ul>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="craft" size={16} color="var(--color-gold-soft)" /> Renforcer
        </h3>
        <p className="text-[11px] text-[var(--color-ink)]/80">
          Chaque niveau ajoute <strong>+10 %</strong> aux stats de base de l'objet, jusqu'à{' '}
          <strong>+{UPGRADE_MAX}</strong>. La réussite chute avec le niveau ({pct(upgradeSuccessChance(0))}{' '}
          au premier palier, {pct(upgradeSuccessChance(UPGRADE_MAX - 1))} au dernier) et un{' '}
          <strong>échec fait reculer d'un niveau</strong>. Deux filets : la maîtrise de l'atelier, et
          l'<strong>acharnement</strong> — chaque échec consécutif sur le MÊME objet ajoute{' '}
          {Math.round(PITY_STEP * 100)} points à la tentative suivante, remis à zéro dès la première
          réussite. Rien n'est jamais garanti : la réussite plafonne à 95 %.
        </p>
        <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">
          Armes et armures se renforcent à la Forge, les reliques à l'Autel — chacun avec SA maîtrise.
          Les bijoux ne se renforcent pas : ils se <strong>raffinent</strong> à la Joaillerie (même
          mécanique de recul, même filets).
        </p>
      </div>

      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="blessing" size={16} color="#fb7185" /> Bénir (Oratoire Astral)
        </h3>
        <p className="text-[11px] text-[var(--color-ink)]/80">
          La voie <strong>opposée</strong> au renforcement, et le choix est définitif. Bénir n'ajoute
          aucune stat brute : chaque niveau amplifie de <strong>+{Math.round(BLESSING_STEP * 100)} %</strong>{' '}
          le dégât de TYPE de l'arme (physique, magique ou soin), jusqu'à +{BLESSING_MAX} — soit ×
          {(1 + BLESSING_STEP * BLESSING_MAX).toFixed(1)} au maximum.
        </p>
        <ul className="mt-2 space-y-1.5 text-[11px] text-[var(--color-ink)]/85">
          <li>
            <strong className="text-[var(--color-ink)]">Armes uniquement</strong>, et seulement celles
            qui portent un amplificateur de type (toutes).
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Plafonnée par le renforcement</strong> : +5 de
            renfort → +5 de bénédiction au plus. Monte l'arme AVANT de la consacrer.
          </li>
          <li>
            <strong className="text-[var(--color-ember)]">Irréversible</strong> : une arme bénie ne
            peut plus jamais être renforcée.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Coût</strong> : de l'or (qui grimpe vite) et
            des <strong>larmes astrales</strong> — 1 jusqu'au +5, 2 ensuite, soit {blessingTotalTears()}{' '}
            pour un +{BLESSING_MAX} complet. La larme ne tombe que sur les boss de donjon, et elle sert
            aussi à l'éveil des héros et aux runes.
          </li>
        </ul>
      </div>

      <div className="panel p-4">
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">Modèles</div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {FORGE_BASES.map((b) => (
            <span key={b.id} className="chip bg-white/5 text-[var(--color-ink)]/85">
              <ItemTypeIcon type={b.itemType} size={11} color="currentColor" /> {b.label} ·{' '}
              {WEIGHT_LABEL[b.weight]}
            </span>
          ))}
          {RELIC_BASES.map((b) => (
            <span key={b.id} className="chip bg-white/5 text-[var(--color-ink)]/85">
              <ItemTypeIcon type="relic" size={11} color="currentColor" /> {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
          Composants de zone (puissance)
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m) => {
            return (
              <div key={m.id} className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--color-ink)]">{m.label}</span>
                  <span className="flex items-center gap-1 text-[10px]">
                    <span className="chip bg-[var(--color-gold)]/15 font-semibold text-[var(--color-gold-soft)]">
                      T{m.craftTier}
                    </span>
                    <span className="chip bg-white/5 text-[var(--color-muted)]">Zone {m.zone}</span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                  <span>Puissance {m.magnitude}</span>
                  {m.materials.map((x) => (
                    <span key={x.key} className="inline-flex items-center gap-1 text-[var(--color-ink)]/70">
                      <ResourceIcon resKey={x.key} size={11} /> ×{x.qty}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
          Essences de boss (stats secondaires)
        </div>
        <p className="mb-3 text-[11px] text-[var(--color-muted)]">
          À la Forge, l'essence se choisit librement : elle décide QUELLES stats secondaires reçoit
          l'arme ou l'armure. Sa <strong className="text-[var(--color-ink)]">zone</strong> fixe le budget,
          le <strong className="text-[var(--color-ink)]">composant</strong> l'amplifie — et le budget se
          partage entre ses stats : concentrer ou étaler. Sans essence, la pièce n'a aucun secondaire.
          Les zones 1 à 3 n'ont pas de boss, donc pas d'essence.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {BOSS_MATERIALS.map((b) => (
            <div key={b.key} className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-ink)]">
                  <ResourceIcon resKey={b.key} size={13} /> {b.label}
                </span>
                <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">Zone {b.zone}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                <span className="text-[var(--color-arcane)]">
                  {b.stats.map((s) => ({ atk: 'ATK', def: 'DEF', hp: 'PV' })[s]).join(' + ')}
                </span>
                <span>Budget {bossSecondaryBudget(b.zone).toFixed(2)}×</span>
                <span className="text-[var(--color-ink)]/70">×{b.qty} par craft</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- MATÉRIAUX */

function MateriauxPane() {
  const byCat = new Map<MatCat, string[]>();
  for (const key of Object.keys(RESOURCE_META)) {
    const cat = matCategory(key);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(key);
  }
  const order: MatCat[] = ['zone', 'boss', 'gemme', 'donjon', 'expedition', 'legacy'];

  return (
    <div className="space-y-3">
      {order.map((cat) => {
        const keys = byCat.get(cat);
        if (!keys || keys.length === 0) return null;
        return (
          <div key={cat} className="panel p-4">
            <h3 className="font-display font-semibold text-[var(--color-ink)]">{CAT_META[cat].label}</h3>
            <p className="mb-2 text-[11px] text-[var(--color-muted)]">{CAT_META[cat].source}</p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {keys.map((k) => (
                <span key={k} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]/85">
                  <ResourceIcon resKey={k} size={13} /> {resourceMeta(k).label}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ PROGRESSION */

// Table COMPLÈTE : elle était partielle, et le fallback affichait la clé brute —
// « tower » et « arena » s'affichaient tels quels dans la liste des déblocages.
const ACTIVITY_LABEL: Record<ActivityKey, string> = {
  inventory: 'Sac',
  village: 'Village',
  tavern: 'Taverne',
  forge: 'Forge',
  library: 'Bibliothèque',
  encyclopedia: 'Encyclopédie',
  dungeon: 'Donjons',
  arc_boss: "Boss d'arc",
  jewelry: 'Joaillerie',
  relic: 'Autel des Reliques',
  oratory: 'Oratoire Astral',
  tower: 'La Tour',
  arena: 'Arène',
  expedition: 'Expéditions',
  guild: 'Guilde',
};

function ProgressionPane() {
  const activities = (Object.keys(ACTIVITY_UNLOCKS) as ActivityKey[]).sort(
    (a, b) => ACTIVITY_UNLOCKS[a] - ACTIVITY_UNLOCKS[b],
  );
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="map" size={16} color="var(--color-gold-soft)" /> Arcs & tiers de matériaux
        </h3>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          La carte est découpée en <strong>arcs</strong>. Terminer un arc et vaincre son{' '}
          <strong>boss d'arc</strong> débloque l'arc suivant et son <strong>tier de matériaux</strong>
          {' '}(objets plus puissants).
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {ARCS.map((a) => (
            <span key={a.id} className="chip bg-white/5 text-[var(--color-ink)]/85">
              {a.name} · Tier {a.tier}
              {a.mapIds.length === 0 && (
                <span className="ml-1 text-[var(--color-muted)]">(à venir)</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="xp" size={16} color="var(--color-gold-soft)" /> Déblocage des activités
        </h3>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          Ton <strong>niveau de compte</strong> (10 % de l'XP de tes héros) débloque les activités du
          royaume.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {activities.map((a) => (
            <div
              key={a}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-sm"
            >
              <span className="text-[var(--color-ink)]">{ACTIVITY_LABEL[a] ?? a}</span>
              <span className="chip bg-[var(--color-arcane)]/15 text-[11px] text-[var(--color-arcane)]">
                Niv. {ACTIVITY_UNLOCKS[a]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
