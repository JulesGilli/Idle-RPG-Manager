import { UiIcon } from '@/components/synty/GameIcons';
import { BackToVillage } from '@/components/BackToVillage';
import { OratoryScene } from './OratoryScene';
import { BlessStudio } from './BlessStudio';

/**
 * L'ORATOIRE ASTRAL — la bénédiction a enfin son bâtiment.
 *
 * Elle était reléguée en bas de l'atelier de renforcement de la Forge, alors
 * qu'elle en est l'exact CONTRAIRE : renforcer monte les stats brutes, bénir les
 * gèle à jamais pour amplifier le type de dégâts. Deux voies opposées ne
 * partagent pas un écran — et surtout pas quand l'une est irréversible.
 *
 * Pas d'onglets, pas de maîtrise, pas d'auto : un seul geste, rare et définitif.
 * C'est ce qui distingue ce lieu des trois ateliers.
 */
export function OratoryScreen() {
  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div className="panel relative overflow-hidden p-0">
        <OratoryScene />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-5">
          <h2 className="heading flex items-center gap-2 text-2xl">
            <UiIcon name="blessing" size={24} color="#fb7185" />
            Oratoire Astral
          </h2>
          <p className="max-w-xl text-sm text-white/80">
            Sœur Vesper recueille les larmes tombées du firmament. Une larme sur une lame, et l'arme
            frappe plus fort dans son élément — mais le métal, lui, ne bougera plus jamais.
          </p>
        </div>
      </div>

      <BlessStudio />
    </section>
  );
}
