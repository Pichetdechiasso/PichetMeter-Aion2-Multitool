"use strict";
/* PichetMeter — traduction anglaise de l'interface.
 * L'interface est écrite en français ; en anglais, chaque texte affiché (y compris le contenu
 * généré ensuite) est traduit à la volée : correspondance exacte, puis motifs, puis expressions. */
(function () {
  const EN = {
    // Navigation et barre du haut
    "Personnage": "Character", "Classement": "Leaderboard", "Tâches": "Tasks", "Timers": "Timers", "DPS meter": "DPS meter", "Cooldowns": "Cooldowns",
    "Viseur": "Crosshair", "Carte": "Map", "Ping & macros": "Ping & macros", "Paramètres": "Settings",
    "Masquer l'overlay": "Hide the overlay", "Échap": "Esc", "ou": "or", "Afficher / masquer": "Show / hide", "Jeu fermé": "Game closed", "Jeu détecté": "Game detected",
    "Données d'exemple": "Sample data", "Latence mesurée": "Measured latency", "Mode sombre / clair": "Dark / light mode", "Basculer mode sombre / clair": "Toggle dark / light mode",
    "Toujours au premier plan": "Always on top", "Masquer (Échap) — les widgets épinglés restent à l'écran": "Hide (Esc) — pinned widgets stay on screen", "Quitter": "Quit",
    "Ajouter un compte": "Add an account", "Gérer": "Manage", "Langue": "Language", "Langue / Language": "Language / Langue",
    // Accueil
    "Bienvenue, Daeva": "Welcome, Daeva", "Quel personnage joues-tu ?": "Which character do you play?", "Région": "Region", "Serveur": "Server",
    "Nom du personnage": "Character name", "Ton pseudo en jeu": "Your in-game name", "Enregistrer et continuer": "Save and continue", "Annuler": "Cancel",
    "Le personnage est retrouvé via l'armurerie officielle Aion 2. Tu peux enregistrer plusieurs comptes et passer de l'un à l'autre depuis la barre du haut.":
      "Your character is found through the official Aion 2 armory. You can save several accounts and switch between them from the top bar.",
    "Europe": "Europe", "Amérique du Nord Est": "North America East", "Amérique du Nord Ouest": "North America West", "Amérique du Sud": "South America", "Asie": "Asia",
    "Reprendre un compte": "Use a saved account", "Saisis un pseudo.": "Enter a name.", "Comptes enregistrés": "Saved accounts", "Aucun compte enregistré": "No saved account",
    "Retirer ce compte": "Remove this account", "C'est ton personnage actif.": "This is your active character.", "Tous les comptes": "All accounts",
    // Personnage
    "Rechercher un joueur": "Search for a player", "Pseudo du joueur": "Player name", "Rechercher": "Search", "Favoris": "Favourites", "Récents": "Recent",
    "Voir mon personnage": "View my character", "Ajouter aux favoris": "Add to favourites", "Retirer des favoris": "Remove from favourites",
    "Puissance de combat": "Combat power", "Niveau d'objet": "Item level", "Équipement": "Equipment", "Compétences": "Skills", "Daevanion": "Daevanion",
    "Survole une pièce pour le détail": "Hover a piece for details", "Arcanas": "Arcanas", "Ailes & familier": "Wings & pet", "Aucun": "None", "Aucune pièce": "No piece",
    "Aucun accessoire": "No accessory", "Aucune Arcana équipée": "No Arcana equipped", "Compétences actives": "Active skills", "Compétences passives": "Passive skills",
    "Autres": "Others", "Compétence active": "Active skill", "Compétence passive": "Passive skill", "Classement du personnage": "Character ranking",
    "Comparatif": "Comparison", "Comparatif avec toi": "Compared with you", "Recherche du personnage…": "Searching for the character…",
    "Chargement de la fiche officielle…": "Loading the official profile…", "Recherche un pseudo à gauche, ou ouvre ton personnage.": "Search a name on the left, or open your character.",
    "Enregistre ton personnage pour comparer.": "Save your character to compare.", "Ta fiche n'a pas pu être chargée pour la comparaison.": "Your profile could not be loaded for the comparison.",
    "Plateaux débloqués · clique un plateau pour ses bonus": "Unlocked boards · click a board for its bonuses", "Sélectionne un plateau pour afficher ses bonus actifs.": "Select a board to show its active bonuses.",
    "Aucun bonus actif sur ce plateau.": "No active bonus on this board.", "Aucun plateau Daevanion renvoyé.": "No Daevanion board returned.",
    "Bonus de statistiques": "Stat bonuses", "Bonus de compétences": "Skill bonuses", "Aucune compétence renvoyée par l'armurerie.": "No skill returned by the armory.",
    "L'étoile d'une fiche l'ajoute ici.": "A profile's star adds it here.", "Arme principale": "Main weapon", "Main secondaire": "Off-hand", "Casque": "Helmet", "Épaulières": "Shoulders",
    "Torse": "Chest", "Gants": "Gloves", "Jambières": "Leggings", "Bottes": "Boots", "Cape": "Cape", "Ceinture": "Belt", "Collier": "Necklace", "Boucle d'oreille": "Earring", "Anneau": "Ring", "Bracelet": "Bracelet",
    "Commun": "Common", "Légendaire": "Legendary", "Épique": "Epic", "Mythique": "Mythic", "Unique": "Unique", "Rare": "Rare", "Niveau": "Level", "Requis : niv.": "Required: lv.",
    "Fiche introuvable pour": "No profile found for", "Impossible de charger la fiche :": "Could not load the profile:", "Recherche impossible :": "Search failed:",
    "Aucun personnage «": "No character “", "Aucun joueur «": "No player “", ". Vérifie l'orthographe et le serveur.": ". Check the spelling and the server.", "» sur": "” on",
    "Légion": "Legion", "Titre": "Title", "Saison": "Season", "nouveau": "new", "Fermer le détail": "Close details",
    // Classement
    "Classements officiels": "Official leaderboards", "Mes personnages et favoris": "My characters & favourites", "Contenu": "Content", "Classe": "Class",
    "Nom": "Name", "Filtrer par pseudo": "Filter by name", "Rang": "Rank", "Évol.": "Change", "Grade": "Grade", "Points": "Points", "Tous les serveurs": "All servers",
    "Toutes les classes": "All classes", "Clique une ligne pour inspecter le personnage": "Click a row to inspect the character", "Ajouter un joueur au classement (pseudo)": "Add a player to the leaderboard (name)",
    "Pseudo à ajouter": "Name to add", "Serveur du joueur": "Player's server", "Ajouter": "Add", "Retirer": "Remove", "compte": "account", "favori": "favourite", "ajouté": "added",
    "Tes comptes, tes favoris et les joueurs ajoutés ici, classés avec les données de l'armurerie officielle.": "Your accounts, favourites and players added here, ranked with official armory data.",
    "Ajoute des favoris depuis l'onglet Personnage, ou un pseudo ci-dessus.": "Add favourites from the Character tab, or a name above.",
    "Aucun joueur classé pour ces filtres.": "No ranked player for these filters.", "Classement indisponible :": "Leaderboard unavailable:", "Chargement…": "Loading…",
    "L'armurerie officielle ne publie aucun classement en ce moment : NCSOFT a fermé les classements publics (aucune saison ouverte). Utilise « Mes personnages et favoris » en attendant leur retour.":
      "The official armory publishes no leaderboard right now: NCSOFT has closed the public boards (no season open). Use “My characters & favourites” until they return.",
    "Abysses": "Abyss", "Cauchemar": "Nightmare", "Transcendance": "Transcendence", "Arène de la solitude": "Arena of Solitude", "Arène de coopération": "Arena of Cooperation", "Épreuve d'ascension": "Ascension Trial",
    "Aucun classement publié pour ce personnage. NCSoft suspend parfois les classements entre deux saisons.": "No ranking published for this character. NCSoft sometimes suspends rankings between seasons.",
    "Gladiateur": "Gladiator", "Templier": "Templar", "Rôdeur": "Ranger", "Sorcier": "Sorcerer", "Spiritualiste": "Spiritmaster", "Clerc": "Cleric", "Aède": "Chanter", "Esprit": "Spirit", "Lutteur": "Brawler",
    // Tâches
    "Quotidiennes": "Daily", "Hebdomadaires": "Weekly", "Quotidienne": "Daily", "Hebdomadaire": "Weekly", "Ma liste": "My list", "Nouvelle tâche": "New task", "Fois": "Times",
    "Modifier la liste": "Edit the list", "Tout décocher": "Uncheck all", "Retirer une fois": "Remove one", "Quot.": "Daily", "Hebdo": "Weekly",
    "Avancement de chaque personnage · clique pour changer": "Progress of each character · click to switch", "Enregistre un compte pour suivre son avancement.": "Save an account to track its progress.",
    "Liste de départ à adapter à ta routine · les cases se décochent seules au reset": "Starter list to adapt to your routine · boxes uncheck themselves at reset",
    "Aucune tâche. Ajoute-en avec le formulaire « Ma liste ».": "No task. Add some with the “My list” form.", "Réinitialisation dans": "Resets in",
    "Les heures de reset suivent les timers « Reset quotidien » et « Reset hebdomadaire » : modifie-les dans l'onglet Timers si besoin.":
      "Reset times follow the “Daily reset” and “Weekly reset” timers: change them in the Timers tab if needed.",
    "Quêtes quotidiennes": "Daily quests", "Entrées de donjon du jour": "Today's dungeon entries", "Faille spatio-temporelle": "Space-time rift", "Missions de légion": "Legion missions",
    "Récolte et artisanat": "Gathering & crafting", "Événements de terrain": "Field events", "Donjons hebdomadaires": "Weekly dungeons", "Quêtes hebdomadaires": "Weekly quests",
    "Objectifs des Abysses": "Abyss objectives", "Contrat de légion": "Legion contract", "Boutique hebdomadaire": "Weekly shop", "Quêtes, entrées de donjon, boutiques": "Quests, dungeon entries, shops",
    "ID de donjons, quêtes hebdo": "Dungeon IDs, weekly quests",
    // Timers
    "Prochains événements": "Upcoming events", "Alertes d'événements": "Event alerts", "Ajouter un timer": "Add a timer", "Timer personnel": "Custom timer", "Type": "Type",
    "Quotidien (heure fixe)": "Daily (fixed time)", "Hebdomadaire (jour + heure)": "Weekly (day + time)", "Répétitif (toutes les X minutes)": "Repeating (every X minutes)",
    "Respawn (démarre quand tu cliques « Tué »)": "Respawn (starts when you click “Killed”)", "Compte à rebours unique": "One-off countdown", "Jour": "Day", "Heure": "Time",
    "Durée (min)": "Duration (min)", "Heure de référence": "Reference time", "Respawn": "Respawn", "Tué": "Killed", "Prêt": "Ready", "Bientôt": "Soon",
    "Lundi": "Monday", "Mardi": "Tuesday", "Mercredi": "Wednesday", "Jeudi": "Thursday", "Vendredi": "Friday", "Samedi": "Saturday", "Dimanche": "Sunday",
    "lundi": "Monday", "mardi": "Tuesday", "mercredi": "Wednesday", "jeudi": "Thursday", "vendredi": "Friday", "samedi": "Saturday", "dimanche": "Sunday",
    "Reset quotidien": "Daily reset", "Reset hebdomadaire": "Weekly reset", "Raid aérien de Beritra": "Beritra air raid", "Défense des marchands Shugo": "Shugo merchant defence",
    "Événement de zone": "Zone event", "Événement de terrain": "Field event", "Boss de terrain, sortie de légion, craft…": "Field boss, legion outing, crafting…",
    "Ex : Boss de terrain Ignis": "e.g. Ignis field boss", "Ex : Donjon de la légion": "e.g. Legion dungeon", "Exemple d'alerte ·": "Sample alert ·", "Tester l'alerte": "Test the alert",
    "Alerte avant l'événement": "Alert before the event", "Alerte activée": "Alert on", "Alerte coupée": "Alert off", "Alerte": "Alert", "Fermer l'alerte": "Close the alert",
    "Pop-up affichée même quand l'overlay est masqué": "Pop-up shown even when the overlay is hidden", "Position à l'écran": "Position on screen", "Taille": "Size", "Son": "Sound",
    "Sonnerie": "Ringtone", "Volume": "Volume", "Volume de l'alerte": "Alert volume", "Joué à chaque alerte": "Played on every alert", "Carillon": "Chime", "Cristal": "Crystal", "Gong": "Gong", "Bip": "Beep",
    "Serveur des événements": "Event server", "Fuseau horaire du serveur": "Server time zone", "Heure du serveur": "Server time", "Mon heure (PC)": "My time (PC)", "UTC": "UTC",
    "Les horaires en heure serveur suivent son fuseau": "Server-time schedules follow its time zone", "Actualiser la liste des serveurs": "Refresh the server list", "Prendre mon serveur": "Use my server",
    "La liste vient de l'armurerie officielle : les nouveaux serveurs y apparaissent dès leur ouverture.": "The list comes from the official armory: new servers appear as soon as they open.",
    "Nouveaux serveurs :": "New servers:", "serveurs dans la liste officielle": "servers in the official list", ", mise à jour à": ", updated at",
    ". Les nouveaux serveurs y apparaissent dès leur ouverture.": ". New servers appear as soon as they open.", "Réglages dans l'onglet Timers": "Settings in the Timers tab",
    "Horaires de base issus de sources communautaires, à vérifier en jeu. Le crayon permet de les ajuster.": "Base schedules come from community sources, check them in game. The pencil lets you adjust them.",
    "Alerte 5 min avant · horaires modifiables": "Alert 5 min before · editable times", "min avant · horaires modifiables": "min before · editable times",
    "Piste mystérieuse, Tireur Nyerk, Lugi caché, Trésor de Goldrin": "Mysterious trail, Nyerk gunner, hidden Lugi, Goldrin treasure",
    "Chaque jour à": "Every day at", "Chaque": "Every", "à": "at", "min après le kill": "min after the kill", "Compte à rebours de": "Countdown of", "Toutes les": "Every", "À partir de": "From", "à partir de": "from",
    "Aucun timer actif": "No active timer", "Modifier": "Edit", "Supprimer": "Delete", "Réinitialiser": "Reset", "Désactiver": "Disable", "Activer": "Enable", "Prévenir": "Notify",
    // DPS
    "Combat": "Fight", "Cible": "Target", "Boss": "Boss", "DPS du groupe": "Party DPS", "Mon DPS": "My DPS", "Dégâts": "Damage", "Durée": "Duration", "Joueurs": "Players",
    "Joueur": "Player", "Part": "Share", "Crit": "Crit", "Parfait": "Perfect", "Dos": "Back", "Coups": "Hits", "Max": "Max", "Morts": "Deaths", "moi": "me", "groupe": "party", "Moi": "Me",
    "Démarrer": "Start", "Arrêter": "Stop", "Nouveau combat": "New fight", "Mode démo": "Demo mode", "Démo": "Demo", "Arrêté": "Stopped", "En combat": "In combat", "En attente": "Waiting",
    "En pause": "Paused", "Recherche du jeu": "Looking for the game", "Recherche du jeu…": "Looking for the game…", "Npcap manquant": "Npcap missing", "Npcap bloqué": "Npcap blocked", "Erreur": "Error",
    "Capture impossible": "Capture failed", "Capture impossible :": "Capture failed:", "Aucun combat": "No fight", "Historique des combats": "Fight history", "Effacer": "Clear",
    "Les 30 derniers combats de plus de 3 secondes · clique une ligne pour le détail": "The last 30 fights longer than 3 seconds · click a row for details",
    "DPS groupe": "Party DPS", "Meilleur": "Best", "Aucun combat enregistré pour l'instant.": "No fight recorded yet.", "Source des données": "Data source", "D'où viennent les chiffres": "Where the numbers come from",
    "Réseau · tout le groupe": "Network · whole party", "Écran · toi seul": "Screen · you only", "Télécharger Npcap": "Download Npcap", "Installe": "Install",
    "(une seule fois, options par défaut), comme pour les autres DPS meters.": "(once, default options), like the other DPS meters.",
    "Laisse le DPS meter démarré et lance Aion 2 : il se connecte tout seul au trafic du jeu. Si rien ne s'affiche, change de zone ou téléporte-toi.":
      "Leave the DPS meter started and launch Aion 2: it connects to the game traffic on its own. If nothing shows up, change zone or teleport.",
    "Lecture passive, comme NotMeter ou A2Tools : rien n'est envoyé au jeu ni modifié. Format des paquets documenté par le projet open source RATmeter (GPL-3.0).":
      "Passive reading, like NotMeter or A2Tools: nothing is sent to the game or modified. Packet format documented by the open-source RATmeter project (GPL-3.0).",
    "Dégâts sur la durée (DoT)": "Damage over time (DoT)", "Poisons, saignements, brûlures": "Poisons, bleeds, burns", "Fin du combat après": "End the fight after",
    "Ton DPS seulement.": "Your DPS only.", "L'Analyse de combat du jeu n'affiche que tes propres dégâts.": "The game's Combat Analysis only shows your own damage.",
    "En jeu, ouvre l'": "In game, open the", "Analyse de combat": "Combat Analysis", "Clique": "Click", "Définir": "Set", "et encadre le chiffre du DPS, puis celui des dégâts totaux.": "and frame the DPS number, then the total damage number.",
    "Démarre la lecture et masque l'overlay.": "Start reading and hide the overlay.", "Zone non définie": "Zone not set", "Aucun aperçu": "No preview", "Aperçu indisponible": "Preview unavailable",
    "Dégâts totaux": "Total damage", "Fréquence de lecture": "Reading rate", "Apparence du widget": "Widget appearance", "Aperçu en direct": "Live preview", "Disposition": "Layout",
    "Barres": "Bars", "Compacte": "Compact", "Joueurs affichés": "Players shown", "Tous": "All", "Mon groupe": "My party", "Lignes au maximum": "Max rows", "Colonnes": "Columns",
    "Chiffres": "Numbers", "Abrégés (12,3 k)": "Short (12.3k)", "Complets": "Full", "Couleur des barres": "Bar colour", "Par classe": "By class", "Une seule couleur": "Single colour", "Couleur": "Colour",
    "Courbe des 60 dernières secondes": "Last 60 seconds curve", "DPS du groupe sur les 60 dernières secondes": "Party DPS over the last 60 seconds", "Dégâts par joueur": "Damage per player",
    "Arrêté. Clique « Démarrer ».": "Stopped. Click “Start”.", "Démarrage de la capture…": "Starting the capture…", "Connecté au jeu ·": "Connected to the game ·", "carte réseau": "network adapter",
    "Npcap n'est pas installé. Installe-le (options par défaut), puis clique « Réessayer ».": "Npcap is not installed. Install it (default options), then click “Retry”.",
    "Démarrer le service Npcap": "Start the Npcap service", "Relancer en administrateur": "Restart as administrator", "Réessayer": "Retry", "Npcap : service": "Npcap: service",
    "· réservé aux administrateurs": "· administrators only", "Source : lecture de l'écran.": "Source: screen reading.", "Le DPS meter réseau fonctionne dans l'application Windows.": "The network DPS meter works in the Windows app.",
    "Groupe simulé pour régler l'affichage": "Simulated party to tune the display", "Lecture de l'écran arrêtée": "Screen reading stopped", "Lecture de l'Analyse de combat toutes les": "Reading the Combat Analysis every",
    "Lecture en pause tant que l'overlay couvre l'écran : masque-le pour reprendre": "Reading paused while the overlay covers the screen: hide it to resume",
    "Clique « Démarrer » : le DPS de chaque joueur s'affichera ici.": "Click “Start”: each player's DPS will show here.",
    "Connecté. Attaque un monstre : les dégâts de chaque joueur apparaissent ici.": "Connected. Attack a monster: each player's damage shows here.",
    "Installe Npcap (bouton à droite), puis redémarre l'application.": "Install Npcap (button on the right), then restart the app.",
    "La capture a échoué : voir le message à droite.": "The capture failed: see the message on the right.",
    "En attente du trafic du jeu. Lance Aion 2, ou change de zone s'il tourne déjà.": "Waiting for game traffic. Launch Aion 2, or change zone if it is already running.",
    "En attente d'un combat dans l'Analyse de combat.": "Waiting for a fight in the Combat Analysis.", "Clique « Démarrer » pour lire l'Analyse de combat.": "Click “Start” to read the Combat Analysis.",
    "Définis d'abord où lire le DPS dans l'Analyse de combat (à droite).": "First set where to read the DPS in the Combat Analysis (on the right).",
    "Détail des compétences indisponible pour cette source.": "Skill details unavailable for this source.", "Compétence": "Skill", "coups · crit": "hits · crit",
    "dégâts reçus": "damage taken", "Monstre n°": "Monster #", "Gardien de la démo": "Demo guardian", "Remettre le compteur à zéro": "Reset the counter", "Clic à travers activé": "Click-through on", "Déplaçable": "Movable",
    "Lu :": "Read:", "Rien de lisible": "Nothing readable", "Encadre": "Frame", "le chiffre du DPS": "the DPS number", "le chiffre des dégâts totaux": "the total damage number",
    "dans l'Analyse de combat": "in the Combat Analysis", "Clique-glisse autour du nombre · Échap pour annuler": "Click and drag around the number · Esc to cancel",
    "Zone de lecture": "Reading zone", "La sélection d'une zone de l'écran se fait dans l'application de bureau.": "Selecting a screen zone is done in the desktop app.",
    "Npcap est réglé pour les administrateurs uniquement. Clique « Relancer en administrateur », ou réinstalle Npcap en décochant « Restrict Npcap driver's access to Administrators only ».":
      "Npcap is set to administrators only. Click “Restart as administrator”, or reinstall Npcap with “Restrict Npcap driver's access to Administrators only” unchecked.",
    // Cooldowns
    "Compétences suivies": "Tracked skills", "Le compte à rebours démarre quand tu appuies sur la touche de la compétence": "The countdown starts when you press the skill's key",
    "Tout remettre à zéro": "Reset all", "Ajouter une compétence": "Add a skill", "Depuis ta fiche officielle, ou à la main": "From your official profile, or by hand", "Mes compétences": "My skills",
    "Nom de la compétence": "Skill name", "Ex : Bouclier divin": "e.g. Divine Shield", "Recharge (s)": "Cooldown (s)", "Recharge en secondes": "Cooldown in seconds",
    "L'armurerie officielle ne publie pas les temps de recharge : saisis-les une fois, ils sont retenus.": "The official armory does not publish cooldowns: enter them once, they are remembered.",
    "Clique une icône de l'aperçu pour la tester": "Click an icon in the preview to test it", "Ligne": "Row", "Colonne": "Column", "Grille": "Grid",
    "Seulement les compétences en recharge": "Only skills on cooldown", "Le widget disparaît quand tout est prêt": "The widget disappears when everything is ready", "Secondes restantes": "Seconds left",
    "Noms sous les icônes": "Names under icons", "Halo quand la compétence est prête": "Glow when the skill is ready", "Choisir la touche": "Pick the key", "Appuie sur une touche…": "Press a key…",
    "Seulement en jeu": "Only in game", "Relancer si réappuyée": "Restart if pressed again", "Son quand prête": "Sound when ready", "Tester": "Test", "Touche non prise en charge": "Unsupported key",
    "Aucune compétence suivie. Ajoute-en depuis ta fiche ci-dessous ou à la main.": "No tracked skill. Add some from your profile below or by hand.",
    "Enregistre ton personnage pour voir ses compétences.": "Save your character to see its skills.", "Fiche non chargée : ouvre l'onglet Personnage ou vérifie ta connexion.": "Profile not loaded: open the Character tab or check your connection.",
    "Ajoute une compétence pour voir l'aperçu.": "Add a skill to see the preview.", "Détection des touches indisponible :": "Key detection unavailable:", "Clic molette": "Middle click", "Pavé": "Numpad",
    // Viseur
    "Affiché au centre de l'écran, par-dessus le jeu, sans bloquer la souris": "Shown at the centre of the screen, over the game, without blocking the mouse",
    "Voir en vrai 5 secondes": "Show it for real for 5 seconds", "Aperçu du viseur": "Crosshair preview", "Afficher le viseur en jeu": "Show the crosshair in game", "Visible quand l'overlay est masqué": "Visible when the overlay is hidden",
    "État du viseur…": "Crosshair status…", "Raccourci afficher / masquer": "Show / hide shortcut", "Modèles": "Presets", "Réglages": "Settings", "Forme": "Shape", "Croix": "Cross", "Croix + point": "Cross + dot",
    "Point": "Dot", "Cercle": "Circle", "Cercle + point": "Circle + dot", "T": "T", "Contour": "Outline", "Garde le viseur lisible sur fond clair": "Keeps the crosshair readable on bright backgrounds",
    "Couleur du contour": "Outline colour", "Centrer sur": "Centre on", "L'écran": "The screen", "La fenêtre du jeu": "The game window", "Seulement quand le jeu est au premier plan": "Only when the game is in the foreground",
    "Masqué sur le bureau ou une autre application": "Hidden on the desktop or another app", "Épaisseur": "Thickness", "Longueur": "Length", "Écart central": "Centre gap", "Taille du point": "Dot size",
    "Rayon du cercle": "Circle radius", "Épaisseur du contour": "Outline thickness", "Opacité": "Opacity", "Décalage horizontal": "Horizontal offset", "Décalage vertical": "Vertical offset",
    "Classique": "Classic", "Fin": "Thin", "Archer": "Archer", "Mode d'affichage": "Display mode", "Standard": "Standard", "Compatibilité": "Compatibility",
    "Si le viseur reste invisible en jeu alors que l'état indique « Affiché », choisis « Compatibilité » : il est alors dessiné par une fenêtre Windows native.":
      "If the crosshair stays invisible in game while the status says “Shown”, pick “Compatibility”: it is then drawn by a native Windows window.",
    "Désactivé. Active l'option ci-dessus ou presse": "Off. Turn on the option above or press", "en jeu.": "in game.", "Prêt : il apparaît dès que tu masques l'overlay (": "Ready: it appears as soon as you hide the overlay (",
    "Masqué : le module Windows ne répond pas. Voir Paramètres › Diagnostic.": "Hidden: the Windows module does not respond. See Settings › Diagnostic.",
    "Masqué : Aion 2 (AION2.exe) n'est pas détecté. Lance le jeu, ou coupe « Seulement quand le jeu est au premier plan ».": "Hidden: Aion 2 (AION2.exe) is not detected. Launch the game, or turn off “Only when the game is in the foreground”.",
    "Masqué :": "Hidden:", "n'est pas au premier plan. Clique dans la fenêtre du jeu.": "is not in the foreground. Click in the game window.", "Affiché par-dessus": "Shown over",
    "· mode compatibilité": "· compatibility mode", "(mode compatibilité)": "(compatibility mode)", "Le viseur s'affiche par-dessus le jeu dans l'application de bureau.": "The crosshair shows over the game in the desktop app.",
    "Jeu en plein écran exclusif : passe en plein écran fenêtré": "Game in exclusive fullscreen: switch to windowed fullscreen",
    "Raccourci du viseur": "Crosshair shortcut", "Presse une combinaison…": "Press a combination…", "Raccourci du viseur, cliquer puis presser une combinaison": "Crosshair shortcut, click then press a combination",
    // Carte
    "Carte interactive": "Interactive map", "Recharger": "Reload", "Ouvrir dans le navigateur": "Open in browser", "Carte utilisée": "Map used", "Cartes communautaires, tenues à jour par leurs auteurs": "Community maps, kept up to date by their authors",
    "Autre carte": "Other map", "Utiliser": "Use", "Adresse de la carte": "Map address", "Zoom de la carte": "Map zoom", "Chargement de la carte…": "Loading the map…", "Recharger la carte": "Reload the map",
    "La carte s'affiche ici dans l'application de bureau.": "The map shows here in the desktop app.", "· progression enregistrée sur cet ordinateur": "· progress saved on this computer",
    "En français · 114 cartes : cubes cachés, traces, boss, récolte, Kibelisks, quêtes · cases à cocher": "In French · 114 maps: hidden cubes, traces, bosses, gathering, Kibelisks, quests · checkboxes",
    "Plumes des monolithes et cubes cachés à cocher · en anglais": "Monolith feathers and hidden cubes to tick · in English",
    "Boss de zone, donjons scellés, Kibelisks, récolte, cubes cachés · en anglais": "Zone bosses, sealed dungeons, Kibelisks, gathering, hidden cubes · in English",
    "Utilise l'adresse d'un autre site (https://…)": "Use another site's address (https://…)", "L'adresse doit commencer par https://": "The address must start with https://",
    "Les points que tu coches sont enregistrés par le site, sur cet ordinateur. L'onglet et le widget partagent la même progression.": "The points you tick are saved by the site on this computer. The tab and the widget share the same progress.",
    "Le widget se déplace par sa barre de titre et se redimensionne par ses bords ; clique dedans pour naviguer (molette pour zoomer, glisser pour déplacer).": "Move the widget by its title bar and resize it by its edges; click inside to navigate (wheel to zoom, drag to pan).",
    "Carte ·": "Map ·",
    // Ping
    "Délai de macro conseillé": "Recommended macro delay", "Valeur à mettre entre deux compétences dans les macros du jeu": "Value to put between two skills in the game's macros",
    "Minimum": "Minimum", "Ping médian": "Median ping", "Instabilité": "Jitter", "Mesure…": "Measuring…", "Mesure en cours…": "Measuring…", "Historique du ping": "Ping history",
    "Ping du jeu": "Game ping", "Serveur de jeu": "Game server", "Indicatif · jeu fermé": "Indicative · game closed", "Ping & weaving": "Ping & weaving", "Exemple de macro": "Sample macro",
    "Auto-attaque toutes les": "Auto-attack every", "Stable": "Stable", "Moyen": "Average", "Élevé": "High", "Macro": "Macro",
    "Serveur web Aion 2 (jeu fermé, latence indicative)": "Aion 2 web server (game closed, indicative latency)", "Mesure impossible (hors ligne ?)": "Measurement failed (offline?)",
    "Calcul : ping des 60 dernières secondes, 90 % des mesures + 10 ms de marge, arrondi à la dizaine. Sous le minimum, la 2ᵉ compétence part avant que le serveur ait validé la 1ʳᵉ ; au-dessus du conseillé, tu ajoutes seulement du délai. Estimation à affiner en jeu.":
      "Method: ping over the last 60 seconds, 90% of samples + 10 ms margin, rounded to ten. Below the minimum, the 2nd skill fires before the server has validated the 1st; above the recommendation you only add delay. An estimate to refine in game.",
    // Widgets
    "Widget à l'écran": "On-screen widget", "Garde": "Keeps", "visible quand l'overlay est masqué avec": "visible when the overlay is hidden with", "les timers": "the timers", "la carte": "the map",
    "l'indicateur de ping": "the ping indicator", "le DPS meter": "the DPS meter", "les cooldowns": "the cooldowns", "Épingler à l'écran": "Pin to screen", "Au premier plan, par-dessus le jeu": "On top, over the game",
    "Clic à travers": "Click-through", "Les clics passent au jeu. Coupe-le pour déplacer le widget à la souris.": "Clicks go to the game. Turn it off to move the widget with the mouse.",
    "Petite": "Small", "Moyenne": "Medium", "Grande": "Large", "Position": "Position", "Opacité du widget": "Widget opacity", "Position du widget": "Widget position",
    "Haut gauche": "Top left", "Haut centre": "Top centre", "Haut droite": "Top right", "Milieu gauche": "Middle left", "Milieu droite": "Middle right", "Bas gauche": "Bottom left", "Bas centre": "Bottom centre", "Bas droite": "Bottom right",
    "Libre (déplacé à la souris)": "Free (moved with the mouse)", "Voir le widget 6 secondes": "Show the widget for 6 seconds", "Les widgets s'ouvrent dans l'application de bureau.": "Widgets open in the desktop app.",
    "Les widgets épinglés s'ouvrent dans l'application de bureau.": "Pinned widgets open in the desktop app.", "Aperçu": "Preview",
    // Paramètres
    "Raccourci & performances": "Shortcut & performance", "Raccourci de l'overlay": "Overlay shortcut", "Clique le champ puis presse ta combinaison. Échap masque aussi l'overlay.": "Click the field then press your combination. Esc also hides the overlay.",
    "Limite d'images de l'overlay": "Overlay frame limit", "30 IPS": "30 FPS", "60 IPS": "60 FPS", "Comportement": "Behaviour", "Auto-sync du personnage": "Character auto-sync", "Ouvre ta fiche au démarrage": "Opens your profile at startup",
    "Notifications de timers": "Timer notifications", "Confidentialité & comptes": "Privacy & accounts", "Mode streamer": "Streamer mode", "Floute les pseudos affichés": "Blurs displayed names",
    "Affichage": "Display", "Fenêtre de l'interface": "Interface window", "Plein écran": "Full screen", "Fenêtrée": "Windowed", "Opacité de l'interface": "Interface opacity",
    "Flou du jeu derrière l'interface": "Game blur behind the interface", "Flou de l'arrière-plan": "Background blur", "Aucun": "None",
    "Le jeu doit être en mode fenêtré ou plein écran fenêtré (sans bordure) pour que l'overlay et les widgets restent visibles par-dessus.": "The game must be in windowed or borderless fullscreen mode for the overlay and widgets to stay visible over it.",
    "Diagnostic": "Diagnostic", "Actualiser": "Refresh", "Ouvrir le dossier des réglages et du journal": "Open the settings and log folder", "Processus du jeu": "Game process", "Appliquer": "Apply",
    "Automatique (AION2.exe)": "Automatic (AION2.exe)", "À remplir seulement si le jeu n'est pas détecté : nom affiché dans le Gestionnaire des tâches, onglet Détails.": "Fill in only if the game is not detected: name shown in Task Manager, Details tab.",
    "Si Aion 2 tourne en administrateur, Windows empêche une application normale de voir les touches pressées dans le jeu (cooldowns) : relance l'application en administrateur.": "If Aion 2 runs as administrator, Windows prevents a normal app from seeing keys pressed in the game (cooldowns): restart the app as administrator.",
    "Module Windows": "Windows module", "Actif": "Active", "Disponible uniquement sous Windows": "Windows only", "Lecture de l'écran (OCR)": "Screen reading (OCR)", "Indisponible": "Unavailable",
    "Détection des touches": "Key detection", "Active": "Active", "Démarre quand une compétence a une touche": "Starts when a skill has a key", "actif": "active",
    "Indisponible : raccourci déjà pris par une autre application ?": "Unavailable: shortcut already taken by another app?", "Indisponible : raccourci déjà pris ?": "Unavailable: shortcut already taken?",
    "Client du jeu": "Game client", "Non détecté : lance Aion 2": "Not detected: launch Aion 2", "au premier plan": "in the foreground", "en arrière-plan": "in the background",
    "Désactivé": "Off", "Prêt (s'affiche quand l'overlay est masqué)": "Ready (shows when the overlay is hidden)", "Module Windows indisponible": "Windows module unavailable",
    "Masqué : jeu non détecté": "Hidden: game not detected", "Masqué : le jeu n'est pas au premier plan": "Hidden: the game is not in the foreground", "Affiché": "Shown", "OK": "OK", "Info": "Info",
    "Le diagnostic est disponible dans l'application de bureau.": "The diagnostic is available in the desktop app.", "Raccourci, cliquer puis presser une combinaison": "Shortcut, click then press a combination",
    "Version": "Version", "Langue de l'interface": "Interface language",
    // Divers
    "Erreur inconnue": "Unknown error", "Fermer": "Close", "Aperçu de la zone": "Zone preview", "Objet d'exemple": "Sample item", "Ailes d'exemple": "Sample wings", "Familier d'exemple": "Sample pet",
    "Légion d'exemple": "Sample legion", "Titre d'exemple": "Sample title", "Compétence d'exemple +1": "Sample skill +1", "Précision +60": "Accuracy +60", "Défense physique +80": "Physical defence +80",
    "Dépassement ★": "Exceed ★",
    "Afficher / masquer l'overlay": "Show / hide the overlay",
    "(heure serveur)": "(server time)", "heure serveur": "server time", "Fréquence": "Frequency", "Événements": "Events", "Fuseau horaire": "Time zone",
    "l'armurerie officielle ne répond pas (délai dépassé)": "the official armory does not respond (timeout)", "armurerie injoignable": "armory unreachable",
    "l'armurerie officielle a répondu HTTP": "the official armory answered HTTP", "personnage introuvable sur l'armurerie officielle": "character not found on the official armory",
    "réponse illisible de l'armurerie officielle": "unreadable answer from the official armory", "introuvable": "not found", "Impossible d'ouvrir une carte réseau avec Npcap": "Could not open a network adapter with Npcap",
    "Cartes vues :": "Adapters seen:", "aucune carte réseau trouvée": "no network adapter found", "Enregistre d'abord ton personnage.": "Save your character first.", "Couleur personnalisée": "Custom colour", "Ma liste": "My list", "Sections": "Sections",
    "Alertes": "Alerts", "Notifications": "Notifications", "Favori": "Favourite", "Pseudo": "Name", "Armurerie": "Armory", "Synchro jeu": "Game sync", "Point": "Dot",
    // v1.4 : PichetMeter
    "Infos": "About", "Animations de l'interface": "Interface animations", "Ouverture, fermeture et changements d'onglet": "Opening, closing and tab changes",
    "Seulement quand le jeu est au premier plan": "Only when the game is in the foreground",
    "Les widgets disparaissent dès que tu passes sur une autre fenêtre (Discord, navigateur…) et reviennent avec le jeu. Le viseur garde son propre réglage.": "Widgets disappear as soon as you switch to another window (Discord, browser…) and come back with the game. The crosshair keeps its own setting.",
    "Jeu non détecté : les widgets restent cachés jusqu'à son lancement. S'il tourne déjà, indique son processus dans Diagnostic.": "Game not detected: widgets stay hidden until it starts. If it is already running, enter its process in Diagnostics.",
    // v1.3 : modules, DPS, cooldowns, timers
    "Modules en jeu": "Modules in game", "Affichés par-dessus le jeu quand l'overlay est masqué": "Shown over the game when the overlay is hidden",
    "Test de détection": "Detection test", "Boss uniquement": "Boss only", "Hors combat": "Out of combat", "Visible": "Visible", "Transparent": "Transparent", "Masqué": "Hidden",
    "Opacité hors combat": "Out-of-combat opacity", "Recaler": "Resync", "ajusté": "adjusted", "En cours": "Live", "Revenir à l'horaire de base": "Back to the default schedule",
    "Jours": "Days", "Heure(s)": "Hour(s)", "Lun": "Mon", "Mar": "Tue", "Mer": "Wed", "Jeu": "Thu", "Ven": "Fri", "Sam": "Sat", "Dim": "Sun",
    "Régler": "Settings", "Afficher en jeu": "Show in game",
    "Appuie sur la touche d'une compétence suivie, en jeu ou ici : le résultat s'affiche ci-dessous": "Press the key of a tracked skill, in game or here: the result shows below",
    "Le compteur ne démarre que contre un boss (ou un mannequin d'entraînement) ; les monstres normaux sont ignorés": "The meter only starts against a boss (or a training dummy); normal monsters are ignored",
    "Festival Shugo": "Shugo Festival", "Invasion dimensionnelle": "Dimensional Invasion"
  };

  // Phrases dynamiques (nombres, noms) : motifs
  const RX = [
    [/^(\d+) comptes?$/, m => `${m[1]} account${m[1] > 1 ? "s" : ""}`],
    [/^(\d\d:\d\d(?::\d\d)?) serveur$/, m => `${m[1]} server`],
    [/^Dans (.+)$/, m => "In " + (tr1(m[1]) ?? m[1])],
    [/^Chaque jour à (.+)$/, m => `Every day at ${tr1(m[1]) ?? m[1]}`],
    [/^Chaque (\S+) à (.+)$/, m => `Every ${EN[m[1]] || m[1]} at ${tr1(m[2]) ?? m[2]}`],
    [/^(\d+) compétences? apprises?$/, m => `${m[1]} skill${m[1] > 1 ? "s" : ""} learned`],
    [/^Chargement de (\d+) personnages?…$/, m => `Loading ${m[1]} character${m[1] > 1 ? "s" : ""}…`],
    [/^« (.+) » introuvable sur (.+)\.$/, m => `“${m[1]}” not found on ${m[2]}.`],
    [/^Indisponible \((.*)\)$/, m => `Unavailable (${tr1(m[1])})`],
    [/^Saison (\S*)(?: · fin le (.+))?$/, m => `Season ${m[1]}${m[2] ? " · ends " + m[2] : ""}`],
    [/^(\d+) % · (.+) PV$/, m => `${m[1]}% · ${m[2]} HP`],
    [/^(.+) \/ (.+) PV · (.+) %$/, m => `${m[1]} / ${m[2]} HP · ${m[3]}%`],
    [/^(.+) PV$/, m => `${m[1]} HP`],
    [/^Monstre n° (\d+)$/, m => `Monster #${m[1]}`],
    [/^Serveur (\d+)$/, m => `Server ${m[1]}`],
    [/^Niv\. (\d+)$/, m => `Lv. ${m[1]}`],
    [/^Compétence (\d+)$/, m => `Skill ${m[1]}`],
    [/^Arcana (\d+)$/, m => `Arcana ${m[1]}`],
    [/^Lu : (.*)$/, m => `Read: ${m[1]}`],
    [/^(.+) actif$/, m => `${m[1]} active`],
    [/^Version (\S+) · Electron (\S+)$/, m => `Version ${m[1]} · Electron ${m[2]}`]
  ];
  const JOURS = { lundi: "Monday", mardi: "Tuesday", mercredi: "Wednesday", jeudi: "Thursday", vendredi: "Friday", samedi: "Saturday", dimanche: "Sunday" };
  const SUBS = [
    [/Chaque (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) à/g, (_, j) => `Every ${JOURS[j]} at`],
    [/Chaque jour à/g, () => "Every day at"],
    [/\bDans (\d+) min/g, (_, n) => `In ${n} min`],
    [/(\d+) min après le kill/g, (_, n) => `${n} min after the kill`]
  ];
  const PHRASES = Object.keys(EN).filter(k => k.length >= 7 && /\s/.test(k)).sort((a, b) => b.length - a.length);
  const cache = new Map();
  function tr1(t) {
    if (Object.prototype.hasOwnProperty.call(EN, t)) return EN[t];
    if (cache.has(t)) return cache.get(t);
    let out = null;
    for (const [re, f] of RX) { const m = t.match(re); if (m) { out = f(m); break; } }
    if (out == null && t.length > 6) {
      let x = t, ok = false;
      for (const p of PHRASES) if (x.includes(p)) { x = x.split(p).join(EN[p]); ok = true; }
      for (const [re, f] of SUBS) { const y = x.replace(re, f); if (y !== x) { x = y; ok = true; } }
      if (ok) out = x;
    }
    if (cache.size > 5000) cache.clear();
    cache.set(t, out);
    return out;
  }
  function tr(s) {
    if (!s || !/[A-Za-zÀ-ÿ]/.test(s)) return s;
    const t = s.trim();
    const out = tr1(t);
    return out == null ? s : s.replace(t, out);
  }
  const ATTRS = ["placeholder", "title", "aria-label"];
  const SKIP = "script,style,.pname,[data-noi18n],textarea";
  function texte(n) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP) || n.__i18n === n.data) return;
    const v = tr(n.data);
    if (v !== n.data) { n.data = v; }
    n.__i18n = n.data;
  }
  function attrs(el) {
    if (el.closest(SKIP)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || el["__i18n_" + a] === v) continue;
      const t = tr(v);
      if (t !== v) el.setAttribute(a, t);
      el["__i18n_" + a] = t;
    }
  }
  function arbre(root) {
    if (root.nodeType === 3) return texte(root);
    if (root.nodeType !== 1) return;
    attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) texte(n); else attrs(n); }
  }
  window.I18N = {
    langue: "fr",
    t: s => (window.I18N.langue === "en" ? tr(s) : s),
    demarrer(langue) {
      window.I18N.langue = langue === "en" ? "en" : "fr";
      document.documentElement.lang = window.I18N.langue;
      if (window.I18N.langue !== "en") return;
      arbre(document.body);
      new MutationObserver(ms => {
        for (const m of ms) {
          if (m.type === "characterData") texte(m.target);
          else if (m.type === "attributes") attrs(m.target);
          else m.addedNodes.forEach(arbre);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
  };
})();
