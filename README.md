# LaaS version app — téléchargements

Bienvenue. Ce dépôt contient les **installateurs prêts à télécharger**. Tu n’as rien à installer,
rien à taper et aucun code à connaître : tu télécharges un fichier, tu double-cliques, puis tu
suis les écrans.

## 1. Choisis ton fichier

| Ton ordinateur | Fichier à télécharger | Ce que tu fais |
|---|---|---|
| **Windows** | `setup.exe` | Double-clic dessus |
| **Linux** | `LaaS-Version-App-x86_64.AppImage` | Autorise l’exécution si ton bureau le demande, puis double-clic |
| Linux, autre méthode | `setup-linux` | Rend-le exécutable, puis double-clic |

Les fichiers sont dans la section **Releases** à droite de cette page, sur la dernière version.

Lien direct vers la version actuelle :
https://github.com/wanheda-87/laas-version-app-installateurs/releases/tag/v1.0.0

## 2. Pendant l’installation

L’assistant te demande **1, 2 ou 3 comptes** : un identifiant et un mot de passe pour chaque
personne. Écris-les quelque part : **il n’y a pas de récupération automatique**.

Les deux emplacements sont déjà remplis. Tu peux laisser les valeurs proposées et cliquer
**Suivant** jusqu’à la fin.

À la fin, un raccourci **LaaS Version App** avec le logo d’oiseau apparaît :
- sur le Bureau sous Windows ;
- dans le menu des applications sous Linux, et sur le Bureau si ce dossier existe déjà.

## 3. Ce que fait l’installateur

Il crée une bibliothèque **vide** dans ton dossier personnel :

```text
LaaSVersionApp-data\laas.sqlite3
LaaSVersionApp-data\library-id.json
LaaSVersionApp\Lancer LaaS Version App.bat     (Windows)
LaaSVersionApp/Lancer LaaS Version App.sh      (Linux)
```

Aucun document, aucune photo, aucun compte en ligne n’est ajouté. L’application ne se connecte
pas à Internet, n’ouvre aucun port et ne demande aucun compte tiers.

## Limite importante, dite simplement

Ces installateurs préparent la bibliothèque et le raccourci. **L’interface de l’application
n’est pas encore incluse dans ce paquet.** Tant que le binaire de l’application n’aura pas été
ajouté, le raccourci affichera un message clair au lieu d’ouvrir l’interface.

## Vérifier le fichier téléchargé (facultatif)

Le fichier `SHA256SUMS.txt` accompagne chaque version. Sur Linux :

```sh
sha256sum -c SHA256SUMS.txt
```

Sur Windows, l’antivirus peut afficher un avertissement SmartScreen pour un fichier signé par
un éditeur inconnu : c’est attendu pour un programme distribué en dehors du Microsoft Store.

## Pour les curieux

Les binaires sont compilés automatiquement par GitHub dans
`.github/workflows/build-installers.yml` : une machine Windows produit le vrai `setup.exe`, une
machine Linux produit le binaire et l’AppImage. Le code source de l’installateur est dans
`installer/`. Le reste du projet reste dans un dépôt privé séparé.

Ce dépôt est public à la demande explicite de l’utilisateur, uniquement pour permettre le
téléchargement sans compte supplémentaire. Aucun mot de passe, jeton ou donnée personnelle n’y
est présent.
