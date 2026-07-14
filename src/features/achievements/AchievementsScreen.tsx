import { AchievementsPanel } from './AchievementsPanel';
import { BackToVillage } from '@/components/BackToVillage';

export function AchievementsScreen() {
  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />
      <AchievementsPanel />
    </section>
  );
}
