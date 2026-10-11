# Journal des versions

## 2.2.0 (version personnelle)

- **DPS meter** : animations de course (`dps-course.js`, FLIP), bannière de leader, couronne, défilement des chiffres, palettes Néon et Podium.
- **World boss** (`reseau.js`) : détection par PV ou par nombre d'attaquants (5), coups mis en attente avec « Boss uniquement », combat maintenu 60 s tant que le boss vit, 40 joueurs.
- **Réglages en onglets** (`data-reglages` / `data-sec`) dans Paramètres, DPS meter, Timers, Carte et Macros.
- **Cooldowns** : onglet, widget et suivi des touches retirés.
- **Mascottes** : 6 nouvelles, ajout / retrait manuel, effets (explosion, confettis, étoiles, danse, pirouette, secousse).

## 2.1.0 (version personnelle)

- **Écran de placement des widgets** (`#w=layout`) : page transparente sur tout l'écran avec un aperçu de chaque widget ; déplacement avec magnétisme, taille continue (50 à 250 %, coin), opacité, clic à travers, affichage en jeu et mascotte. Remplace les options de position des onglets.
- **Mascottes animées** (`mascottes.js`) dans les widgets Macros, DPS meter et Timers ; dossier personnel `%APPDATA%\PichetMeter\mascottes`.
- **Widget Macros** réécrit (rendu incrémental, animations d'entrée, flux de touches, fin de macro).
- **Animation de lancement** (`splash.html`) avec étapes de chargement réelles (interface, module Windows, moteur de macros).

## 2.0.0 (version personnelle)

- **Pichet Macro intégré** : onglet **Macros** (liste, éditeur de nœuds façon Blueprint, panneau Détails, enregistrement, lecture, réglages du driver) et widget en jeu des macros en cours. Le moteur de Pichet Macro (`app/macro/`, driver Interception) tourne sans Qt ; PichetMeter le pilote en JSON (`app/macros.js`). Macros et réglages partagés avec Pichet Macro (`~/.pichet_macro`).
- **Tiroir à gauche** : l'interface glisse depuis le bord gauche de l'écran avec Alt + C, en verre dépoli sur le jeu flouté ; largeur réglable au bord droit, bouton « Agrandir ».

## 1.8.0

- **Auto-potions retirées** : l'onglet Potions disparaît, aucun module n'envoie plus de touche ou de clic au jeu.
- **Correction : PichetMeter ne s'ouvrait plus.** L'option « Toujours lancer en administrateur » relançait l'application en boucle quand Windows ne confirmait pas les droits (service « Serveur » désactivé). L'option est retirée et effacée des réglages.
- Droits administrateur détectés par le niveau d'intégrité du processus (`whoami /groups`) au lieu de `net session`. Le bouton « Relancer en administrateur » ne relance qu'une fois.

## 1.7.0

- Le module **Macros** est retiré de la version publique (il ne fonctionnait pas en jeu). L'onglet devient **Potions** et garde les auto-potions.
- La touche d'arrêt d'urgence coupe aussi les auto-potions ; l'interrupteur repasse sur OFF.

## 1.6.0

- **Auto-potions** (onglet Macros) : appui automatique sur F1, F2, F3 (modifiables) quand la vie passe sous des seuils réglables, avec un délai minimum par potion. La vie est lue à l'écran sur la barre choisie (calibrage de sa couleur, vie pleine).
- Macros, sorts, cooldowns : **Ctrl, Alt, Maj seuls**, Tab, Verr. maj, ponctuation et toutes les autres touches sont reconnus.
- Délai par défaut entre deux actions de macro : **5 ms**.
- Macros qui marchent hors du jeu mais pas en jeu : PichetMeter détecte qu'Aion 2 tourne **en administrateur** (Windows bloque alors les appuis simulés) et propose de se relancer en administrateur, avec l'option « Toujours lancer en administrateur ».

## 1.5.0

- Nouveau module **Macros** (clavier et souris), désactivé par défaut avec un avertissement à accepter :
  - modes **Une fois**, **N fois**, **Maintenir** (en boucle tant que la touche est enfoncée) et **On / Off** ;
  - délai en ms entre chaque action, réglable pour toute la macro ou action par action, avec le délai conseillé d'après le ping ;
  - actions : sorts choisis par leur icône, touches (avec Ctrl / Alt / Maj), clics de souris (appui, maintien, enfoncer, relâcher), pauses ;
  - plusieurs macros sur la même touche s'enchaînent dans l'ordre de la liste ;
  - menu **Sorts & touches** pour assigner la touche de chaque sort (import depuis la fiche officielle ou les cooldowns) ;
  - déclenchement par le clavier, le clic molette ou les boutons 4 / 5 de la souris, option pour bloquer la touche ;
  - sécurité : jeu au premier plan uniquement, rien quand l'interface est ouverte, touche d'arrêt d'urgence, bouton « Tester (3 s) ».
- L'onglet « Ping & macros » devient « Ping ».

## 1.4.0

- Nouveau nom : **PichetMeter** (anciennement « Aion 2 Companion HUD »). L'installation reprend automatiquement l'ancienne version : moteur, comptes, réglages et historique.
- Onglet **Infos** : créateur, Discord, mentions légales et licences. Logo discret dans le menu.
- **Icônes de classe officielles** dans l'armurerie, le classement et le DPS meter ; couleurs des barres accordées aux classes.
- DPS meter : bouton **Inspecter** (loupe) à côté de chaque joueur, dans l'onglet et dans le widget, qui ouvre sa fiche.
- **Animations** d'ouverture et de fermeture de l'interface, transitions entre les onglets, micro-animations (désactivables).
- Option **« Seulement quand le jeu est au premier plan »** pour les widgets.
- Widget ping allégé (sans la ligne macro).
- Installeur : entrée dans « Applications installées », installation possible depuis le code source du dépôt, désinstallation plus robuste.

## 1.3.0

- Interrupteur **Afficher en jeu** (ON / OFF) en tête de chaque module, et liste « Modules en jeu » dans les paramètres.
- DPS meter : option **Boss uniquement** et comportement **hors combat** (visible, transparent ou masqué).
- Timers : horaires des serveurs Europe revus, affichés en heure locale, état « En cours », bouton **Recaler**, jours et heures multiples.
- Cooldowns : détection des touches refaite (crochet clavier et lecture directe), carte **Test de détection**.

## 1.2.0

- Interface « verre » bleue centrée sur le jeu flouté, en français ou en anglais.
- DPS meter de groupe façon compteur de dégâts : icône de classe, cible et PV, remise à zéro depuis le widget.

## 1.0 – 1.1

- Premières versions : armurerie, classement, tâches, timers, DPS meter réseau (Npcap), widgets épinglés, viseur, carte, ping, cooldowns.
