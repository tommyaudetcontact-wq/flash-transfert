# Flash Transfert

Application de transfert de fichiers entre téléphone et ordinateur, compatible GitHub Pages.

## Version GitHub Pages

Les fichiers `index.html` et `app.js` constituent l’application complète. Aucun serveur Python, compte utilisateur ou stockage cloud n’est nécessaire pour cette version.

### Publier

1. Pousser ce dépôt sur GitHub.
2. Ouvrir **Settings → Pages** dans le dépôt.
3. Choisir **Deploy from a branch**, puis la branche **main** et le dossier **/ (root)**.
4. Enregistrer et ouvrir l’URL donnée par GitHub Pages sur les deux appareils.

### Associer et transférer

1. Sur le premier appareil, cliquer sur **Créer une invitation** et copier le code.
2. Transmettre ce code à l’autre appareil par un moyen privé.
3. Sur le deuxième appareil, coller l’invitation et cliquer sur **Utiliser le code reçu**.
4. Copier la réponse générée et la transmettre au premier appareil.
5. Sur le premier appareil, coller la réponse et cliquer sur **Utiliser le code reçu**.
6. Attendre la connexion, choisir des fichiers et cliquer sur **Envoyer la sélection**.
7. Accepter chaque fichier sur le destinataire. Si un lien **Enregistrer** apparaît, le toucher pour conserver le fichier.

Les codes contiennent les informations de connexion : les transmettre uniquement à l’autre appareil. Garder les deux onglets ouverts et les appareils éveillés.

### Réseau, confidentialité et limites

Les fichiers passent par un canal WebRTC chiffré entre navigateurs. GitHub sert seulement l’interface. Le serveur STUN `stun.l.google.com:19302` aide à découvrir les adresses réseau; il ne stocke pas les fichiers. Les codes d’association peuvent contenir des informations d’adresse réseau.

La connexion directe peut fonctionner sur le même réseau ou entre réseaux distants. Certains NAT, pare-feu et Wi-Fi invités la bloquent : aucun relais TURN n’est configuré. Le fonctionnement sur tous les réseaux distants n’est donc pas garanti. Essayer le même Wi-Fi si l’association échoue.

Sur les navigateurs proposant `showSaveFilePicker` (notamment Chrome/Edge sur ordinateur), les fichiers reçus sont écrits directement sur disque après acceptation. Sinon, chaque fichier est conservé temporairement en mémoire puis proposé au téléchargement, avec une limite de 256 Mio par fichier. Plusieurs fichiers reçus peuvent consommer beaucoup de mémoire : enregistrer les fichiers et recharger les pages entre grosses séries. Les gros transferts sur téléphone dépendent aussi des limites mémoire et de la mise en veille du système.

Pas de reprise après interruption. Aucun débit maximal garanti : réseau, stockage et appareils déterminent la vitesse.

## Vérification

La version Python a été testée par envoi et téléchargement avec comparaison des octets. Pour la version Pages, consulter les vérifications rapportées avec la livraison. Les tests simulés ne remplacent pas un transfert réel entre téléphone et PC.
