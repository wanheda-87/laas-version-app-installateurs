# Construire le vrai `setup.exe` sur Windows

Pour Linux, voir `build-linux.md` : le même `setup.py` y produit un binaire `setup`.

Cette machine Linux ne dispose d'aucune chaîne de compilation Windows : il est donc
**impossible de produire ici un exécutable PE valide**. Le dossier contient l'installateur
complet en Python ; la conversion en `setup.exe` doit se faire sur Windows.

## Méthode simple (PyInstaller)

Sur le PC Windows, avec Python 3.11 ou plus récent :

```bat
cd installer
py -m pip install pyinstaller
py -m PyInstaller --onefile --noconsole --name setup setup.py
```

Le fichier à envoyer est alors :

```text
installer\dist\setup.exe
```

Tu peux le renommer `setp.exe` si tu préfères, mais `setup.exe` est le nom standard.

## Double-clic sans compilation

En attendant, `setup.bat` fait exactement la même chose si Python est installé sur le PC :

```text
installer\setup.bat
```

## Vérification après construction

1. Copier `setup.exe` seul dans un dossier neuf.
2. Le lancer : l'assistant doit demander 1, 2 ou 3 comptes.
3. Choisir un dossier de données temporaire pour l'essai.
4. Vérifier que la base `laas.sqlite3` et le marqueur `library-id.json` apparaissent.
5. Noter que l'assistant affiche un avertissement : **ne pas oublier les identifiants
   et mots de passe**, qui ne sont jamais écrits en clair.
6. Vérifier que le raccourci **« LaaS Version App »** apparaît sur le Bureau, avec le logo
   d'oiseau, et qu'il ouvre le lanceur `LaaSVersionApp\Lancer LaaS Version App.bat`.

L'icône du raccourci est intégrée au code source (`installer/shortcut_icon.py`) : la commande
PyInstaller ci-dessus reste donc exacte, sans `--add-data` supplémentaire. Le raccourci est
créé par défaut ; l'option avancée `--no-shortcut` permet de le désactiver.

Aucune signature de code n'est appliquée : Windows peut afficher un avertissement SmartScreen
pour un fichier non signé. Ce n'est pas un défaut de l'installateur.
