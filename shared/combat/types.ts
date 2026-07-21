/**
 * Types du simulateur de combat. Framework-free, partagé front + Edge Function.
 */

export type CombatRole = 'tank' | 'dps' | 'healer' | 'enemy';

export type Side = 'ally' | 'enemy';

/* ---------------------------------------------------------- TYPES DE DÉGÂTS -- */

/** Type de base d'une attaque : physique ou magique. */
export type DamageBase = 'physical' | 'magical';
/** École (sous-type) d'une attaque, empilée sur la base. Extensible. */
export type DamageSchool = 'fire' | 'poison' | 'arcane';
/** N'importe quel « tag » de dégâts amplifiable (base OU école). */
export type DamageTag = DamageBase | DamageSchool;
/** Type complet d'une source de dégâts : une base, éventuellement une école. */
export type DamageType = { base?: DamageBase; school?: DamageSchool };

/** Passifs procurés par les bijoux (gemmes). Valeur = fraction (0.12 = 12 %). */
export type PassiveType =
  | 'regen' // récupère X% des PV max à chaque tour
  | 'shield' // réduit les dégâts subis de X%
  | 'crit' // X% de chance d'infliger un coup critique (dégâts ×2)
  | 'venom' // +X% de dégâts contre les ennemis déjà blessés
  | 'rage' // +X% de dégâts sous 50 % de PV
  | 'thorns' // renvoie X% des dégâts subis
  | 'lifesteal' // soigne X% des dégâts infligés
  | 'first_strike' // +X% de dégâts au premier tour
  | 'dodge' // X% de chance d'esquiver une attaque
  | 'execute'; // +X% de dégâts contre les cibles sous 30 % de PV

export type CombatPassive = { type: PassiveType; value: number };

/* ------------------------------------------------------------- ABILITÉS -- */

/** Statuts appliqués en combat (par les abilités). */
export type StatusType =
  | 'poison' // DoT (dégâts par tour)
  | 'burn' // DoT de feu (se propage via l'AOE mage)
  | 'stun' // saute son tour
  | 'weaken' // ATK & DEF réduites
  | 'taunt'; // provocation : les ennemis sont forcés de cibler le porteur

/** Action lancée par une abilité active (autocast). */
/** Compteur cumulable posé sur une cible (feu empilable, marque arcanique). */
export type MarkType = 'burn' | 'arcane';

/**
 * Spéciale d'un héros-squelette (ultime Nécromancien, branche Légion), débloquée
 * au rang 2 de l'ultime :
 *  - `taunt_all` : provoque tous les ennemis (guerrier),
 *  - `aoe_all`   : frappe tous les ennemis (archer),
 *  - `resummon`  : rejoue l'invocation de masse (passif 1) de son invocateur (mage).
 */
export type SummonSpecial = 'taunt_all' | 'aoe_all' | 'resummon';

/**
 * Gabarit d'une créature invoquée. Stats = fractions des stats du LANCEUR (résolues
 * au rang au moment de la compilation de la compétence). Sert au passif d'armée
 * (pool aléatoire) comme à l'ultime (héros-squelette) et au rituel (colosse).
 */
export type SummonTemplate = {
  name: string;
  hpMult: number;
  atkMult: number;
  defMult?: number;
  basicType?: DamageBase;
  /** Spéciale éventuelle (héros-squelette). */
  special?: SummonSpecial;
};

export type AutocastAction =
  | {
      type: 'aoe';
      /** Dégâts = ATK × dmgMult sur chaque ennemi. */
      dmgMult: number;
      /** Statut optionnel appliqué aux cibles touchées. */
      status?: StatusType;
      statusChance?: number;
      statusPotency?: number;
      statusDuration?: number;
      /** Propage le burn aux autres ennemis déjà en feu (mage de feu). */
      spread?: boolean;
      /** Pose aussi une (ou plusieurs) stack(s) de marque sur chaque cible touchée. */
      mark?: MarkType;
      /** Nombre de stacks posées par `mark` (défaut 1). */
      markStacks?: number;
    }
  | {
      type: 'stun_all';
      duration: number;
      /** Dégâts optionnels infligés en même temps (frappe divine). */
      dmgMult?: number;
    }
  | {
      // Étourdit les `count` ennemis VIVANTS ayant le moins de PV, `duration` tours.
      // (Boss « geôlier » : neutralise les plus fragiles sans tuer tout le monde.)
      type: 'stun_lowest';
      count: number;
      duration: number;
      /** Dégâts optionnels infligés à chaque cible étourdie. */
      dmgMult?: number;
    }
  | {
      // Frappe unique et brutale sur la cible focus (plus bas PV).
      type: 'nuke';
      dmgMult: number;
      status?: StatusType;
      statusPotency?: number;
      statusDuration?: number;
      /**
       * Probabilité d'appliquer `status` (0..1). ABSENT = garanti — c'était le
       * comportement historique de tous les nukes, on ne le change pas.
       */
      statusChance?: number;
      /**
       * Perce-armure appliqué UNIQUEMENT à cette frappe (0..1), en plus du
       * perce-armure permanent du lanceur. Sert aux coups qui ignorent l'armure
       * le temps d'une incantation (Guerrier — Frappe brutale).
       */
      armorPen?: number;
      /** Pose une (ou plusieurs) stack(s) de marque sur la cible. */
      mark?: MarkType;
      /** Nombre de stacks posées par `mark` (défaut 1). */
      markStacks?: number;
    }
  | {
      // Dégâts = min(PV max de la cible × pct, ATK × capMult). Anti one-shot des boss.
      type: 'pct_hp';
      pct: number;
      capMult: number;
    }
  | {
      // Frappe TOUS les ennemis `hits` fois d'affilée (dégâts réduits par coup).
      type: 'multi_hit';
      hits: number;
      dmgMult: number;
    }
  | {
      // Fait exploser les stacks de marque sur tous les ennemis (dégâts + reset).
      type: 'detonate_all';
      mark: MarkType;
      dmgMult: number;
    }
  | {
      // Soin de zone sur les alliés (soigneur).
      type: 'heal_all';
      pct: number;
    }
  | {
      // Applique un buff temporaire (soi ou toute l'équipe) pendant `duration` tours.
      type: 'buff';
      scope: 'self' | 'team';
      duration: number;
      atk?: number; // +fraction ATK
      def?: number; // +fraction DEF
      speed?: number; // +fraction vitesse
      dmg?: number; // +fraction de dégâts infligés
      reduce?: number; // fraction de dégâts subis en moins
      thornsMult?: number; // multiplicateur des épines (0.0 = inchangé, 1.0 = ×2)
      reflect?: number; // renvoi plat des dégâts subis (1.0 = 100 %)
    }
  | {
      // Toute l'équipe (même les alliés à terre) rejoue une attaque.
      type: 'extra_turn';
    }
  | {
      // Frappe la cible focus ; mort instantanée sous un seuil de PV.
      type: 'execute_strike';
      dmgMult: number;
      instakillPct: number;
    }
  | {
      // Purge la cible focus : retire jusqu'à `count` bienfaits (buffs) + dégâts.
      // Les dégâts montent avec le nombre de bienfaits retirés (perPurgedDmg).
      type: 'purge';
      count: number;
      dmgMult?: number;
      perPurgedDmg?: number;
    }
  | {
      // Assaut d'os (actif Légion) : le lanceur frappe avec `dmgMult` de bonus, puis
      // CHACUNE de ses invocations vivantes rejoue une attaque de base ce tour-ci.
      // Prolonge TOUS les statuts actifs des ennemis (brûlure, poison, affaiblis-
      // sement…) de `turns` tours, SANS rien consommer. Les stacks d'embrasement
      // sont donc conservés, contrairement à `detonate_all`.
      type: 'extend_statuses';
      turns: number;
      /**
       * Intensification des DoT (fraction) appliquée EN PLUS de la prolongation.
       * Bornée : un même statut n'est intensifié qu'UNE fois, sinon des lancers
       * répétés multiplieraient les dégâts en boucle (×2 toutes les ~5 manches).
       */
      dotAmp?: number;
    }
  | {
      type: 'summon_assault';
      dmgMult: number;
      /**
       * Fraction de la mitigation IGNORÉE par le coup du lanceur (0..1). Non
       * plafonnée par `ARMOR_PEN_CAP` : c'est un perce-armure ponctuel d'actif,
       * pas un passif cumulable — même traitement que `nuke.armorPen`.
       */
      armorPen?: number;
      /**
       * Part des dégâts de l'assaut reversée en SOIN aux invocations (0..1),
       * répartie entre celles encore en vie. Seule dérogation à la règle « une
       * invocation ne se soigne pas » — elle ne vaut que pour cet actif.
       */
      summonHealFrac?: number;
    }
  | {
      // Invocation en PLEIN COMBAT (ultime Légion) : une seule fois, fait apparaître
      // un héros-squelette tiré au hasard dans `templates`. `withSpecials` (rang 2)
      // attache la spéciale du gabarit.
      type: 'summon_hero';
      withSpecials: boolean;
      templates: SummonTemplate[];
    }
  | {
      // Charnier (actif Colosse) : la créature mortuaire du lanceur refrappe en
      // AOE à `dmgMult` × SON PROPRE ATK. Aucun cadavre requis.
      type: 'creature_aoe';
      dmgMult: number;
      creatureName: string;
    }
  | {
      // Communion (ultime Colosse) : le lanceur se sacrifie et transfère ses stats
      // à sa créature mortuaire, à hauteur de `pctPerStack` × ossements récoltés.
      // Le transfert n'est donc plus un forfait : il paie le travail de récolte,
      // et un Colosse qui a nourri son tas d'os frappe bien plus fort qu'un autre.
      type: 'sacrifice_transfer';
      pctPerStack: number;
      creatureName: string;
      /** Manches à attendre APRÈS l'invocation de la créature avant de pouvoir agir. */
      delayRounds?: number;
    }
  | {
      // Spéciale du mage-squelette (ultime Légion) : rejoue une fois le pool
      // d'invocation du nécro d'origine.
      type: 'resummon';
    };

/**
 * Abilité portée par un combattant (dérivée des compétences de classe ou de la
 * config ennemie). Union discriminée par `kind` — data-driven, pur.
 */
export type Ability =
  | { kind: 'armor_pen'; value: number } // ignore `value` (fraction) de la DEF
  | {
      kind: 'on_hit';
      status: StatusType;
      chance: number;
      /** Sens selon le statut : DoT = fraction de l'ATK/tour ; weaken = fraction de réduction. */
      potency: number;
      duration: number;
    }
  | { kind: 'multi_shot'; chance: number; extraTargets: number }
  | { kind: 'extra_attack'; chance: number } // chance de rejouer une attaque de base dans le même tour
  | { kind: 'amp_vs_status'; status: StatusType; bonus: number } // +bonus fraction de dégâts
  | { kind: 'autocast'; everyRounds: number; action: AutocastAction }
  | { kind: 'revive'; hpPct: number } // ressuscite une fois par combat
  | { kind: 'contagion'; chance: number } // tes DoT se propagent à un autre ennemi
  | { kind: 'taunt'; everyRounds: number; duration: number } // provoque : force les ennemis à te cibler
  | {
      // Bonus de stat permanent appliqué au setup. scope 'team' = tous les alliés
      // (aura), 'self' = le porteur seul. value = fraction (0.1 = +10 %).
      kind: 'stat_mod';
      scope: 'self' | 'team';
      stat: 'atk' | 'def' | 'hp';
      value: number;
    }
  | { kind: 'stack_on_hit'; mark: MarkType; chance: number; max: number } // pose une stack à l'attaque
  | { kind: 'amp_per_stack'; mark: MarkType; bonus: number } // +bonus dégâts par stack sur la cible
  /**
   * Multiplie le PLAFOND de marques que le porteur peut empiler sur ses cibles
   * (set Venin Profond, arc 2 : ×2 → une marque plafonnée à 5 monte à 10).
   *
   * C'est un MODIFICATEUR : il ne pose aucune marque lui-même, il élargit le
   * plafond de celles que le porteur pose déjà via `stack_on_hit`. Sans source de
   * marques, il ne fait donc rien — c'est voulu, il récompense une build qui
   * empile déjà.
   */
  | { kind: 'stack_cap_mult'; mult: number }
  /**
   * Sacrifie une fraction de la DEF pour la reverser en ATK (set Rempart, arc 2 :
   * −50 % d'armure, le montant retiré part dans l'attaque).
   *
   * Conversion STATIQUE, appliquée à la construction du combattant : elle porte
   * donc sur la DEF TOTALE (équipement et bonus de set inclus), pas sur la DEF de
   * base. C'est la lecture naturelle — « ton armure devient ton arme » — et la
   * seule qui reste lisible : convertir la base seule donnerait un gain
   * dérisoire en fin de partie, quand l'équipement porte l'essentiel des stats.
   */
  | { kind: 'def_to_atk'; ratio: number }
  /**
   * PACTE DE SANG (set arc 2). Deux mécaniques liées :
   *  • `ampPerMissing` : les dégâts montent avec les PV MANQUANTS (1 = +1 % de
   *    dégâts par % de PV perdu, donc ×1.5 à mi-vie) ;
   *  • `selfRatio` : le porteur s'inflige cette fraction des dégâts qu'il inflige.
   *
   * Les deux se renforcent : plus il saigne, plus il frappe, plus il saigne. Les
   * auto-dégâts ne peuvent PAS tuer leur porteur (bornés à 1 PV) — sinon une
   * build offensive se suiciderait sur son propre premier coup, ce qui n'est pas
   * un risque mais un piège.
   */
  | { kind: 'blood_pact'; ampPerMissing: number; selfRatio: number }
  /**
   * CRI DE RALLIEMENT (set arc 2) : frappe bien plus fort, mais une part des
   * coups part dans le tas — `friendlyFire` est la chance que l'attaque de base
   * touche un ALLIÉ au hasard à la place de l'ennemi visé.
   *
   * Seule abilité du moteur qui retourne une attaque contre son propre camp.
   * Ne concerne QUE l'attaque de base : les compétences visent juste, sinon un
   * ultime perdu au hasard rendrait l'effet insupportable plutôt que risqué.
   */
  | { kind: 'reckless'; atkBonus: number; friendlyFire: number }
  /**
   * SENTINELLE (set arc 2) : encaisse, puis rend. Périodiquement, renvoie à un
   * ennemi une fraction (`ratio`) de TOUT ce que le porteur a subi sur les
   * `windowRounds` dernières manches.
   *
   *  • `windowRounds` : profondeur de la mémoire de dégâts ;
   *  • `everyRounds`  : cooldown, en manches, entre deux ripostes ;
   *  • `ratio`        : part des dégâts mémorisés effectivement renvoyée.
   *
   * Récompense le fait d'ENCAISSER : un porteur épargné ne renvoie rien. Les
   * dégâts renvoyés sont bruts (ni crit, ni mitigation) — c'est un retour de
   * bâton, pas une attaque.
   */
  | { kind: 'vengeance'; windowRounds: number; everyRounds: number; ratio: number }
  /**
   * SERMENT (set arc 2) : chaque ennemi frappé par le porteur est LIÉ. Dès lors,
   * tout dégât subi par un lié se répercute sur les autres liés, à hauteur de
   * `ratio`.
   *
   * ⚠️ La répercussion ne se re-propage JAMAIS : sans ce garde-fou, A blesse B
   * qui re-blesse A, à l'infini. Les dégâts de lien sont donc marqués et exclus
   * d'une seconde propagation — c'est la seule chose qui rend l'effet fini.
   */
  | { kind: 'oath_link'; ratio: number }
  /**
   * CHARNIER (set arc 2) : élargit de `count` le pool d'invocation du porteur.
   *
   * MODIFICATEUR : il n'invoque rien lui-même, il augmente le `count` des
   * `summon_pool` que le porteur possède déjà. Sans invocation, il ne fait rien —
   * c'est un set de nécromancien, pas un bonus universel.
   */
  | { kind: 'summon_extra'; count: number }
  /**
   * RITUEL D'OS (set arc 2) : les INVOCATIONS du porteur appliquent un statut à
   * l'attaque. L'abilité vit sur l'invocateur mais s'applique à ses créatures —
   * elle leur est injectée à la création.
   */
  | { kind: 'summon_on_hit'; status: StatusType; chance: number; potency: number; duration: number }
  | { kind: 'detonate'; mark: MarkType; threshold: number; dmgMult: number } // explose au seuil de stacks
  | { kind: 'immune'; chance: number; statuses?: StatusType[] } // chance d'ignorer un statut négatif subi
  | { kind: 'heal_aura'; pct: number } // soigne l'allié le plus bas de pct des PV max / tour
  | { kind: 'heal_amp'; bonus: number } // +bonus sur les soins émis
  | { kind: 'ally_shield'; chance: number; pct: number } // chance de poser une barrière sur l'allié le plus bas
  | { kind: 'barrier'; pct: number } // barrière absorbante regénérée chaque tour (pct des PV max)
  | { kind: 'delayed_buff'; afterRounds: number; dmg: number } // après N tours, +dégâts à toute l'équipe (jusqu'à la fin)
  | { kind: 'threat'; value: number } // génère de l'agressivité : plus de chances d'être ciblé
  | { kind: 'dot_amp'; status: StatusType; bonus: number } // +bonus aux dégâts sur la durée du statut
  | { kind: 'heal_buff'; atk: number; duration: number } // soigner un allié bas en PV lui donne de l'ATK
  | { kind: 'riposte_shield'; bonus: number } // renvoie une attaque quand ta barrière est brisée
  | { kind: 'riposte_dodge'; bonus: number } // contre-attaque quand tu esquives (bonus = fraction d'une frappe normale)
  | { kind: 'bonus_strike'; mult: number } // chaque attaque enchaîne une frappe supplémentaire, à `mult` des dégâts
  | { kind: 'on_first_hit'; status: StatusType; potency: number; duration: number } // 1er coup du combat : statut garanti
  | { kind: 'dmg_type_amp'; damageType: DamageTag; value: number } // +value fraction de dégâts d'un type (base ou école)
  /**
   * Set Âme Offerte : une part des soins émis frappe un ennemi au hasard.
   *
   * `ratio` = part convertie en DÉGÂTS. `healRatio` = part réellement rendue à
   * l'allié ; par défaut `1 − ratio` (les deux parts se partagent le soin, sans
   * perte). Les fournir séparément permet un réglage NON complémentaire —
   * 70 % de soin + 20 % de dégâts, le reste étant perdu.
   */
  | { kind: 'heal_convert'; ratio: number; healRatio?: number }
  | { kind: 'hp_strike'; value: number } // +value fraction des PV max en dégâts bonus à chaque attaque (set Lourd)
  | { kind: 'double_strike'; mult: number } // 2e attaque chaque tour ; chaque frappe à `mult` des dégâts (set Moyen)
  | { kind: 'cdr'; value: number } // −value tour(s) de cooldown sur tous les actifs (set Léger)
  | { kind: 'team_hot'; chance: number; pct: number; duration: number } // chance de poser un soin sur la durée à l'équipe
  | { kind: 'rally_death'; value: number } // à chaque mort (les 2 camps), +value fraction ATK & DEF, cumulatif (Paladin)
  | {
      // Invocation (Nécromancien) : au SETUP du combat, ajoute `count` créatures du
      // côté du lanceur. Leurs stats dérivent du lanceur (fractions). Elles combattent
      // comme des alliés normaux, peuvent mourir, et ne rapportent ni XP ni butin.
      kind: 'summon';
      count: number;
      hpMult: number;
      atkMult: number;
      defMult: number;
      summonName: string;
      /** Si défini, chaque créature explose à sa mort : dégâts de zone = dmgMult × ATK de la créature. */
      explodeDmgMult?: number;
    }
  | { kind: 'atk_ramp'; perTurn: number } // dégâts ×(1+perTurn)^(tour−1) : enrage propre (boss d'event), remplace le boost monstre standard
  | { kind: 'purge'; chance: number } // à l'attaque, chance de dissiper un bienfait (buff temporaire) de la cible (Inquisiteur, Voleur)
  | {
      // À la mort, explose en dégâts de zone aux ennemis. Montant = `hpFrac` × PV MAX
      // de l'exploseur si fourni (Ossuaire), sinon `dmgMult` × ATK (héritage).
      kind: 'explode_on_death';
      dmgMult?: number;
      hpFrac?: number;
    }
  | {
      // Invocation ALÉATOIRE (passif Légion, Nécromancien) : au setup, fait apparaître
      // `count` créatures tirées dans `templates`. `distinct` (rang max) = une de chaque
      // gabarit garantie (pas de doublon). Stats dérivées du lanceur.
      kind: 'summon_pool';
      count: number;
      distinct: boolean;
      templates: SummonTemplate[];
    }
  | {
      // Modificateur d'invocation (Nécromancien) : buffe une stat de TOUTES les
      // invocations du lanceur (ATK pour la Légion, PV pour le Colosse). value = fraction.
      kind: 'summon_buff';
      stat: 'atk' | 'hp';
      value: number;
    }
  | {
      // Ossuaire (passif Légion) : les invocations du lanceur explosent à leur mort
      // pour `hpFrac` de leur PV max. Consommé au spawn (attache explode_on_death).
      kind: 'summon_explode';
      hpFrac: number;
    }
  | {
      // Moelle (passif Colosse) : à l'attaque, `chance` de convertir le coup en une
      // STACK D'OS (cumulable) au lieu des dégâts. Alimente le rituel.
      kind: 'bone_stack';
      chance: number;
    }
  | {
      // Rituel (passif Colosse) : au `threshold`-ième stack d'os, invoque UNE fois la
      // créature mortuaire (stats = fractions du lanceur).
      kind: 'bone_ritual';
      threshold: number;
      hpMult: number;
      atkMult: number;
      name: string;
    }
  | { kind: 'drain_aura'; pct: number } // une part des dégâts infligés soigne l'allié le plus blessé (Hémomancie)
  | { kind: 'amp_vs_buff'; bonus: number } // +dégâts contre une cible qui porte au moins un bienfait (Inquisiteur — Jugement)
  // À chaque bienfait DISSIPÉ par ce combattant, gagne +dégâts pour le reste du
  // combat. Cumulable sans plafond (Inquisiteur — Sceau d'affaiblissement).
  | { kind: 'purge_stack'; value: number };

/** Combattant tel que fourni en entrée (stats déjà "effectives"). */
export type CombatantInput = {
  id: string;
  name: string;
  role: CombatRole;
  /** PV max. Sert aussi de PV de départ, sauf si `startHp` est fourni. */
  hp: number;
  /**
   * PV de départ, si différent de `hp` (PV max). Défaut = `hp` (combattant plein).
   * Utilisé par les donjons pour enchaîner des combats sans reset des PV.
   */
  startHp?: number;
  atk: number;
  def: number;
  speed: number;
  /**
   * Type de base de l'attaque de base (physique/magique). Défaut : 'physical'.
   * Fixé selon la classe du héros ; sert de base aux amplificateurs de type.
   */
  basicType?: DamageBase;
  /**
   * Amplificateurs de dégâts par type (fraction). Ex. { fire: 0.3, physical: 0.1 }.
   * S'additionnent aux abilités `dmg_type_amp`. Quand le combattant inflige des
   * dégâts de type {base, école}, on multiplie par (1 + amp[base] + amp[école]).
   */
  dmgAmp?: Partial<Record<DamageTag, number>>;
  /** Réduction plate de dégâts (armure), distincte de la DEF ; ciblée par armor_pen. */
  armor?: number;
  /**
   * Bonus (fraction) au MULTIPLICATEUR de coup critique. Un crit inflige
   * `×(2 + critDmg)` de dégâts (défaut 0 → ×2, comportement historique). Alimenté
   * par l'arbre de guilde (« dégâts critiques »).
   */
  critDmg?: number;
  /**
   * Multiplicateur appliqué à tout ce que CE combattant restaure en PV (soins
   * actifs, soin auto du rôle healer, vol de vie, drain, régénération).
   * Équilibrage par classe — cf. `CLASS_HEAL_MULT`.
   *
   * **Défaut 1 = aucun changement.** Un constructeur qui l'oublie produit donc
   * le comportement historique, jamais une valeur fausse.
   */
  healMult?: number;
  /** Passifs (bijoux) — optionnels. */
  passives?: CombatPassive[];
  /** Abilités actives/procs (compétences de classe ou ennemi) — optionnelles. */
  abilities?: Ability[];
};

export type CombatInput = {
  allies: CombatantInput[];
  enemies: CombatantInput[];
  seed: number;
  /** Sécurité anti-combat infini. Défaut : 100. */
  maxRounds?: number;
};

export type CombatEvent =
  | {
      type: 'attack';
      round: number;
      actorId: string;
      targetId: string;
      /**
       * Auteur réel des dégâts pour l'attribution (récap). Pour une attaque
       * classique, c'est `actorId`. Pour un tic de DoT (poison/feu), `actorId`
       * vaut la victime elle-même ; `sourceId` désigne alors le lanceur du statut.
       */
      sourceId?: string;
      /** Renseigné pour les tics de DoT (poison/feu) : type de statut à l'origine. */
      status?: StatusType;
      damage: number;
      /**
       * Dégâts ENCAISSÉS sans perdre de PV : armure/DEF, Égide, réductions
       * temporaires et barrière cumulées. Sert à voir ce qu'un tank absorbe
       * réellement — sans ça, un tank parfait paraît ne rien faire.
       */
      absorbed?: number;
      targetHpAfter: number;
      /** Barrière RESTANTE de la cible après ce coup (si elle en avait une). */
      barrier?: number;
      message: string;
    }
  | {
      type: 'heal';
      round: number;
      actorId: string;
      targetId: string;
      amount: number;
      targetHpAfter: number;
      message: string;
    }
  | {
      type: 'death';
      round: number;
      combatantId: string;
      message: string;
    }
  | {
      // Événement informatif (statut appliqué, étourdissement, cast d'ultime,
      // armure brisée…). Ne modifie pas de PV — les dégâts/soins passent par
      // 'attack'/'heal' pour que l'UI reconstruise les barres de vie.
      type: 'status';
      round: number;
      combatantId: string;
      status?: StatusType;
      /** Valeur de barrière posée/regénérée sur ce combattant (pour l'affichage). */
      barrier?: number;
      /**
       * Progression du rituel d'os : ossements récoltés / seuil requis. Permet
       * d'afficher le TAS D'OS qui se construit avant que la créature mortuaire
       * n'apparaisse — sans ça, l'interface n'a aucun moyen de connaître le seuil.
       */
      bones?: number;
      bonesNeeded?: number;
      message: string;
    }
  | {
      type: 'end';
      round: number;
      result: CombatResultKind;
      message: string;
    };

export type CombatResultKind = 'win' | 'loss';

/** État final d'un combattant (pour l'UI / le calcul de survie). */
export type CombatantFinalState = {
  id: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  alive: boolean;
  /**
   * Manche d'ARRIVÉE pour les combattants apparus en cours de combat (créature
   * mortuaire, avatar d'os…). Absent = présent dès le départ.
   *
   * Indispensable au rejeu : `finalState` liste TOUS les combattants du combat, y
   * compris ceux nés à la manche 40. Sans cette info, l'interface les affichait
   * dès la manche 1, immobiles — on croyait à une créature inactive alors qu'elle
   * n'existait tout simplement pas encore.
   */
  spawnRound?: number;
};

export type CombatResult = {
  result: CombatResultKind;
  seed: number;
  rounds: number;
  events: CombatEvent[];
  finalState: CombatantFinalState[];
};
