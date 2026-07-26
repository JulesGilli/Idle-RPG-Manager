import { describe, expect, it } from 'vitest';
import { KEYWORDS } from '@shared/progression/keywords';
import { KEYWORD_GLYPH } from '@/lib/synty';

/**
 * Le lexique vit dans `/shared` et ses icônes dans le front (`KEYWORD_GLYPH`) :
 * rien au compilateur ne relie les deux. Ajouter un mot-clé sans lui donner de
 * silhouette le ferait s'afficher avec l'icône de repli, en silence.
 */
describe('icônes du lexique des effets', () => {
  it('chaque mot-clé a sa silhouette Synty', () => {
    const missing = KEYWORDS.filter((k) => !KEYWORD_GLYPH[k.id]).map((k) => k.id);
    expect(missing, `mots-clés sans icône : ${missing.join(', ')}`).toEqual([]);
  });

  it('aucune icône orpheline (mot-clé supprimé)', () => {
    const ids = new Set(KEYWORDS.map((k) => k.id));
    const orphans = Object.keys(KEYWORD_GLYPH).filter((id) => !ids.has(id));
    expect(orphans, `icônes sans mot-clé : ${orphans.join(', ')}`).toEqual([]);
  });

  it('plus aucun emoji dans les libellés du lexique', () => {
    // Le champ `icon` (emoji) a été retiré du lexique partagé ; on verrouille
    // aussi les libellés, pour qu'aucun emoji ne revienne par la petite porte.
    // ️ (sélecteur de variante) exclu de la classe : combiné aux plages
    // ci-dessus, ESLint le signale comme caractère trompeur — et il ne peut de
    // toute façon jamais apparaître seul.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    const withEmoji = KEYWORDS.filter((k) => emoji.test(k.label)).map((k) => k.id);
    expect(withEmoji, `mots-clés encore en emoji : ${withEmoji.join(', ')}`).toEqual([]);
  });
});
