# Journal des versions

## 2.9.0

- **Lecteur vidéo** : barre du bas (34 px) avec progression déplaçable, temps écoulé / restant, ±10 s, pause, volume déroulant (molette, clic droit pour couper) et poignée de taille ; réglages de qualité repris au même moment (seek HTTP après relance si `:start-time` n'a pas suffi, position conservée même si VLC ne connaît pas encore la durée). Fenêtres sans coins arrondis Windows 11 (`roundedCorners: false`, sans cadre épais en mode VLC) ; l'image de VLC suit l'opacité du widget.
- **Widget de ping** : FPS (`app/systeme.js`, PresentMon téléchargé depuis les releases GitHub avec vérification de l'empreinte, droits administrateur requis par Windows), CPU (Node), GPU et températures (`app/systeme.ps1` : compteurs « GPU Engine », nvidia-smi, zones thermiques), RAM du jeu et RAM libre ; options dans Paramètres > Widgets (`ping.infos`).
- **Fond** : lignes de balayage et effet VHS retirés ; animation en pixel art (`app/arene.js`, personnages originaux) d'un chevalier contre un magicien, en boucle, seulement quand l'interface est ouverte.
- Tests : `test/systeme.test.js`.

## 2.8.0

- **Lecteur vidéo** : barre de volume dans le widget (0 à 125 %, molette), appliquée par l'interface HTTP de VLC et retenue dans les réglages (`video.volume`, réappliquée à chaque lecture).
- **Qualité** : menu dans le widget (Auto ≤ 1080p, Maximale, 1080p, 720p, 480p, 360p, audio seul) et choix dans l'onglet Vidéo (`video.qualite`). Le format yt-dlp suit la qualité ; la lecture repart au même moment (`:start-time`) pour une vidéo, au direct pour un live. L'image de VLC s'efface pendant que le menu est ouvert. La hauteur réellement lue s'affiche sur le bouton.

## 2.7.0

- **Lecteur vidéo par VLC** (`app/lecteur.js`) : yt-dlp (téléchargé depuis les releases GitHub, empreinte SHA-256 vérifiée, `-U` une fois par jour) trouve les flux (vidéo H.264 ≤ 1080p + audio AAC, ou HLS pour Twitch) ; PichetMeter sert de moteur JavaScript à yt-dlp pour YouTube (`--js-runtimes node:…`, `ELECTRON_RUN_AS_NODE`). VLC installé (registre ou Program Files) les lit sans interface (`-I dummy`) dans une fenêtre noire posée sous la barre du widget (`--drawable-hwnd`), qui suit le widget ; pilotage par l'interface HTTP locale de VLC (pause, ±10 s, son, temps).
- **Twitch** : chaînes en direct, rediffusions et clips (VLC, ou lecteur Twitch / site complet dans le navigateur intégré).
- **Navigateur intégré** : cookie de choix YouTube (`SOCS`) posé d'avance dans la session, la page de consentement européenne renvoyait vers l'accueil ; navigation de la vue journalisée.
- Tests : `test/lecteur.test.js`.

## 2.6.0

- **Lecteur YouTube en widget** (onglet Vidéo, widget `video`) : fenêtre redimensionnable avec une barre de 30 px (lien, retour, accueil, recharger, masquer) et la page YouTube dessous (`WebContentsView`, session `persist:youtube` pour garder la connexion). Liens acceptés : vidéo, youtu.be, shorts, live, playlist, identifiant seul, avec le temps de départ (`t=`). Deux affichages : lecteur seul (`/embed`, avec référent YouTube) ou page YouTube complète. Masquer le lecteur ferme la page (la vidéo s'arrête) ; ouvrir l'interface ne la coupe pas. Récents avec miniatures et titres, taille, opacité, page de placement.

## 2.5.1

- **Mise à jour automatique corrigée** : l'installeur était lancé par PowerShell détaché, sans console ; il s'arrêtait dès le premier affichage et l'application se fermait sans être mise à jour. Il est maintenant lancé par un script `mise-a-jour.cmd` dans sa propre fenêtre (`cmd start`), qui attend la fermeture de PichetMeter, exécute `installer.ps1 -Journal` et reste ouvert avec le message en cas d'échec.
- `installer.ps1 -Journal <fichier>` : transcription complète de l'installation ; le journal est recopié dans `journal.txt` au lancement suivant.
- Depuis la 2.4.0 ou la 2.5.0, cette version s'installe une fois à la main (`Installer.cmd`) ; les suivantes passeront par la mise à jour automatique.

## 2.5.0

- **Macros : nœud « Parallèle »** (une entrée, trois sorties) : les branches reliées tournent en même temps, chacune dans son propre fil ; le nœud se termine quand toutes sont finies. Envois au pilote sérialisés. Testé dans `test/macro_serveur_test.py`.
- **Viseur** : l'aperçu utilise une capture du jeu en fond (`app/img/viseur-fond.jpg`).
- **Ping** : onglet retiré ; mesure, historique et « Afficher en jeu » dans Paramètres > Widgets. Le widget de ping reste disponible.
- **Retirés** : auto-potions (onglet, `macro/potions.py`, commandes du moteur) et loupe (onglet, widget, capture d'écran). Les anciens réglages correspondants sont effacés.
- Widget DPS : largeur adaptée au nombre de colonnes (les pseudos ne sont plus coupés).
- README : nouvelles captures (widgets en jeu, placement, onglets).

## 2.4.0

Première version publiée depuis la 1.8 : elle regroupe les versions 2.0 à 2.3 décrites plus bas.

- **Mises à jour automatiques** (`app/maj.js`) : au lancement (réglable) et sur demande, lecture de la dernière release GitHub ; bandeau « Mettre à jour / Plus tard / Ignorer cette version » ; téléchargement du zip avec contrôle de taille et d'empreinte SHA-256 (fournie par GitHub), décompression puis lancement de `installer.ps1`, qui ferme, met à jour et relance l'application.
- **Installeur** : les mascottes de l'installation actuelle absentes du nouveau paquet sont recopiées dans `%APPDATA%\PichetMeter\mascottes`.
- **Depuis la 1.8** : Pichet Macro intégré (onglet Macros, éditeur de nœuds, widget), interface en tiroir à gauche, écran de placement des widgets, mascottes animées, DPS meter façon course et world boss, onglet Potions (lecture de la barre de vie, F1 à F4), Loupe en jeu, thème Y2K × Cyberpunk, bouton « Actualiser » de la fiche, carte AION2.run en grand. Retirés : Classement, Cooldowns, Tâches.
- `tools/build.py --public` : paquet sans les GIF de mascottes.

## 2.3.1 (version personnelle)

- **Potions** : prototypes ctypes complets pour la capture GDI (`potions.py`) ; les handles 64 bits provoquaient « OverflowError: int too long to convert » au calibrage et à chaque lecture. Le bitmap est désélectionné avant `GetDIBits`. Erreurs de `potions_read` (aperçu) non journalisées ; résultats `{ ok: false }` du pont gérés dans l'onglet.
- **Loupe** : capture par `getUserMedia` (`chromeMediaSource: "desktop"`, source fournie par `zoom_source`) au lieu de `getDisplayMedia`, qui exige un geste de l'utilisateur ; repli sur `getDisplayMedia` au clic, erreur détaillée dans le journal (`zoom_error`).
- **Classement** : onglet, vue et code retirés.
- **Personnage** : l'armurerie officielle renvoie actuellement `equipmentList: null` et `ItemLevel: 0` pour tous les personnages ; message explicite et « — » au lieu de 0.

## 2.3.0 (version personnelle)

- **Thème Y2K × Cyberpunk** (`app/theme-cyber.css`, chargé en dernier) : panneaux noir mat, titres chromés (Orbitron), texte Chakra Petch, lignes de balayage, néons cyan `#00e5ff` / magenta `#ff2bd6` / vert `#39ff88` sur les éléments interactifs ; thème sombre forcé ; widgets, écran de placement et animation de lancement restylés.
- **Personnage** : bouton « Actualiser » (`character(..., force)` ignore le cache de 2 min).
- **Potions** (`app/macro/potions.py`, commandes `potions_config` / `potions_calibrate` / `potions_read`) : lecture de la barre de vie par capture GDI et correspondance de couleur, touches F1–F4 par le driver Interception selon des seuils de PV et des délais par touche ; premier plan uniquement ; F10 désactive.
- **Loupe** (widget `zoom`) : zone choisie à l'écran, flux `getDisplayMedia` (source accordée par `setDisplayMediaRequestHandler` à la seule page `#w=zoom`) recadré dans un canvas ; fenêtre redimensionnable, exclue des captures (`setContentProtection`), capture arrêtée quand le widget est masqué.
- **Carte** : AION2.run uniquement, plus de widget ni de choix de source.
- Retirés : module Tâches, « délai de macro conseillé » (Ping).

## 2.2.1 (version personnelle)

- Widget DPS : mise à jour en place (`dps-course.js`, morph par clé `data-jid`), bannière en position absolue, taille de fenêtre stable (rétrécissement différé de 1,5 s, `placer` ignore les positions identiques) : plus de tremblement.
- Fluidité : effets de dépassement sans `filter`, transitions de largeur des barres, suppression des flous empilés (cartes, coque, nœuds de l'éditeur).
- Widget Timers sans mascotte.

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
