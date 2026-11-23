# Installer LaaS version app sur Linux

Le même `setup.py` fonctionne sur Windows et sur Linux. Sur Linux, l’assistant crée en plus
un lanceur `.sh` et un fichier `.desktop` avec le logo d’oiseau.

## Méthode simple : avec Python

Sur une machine Linux avec Python 3.11 ou plus récent :

```sh
cd installer
chmod +x setup.sh
./setup.sh
```

Si Tkinter n’est pas installé, le script l’indique et propose le mode sans interface :

```sh
./setup.sh --headless --account "nom:motdepasse-long"
```

Entre un et trois comptes peuvent être créés, chacun avec son mot de passe. Les mots de passe
ne sont jamais écrits en clair.

## Binaire autonome avec PyInstaller

Pour obtenir un seul fichier exécutable, sans Python à installer chez l’utilisateur :

```sh
cd installer
python3 -m pip install pyinstaller
python3 -m PyInstaller --onefile --name setup setup.py
```

Le fichier à envoyer est alors :

```text
installer/dist/setup
```

Il s’appelle `setup`, sans extension `.exe`. L’icône du raccourci est intégrée au code source :
aucun `--add-data` supplémentaire n’est nécessaire.

## Ce qui est créé sur Linux

Avec les emplacements par défaut :

```text
~/LaaSVersionApp-data/laas.sqlite3
~/LaaSVersionApp-data/library-id.json
~/LaaSVersionApp/Lancer LaaS Version App.sh
~/LaaSVersionApp/laas-icon.png
~/.local/share/applications/laas-version-app.desktop
```

Une copie du `.desktop` est aussi déposée dans `$XDG_DESKTOP_DIR` ou `~/Desktop` **si ce
dossier existe déjà**. Aucun dossier Bureau n’est créé artificiellement. Le lanceur `.sh`
exécutera `app/laas-version-app` quand ce binaire existera ; jusqu’à là, il affiche un message
clair.

## Vérification après installation

1. Lancer `./setup.sh` ou le binaire `dist/setup`.
2. Vérifier la base, le marqueur, le lanceur `.sh` et l’icône PNG.
3. Ouvrir le menu des applications : l’entrée « LaaS Version App » doit apparaître.
4. Si le dossier Bureau existe, vérifier la copie du raccourci dessus.
5. Noter l’avertissement : **ne pas oublier les identifiants et mots de passe**.

Aucun port, aucun tunnel et aucun appel réseau ne sont utilisés.
