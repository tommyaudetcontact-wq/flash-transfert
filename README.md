# Flash Transfert

Transfert direct de fichiers entre téléphone et ordinateur, compatible GitHub Pages.

## Utilisation

1. Ouvrir le site sur les deux appareils.
2. Sur le premier appareil, cliquer sur **Créer un code à 6 chiffres**.
3. Scanner le QR avec la caméra du téléphone, ou saisir les six chiffres sur l’autre appareil et cliquer sur **Se connecter**.
4. Comparer le code de vérification affiché sur les deux écrans et confirmer **C’est mon appareil** sur le premier.
5. Choisir **Photos et vidéos** pour le sélecteur de galerie du téléphone, **Prendre une photo** pour la caméra ou **Fichiers** pour les autres documents. Préparer une sélection multiple, vérifier les aperçus puis envoyer. Le destinataire accepte chaque fichier.

Un code est valable dix minutes et permet une seule association. Les deux pages et appareils doivent rester ouverts et éveillés. Les fichiers reçus en mémoire doivent être enregistrés via leur lien de téléchargement.

## Hébergement

Dans Settings → Pages, choisir Deploy from a branch → main → / (root).
Aucun serveur Python ni compilation n’est nécessaire.

## Architecture et confidentialité

GitHub Pages sert l’interface. PeerJS Cloud assure la mise en relation via HTTPS/WebSocket et traite les métadonnées de connexion. Le STUN de Google aide à découvrir les adresses réseau. Les fichiers passent directement sur un canal WebRTC chiffré. Le QR est généré localement, sans envoyer son contenu à un générateur externe.

Les bibliothèques PeerJS 1.5.5 et QR Code Generator 2.0.4 sont incluses dans le dépôt, avec leurs licences dans THIRD-PARTY-LICENSES.txt. La disponibilité de la connexion dépend de PeerJS Cloud. Aucun relais TURN n’est configuré : certains réseaux distants bloquent la connexion. Essayer le même Wi-Fi.

Le code à six chiffres n’est pas un mot de passe fort : le garder privé, comparer les codes de vérification et accepter uniquement son appareil. Le service public de signalisation n’est pas assorti d’un contrôle de tentatives propre à cette application.

Sur Chrome/Edge compatibles sur PC, réception directement sur disque. Sinon, réception en mémoire limitée à 256 Mio par fichier. Plusieurs fichiers peuvent consommer beaucoup de mémoire. Pas de reprise après interruption. Aucun débit maximal garanti.

Le sélecteur exact (Photos, galerie ou fichiers) dépend du téléphone et du navigateur. Le site reçoit uniquement les médias que tu sélectionnes. L’attribut capture du bouton photo est une indication au navigateur; sur PC un sélecteur de fichiers peut être proposé.
