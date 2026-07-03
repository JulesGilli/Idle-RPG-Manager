import { Link } from 'react-router-dom';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { syntyUrl, MAP_ART } from '@/lib/synty';
import { useAccount } from '@/hooks/useAccount';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';

type Building = {
  to: string;
  /** 'glyph' = silhouette teintée (icônes Map) ; 'img' = pleine couleur (icônes objet). */
  iconKind: 'glyph' | 'img';
  iconSrc: string;
  title: string;
  /** Le tenancier — donne vie à la boutique. */
  keeper: string;
  desc: string;
  accent: string;
  activity: ActivityKey;
};

// Le village est un lieu : on flâne sur la place et on entre dans les échoppes.
// Deux quartiers : les artisans (craft) et la place (vie sociale).
const ARTISANS: Building[] = [
  {
    to: '/forge',
    iconKind: 'glyph',
    iconSrc: syntyUrl.map('ShopWeapons01'),
    title: 'Forge',
    keeper: 'Borin, le forgeron',
    desc: 'Fabrique armes et armures, puis renforce-les.',
    accent: '#f0934a',
    activity: 'forge',
  },
  {
    to: '/relics',
    iconKind: 'glyph',
    iconSrc: syntyUrl.map('Magic01'),
    title: 'Autel des Reliques',
    keeper: 'Le gardien voilé',
    desc: 'Façonne des reliques à partir du butin des donjons.',
    accent: '#c084fc',
    activity: 'relic',
  },
  {
    to: '/jewelry',
    iconKind: 'img',
    iconSrc: MAP_ART.treasure,
    title: 'Joaillerie',
    keeper: 'Lys, la joaillière',
    desc: 'Sertit des bijoux à passifs, puis les raffine.',
    accent: '#60a5fa',
    activity: 'jewelry',
  },
  {
    to: '/library',
    iconKind: 'img',
    iconSrc: syntyUrl.resource('ICON_SM_Item_Book_01'),
    title: 'Bibliothèque du Savoir',
    keeper: 'Maître Aldric',
    desc: 'Dépense les points de compétence de tes héros.',
    accent: '#8b7cf6',
    activity: 'library',
  },
];

const PLACE: Building[] = [
  {
    to: '/tavern',
    iconKind: 'glyph',
    iconSrc: syntyUrl.map('Tavern01'),
    title: 'Taverne',
    keeper: 'Marta, la tavernière',
    desc: 'Recrute les aventuriers du jour (renouvelés à minuit).',
    accent: '#e8b64a',
    activity: 'tavern',
  },
  {
    to: '/guild',
    iconKind: 'glyph',
    iconSrc: syntyUrl.map('Flag01'),
    title: 'Hôtel de Guilde',
    keeper: 'Le maître de guilde',
    desc: 'Fonde ou rejoins une guilde, monte-la en niveau et lance des raids.',
    accent: '#f5b544',
    activity: 'guild',
  },
];

export function VillageScreen() {
  return (
    <section className="anim-fade space-y-6">
      {/* Bandeau : la place du village */}
      <div className="panel relative overflow-hidden">
        <SyntyGlyph
          src={syntyUrl.map('Home01')}
          size={180}
          color="var(--color-gold-soft)"
          className="pointer-events-none absolute -right-6 -top-8 opacity-[0.06]"
        />
        <div className="relative p-6">
          <h2 className="heading flex items-center gap-2.5 text-2xl">
            <SyntyGlyph src={syntyUrl.map('Home01')} size={26} color="var(--color-gold-soft)" />
            Village
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
            Flâne sur la place et pousse la porte des échoppes : les artisans équipent et forment
            tes héros, la taverne et l'hôtel de guilde animent la vie du royaume.
          </p>
        </div>
      </div>

      <Quarter title="Le quartier des artisans" buildings={ARTISANS} />
      <Quarter title="La place du village" buildings={PLACE} />
    </section>
  );
}

function Quarter({ title, buildings }: { title: string; buildings: Building[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {buildings.map((b) => (
          <BuildingCard key={b.to} building={b} />
        ))}
      </div>
    </div>
  );
}

function BuildingCard({ building: b }: { building: Building }) {
  const account = useAccount();
  const locked = !account.unlocked(b.activity);
  const reqLevel = ACTIVITY_UNLOCKS[b.activity];

  const inner = (
    <>
      {/* Enseigne : barre d'accent à plat */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: locked ? 'var(--color-edge-strong)' : b.accent }}
      />

      <div className="flex items-start gap-4 p-5 pl-6">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: locked ? 'rgba(255,255,255,0.04)' : `${b.accent}1f` }}
        >
          {b.iconKind === 'glyph' ? (
            <SyntyGlyph src={b.iconSrc} size={38} color={locked ? 'var(--color-muted)' : b.accent} />
          ) : (
            <SyntyImg src={b.iconSrc} size={40} className={locked ? 'opacity-40' : ''} />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="font-display text-base font-bold text-[var(--color-ink)]">{b.title}</h4>
          <p className="text-xs italic text-[var(--color-muted)]">{b.keeper}</p>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{b.desc}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[var(--color-edge)] px-6 py-3 text-sm font-semibold text-[var(--color-muted)]">
        {locked ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <UiIcon name="lock" size={14} color="currentColor" /> Niveau de compte {reqLevel}
            </span>
          </>
        ) : (
          <>
            <span className="transition group-hover:text-[var(--color-ink)]">Entrer</span>
            <span className="transition group-hover:translate-x-0.5">→</span>
          </>
        )}
      </div>
    </>
  );

  if (locked) {
    return (
      <div
        className="panel relative flex cursor-not-allowed flex-col overflow-hidden opacity-70"
        title={`Débloqué au niveau de compte ${reqLevel}`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link to={b.to} className="panel panel-hover group relative flex flex-col overflow-hidden">
      {inner}
    </Link>
  );
}
