#!/bin/sh
# Lance l'assistant d'installation LaaS version app sur Linux.
set -eu

cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python 3 est introuvable. Installe Python 3.11 ou plus recent, puis relance."
  exit 1
fi

if [ "$#" -eq 0 ]; then
  if "$PY" -c 'import tkinter' >/dev/null 2>&1; then
    exec "$PY" setup.py
  fi
  echo "Tkinter est absent : l'interface graphique ne peut pas s'ouvrir."
  echo "Utilise la ligne de commande, par exemple :"
  echo "  ./setup.sh --headless --account \"nom:motdepasse-long\""
  echo "Ou installe le paquet systeme fournissant Tkinter (python3-tk sur Debian/Ubuntu)."
  exit 2
fi

exec "$PY" setup.py "$@"
