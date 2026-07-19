# Idle RPG Manager — Companion (extension Chrome)

Popup qui montre en un clic où en sont tes activités, sans ouvrir le jeu :

- **Farm** : combats accumulés par groupe déployé, barre vers le cap (400 ≈ 2 h 13), alerte « viens récolter » ;
- **Expéditions** : temps restant, « terminée » quand les récompenses attendent ;
- **Donjons** : prêts ou en repos (cooldown par tier).

## Installation (5 secondes)

1. Ouvre `chrome://extensions`
2. Active le **Mode développeur** (interrupteur en haut à droite)
3. **Charger l'extension non empaquetée** → choisis ce dossier `extension/`
4. Épingle l'icône, clique, connecte-toi avec ton compte du jeu. C'est tout.

## Principes

- **Zéro dépendance, zéro build** : fetch pur vers l'API REST de Supabase, le
  dossier se charge tel quel dans Chrome.
- **Zéro polling** : une seule salve de requêtes (~2 Ko) à l'ouverture de la
  popup ; ensuite tout est recalculé en local chaque seconde (farm = 1 combat
  / 20 s, expéditions et cooldowns = comptes à rebours). Egress négligeable.
- **Sécurité** : la clé embarquée est la clé `anon` publique (la même que le
  site) ; chaque joueur ne voit que SES données via la RLS. La session est
  stockée dans `chrome.storage.local` et rafraîchie automatiquement.

## Dev

Ouvrir `popup.html` dans un simple onglet marche aussi (la session passe alors
par `localStorage`) — pratique pour styler sans recharger l'extension.

⚠️ Constantes de jeu dupliquées dans `config.js` (cap de farm, cooldowns de
donjon…) : si elles bougent dans `shared/progression/`, les répercuter ici.
