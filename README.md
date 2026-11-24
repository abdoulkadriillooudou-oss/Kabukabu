# KabuKabu

Prototype web de moto-taxi et de livraison à Niamey (Niger). Le site fonctionne sur téléphone et sur ordinateur, et s'installe comme une application.

**Ce qui est réel :** la carte de Niamey (OpenStreetMap), la recherche d'adresses, le calcul d'itinéraire, la position GPS.
**Ce qui est simulé :** les motards, les courses, les paiements, les SMS. Aucune donnée n'est enregistrée sur un serveur.

---

## 1. Publier le site sur GitHub Pages

Vous avez déjà un compte GitHub. Aucune ligne de commande n'est nécessaire.

### Étape 1. Créer le dépôt
1. Connectez-vous sur github.com.
2. Cliquez sur le bouton **+** en haut à droite, puis **New repository**.
3. **Repository name** : `kabukabu` (sans espace, en minuscules).
4. Choisissez **Public**. GitHub Pages gratuit exige un dépôt public.
5. Cliquez sur **Create repository**.

### Étape 2. Téléverser les fichiers
1. Sur la page du nouveau dépôt, cliquez sur le lien **uploading an existing file**.
2. Décompressez l'archive `kabukabu-site.zip` sur votre ordinateur.
3. Ouvrez le dossier décompressé. Sélectionnez **tout son contenu** (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, et les dossiers `assets`, `icons`, `vendor`) et glissez-le dans la page GitHub.
   - Glissez le contenu du dossier, pas le dossier lui-même. Le fichier `index.html` doit se trouver à la racine du dépôt.
4. Attendez la fin du chargement (la barre de progression disparaît), puis cliquez sur **Commit changes**.

### Étape 3. Activer GitHub Pages
1. Dans le dépôt, ouvrez l'onglet **Settings**.
2. Dans le menu de gauche, cliquez sur **Pages**.
3. Sous **Build and deployment**, **Source** : choisissez **Deploy from a branch**.
4. **Branch** : choisissez `main`, dossier `/ (root)`, puis cliquez sur **Save**.
5. Attendez 1 à 2 minutes et actualisez la page. Un bandeau affiche l'adresse du site :

   `https://VOTRE-NOM-GITHUB.github.io/kabukabu/`

Ce lien fonctionne sur tous les téléphones et ordinateurs.

---

## 2. Voir le site sur votre téléphone

1. Ouvrez le lien dans Chrome (Android) ou Safari (iPhone). Envoyez-le-vous par WhatsApp ou par e-mail.
2. Autorisez la localisation quand le navigateur le demande, pour tester « Ma position ».
3. Parcours à tester : **Client** (commander une course), puis **Motard** (accepter la demande), puis **Admin**.
   - Sur un seul téléphone, passez d'un espace à l'autre avec les onglets en haut de l'écran.
   - Code SMS de démonstration pour créer un compte client : `4821`.

### Installer comme une application
- **Android (Chrome)** : menu ⋮, puis **Installer l'application**.
- **iPhone (Safari)** : bouton Partager, puis **Sur l'écran d'accueil**.

L'icône KabuKabu apparaît alors sur l'écran d'accueil et le site s'ouvre en plein écran.

---

## 3. Modifier le site plus tard

1. Dans le dépôt GitHub, cliquez sur **Add file**, puis **Upload files**.
2. Glissez les fichiers modifiés (ils remplacent les anciens) et cliquez sur **Commit changes**.
3. Attendez 1 à 2 minutes. Rechargez la page du site. Si l'ancienne version s'affiche encore, rechargez une seconde fois.

Les réglages les plus utiles sont en haut de `app.js` (adresses des services de carte) et dans l'espace **Admin**, onglet **Tarifs** (prix, commission, recharge minimale, rayons de recherche).

---

## 4. En cas de problème

| Symptôme | Cause probable et solution |
|---|---|
| Erreur 404 sur le lien | Pages n'est pas encore actif ou `index.html` n'est pas à la racine. Vérifiez l'étape 3 et attendez 2 minutes. |
| Page blanche ou sans mise en forme | Les fichiers ont été téléversés dans un sous-dossier. Téléversez le contenu du dossier, pas le dossier. |
| La carte reste grise | Ouvrez le site par son lien `https://...github.io/...`. Un fichier `index.html` ouvert directement depuis l'ordinateur n'affiche pas la carte. Vérifiez aussi la connexion internet. |
| « Hors de la zone de service » | Votre GPS indique une position hors de Niamey. Choisissez un lieu de Niamey comme départ. |
| Distance « estimée » | Le service d'itinéraire est momentanément indisponible. Le prix reste calculé, à partir d'une distance approchée. |

---

## 5. Avant un vrai lancement

Ce prototype montre le fonctionnement et le parcours. Pour recevoir de vraies commandes, trois éléments sont nécessaires :

1. **Un serveur et une base de données** : comptes, courses, portefeuille des motards, validation des dossiers. Aujourd'hui, tout disparaît au rechargement de la page.
2. **Les paiements** : recharge du solde du motard par mobile money (Airtel Money, Moov Money, Orange Money, Mynita) via un agrégateur de paiement, ou par des agents.
3. **Les services de carte** : les serveurs publics utilisés ici (OpenStreetMap, OSRM, Nominatim) conviennent à une démonstration, pas à un usage commercial. Pour le lancement, utilisez un fournisseur de cartes et d'itinéraires avec contrat (par exemple MapTiler, Stadia Maps, Mapbox, Google Maps ou Geoapify). Il suffit de changer les quatre adresses en haut de `app.js`.

Le SMS de vérification, les notifications et le suivi GPS des motards en temps réel dépendent aussi du serveur.

---

## Sources et licences
- Carte : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), licence ODbL.
- Bibliothèque de carte : [Leaflet](https://leafletjs.com) 1.9.4, licence BSD 2-Clause (incluse dans `vendor/leaflet`).
- Itinéraires : [OSRM](https://project-osrm.org). Recherche d'adresses : [Nominatim](https://nominatim.org).
- Coordonnées des lieux de Niamey : Wikipédia, OpenStreetMap et bases géographiques publiques. Les positions des motards de démonstration sont fictives.
- Polices : Sora et DM Sans (Google Fonts).
