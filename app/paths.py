#!/usr/bin/env python3
"""Repérage local de la bibliothèque — aucun réseau, aucun secret.

L'installateur écrit le chemin choisi dans un petit fichier de configuration
utilisateur (jamais versionné). L'application le relit à l'ouverture. Les
valeurs par défaut restent celles de l'installateur :
``LaaSVersionApp-data`` et ``LaaSVersionApp`` dans le dossier personnel.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

CONFIG_NAME = "paths.json"
ENV_DATA_DIR = "LAAS_DATA_DIR"


def config_path() -> Path:
    """Emplacement de la configuration locale, hors du dépôt et de la base."""
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or (Path.home() / ".config"))
    return base / "laas-version-app" / CONFIG_NAME


def default_data_dir() -> Path:
    return Path.home() / "LaaSVersionApp-data"


def default_app_dir() -> Path:
    return Path.home() / "LaaSVersionApp"


def write_data_dir(data_dir: str | Path) -> Path:
    """Enregistre le dossier de données choisi pendant l'installation."""
    destination = config_path()
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = {"data_dir": str(Path(data_dir).expanduser().resolve())}
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    if os.name != "nt":
        os.chmod(temporary, 0o600)
    os.replace(temporary, destination)
    return destination


def read_data_dir() -> Path:
    """Retourne le dossier de données : variable d'environnement, config, défaut."""
    from_env = os.environ.get(ENV_DATA_DIR, "").strip()
    if from_env:
        return Path(from_env).expanduser()
    try:
        payload = json.loads(config_path().read_text(encoding="utf-8"))
        raw = str(payload.get("data_dir", "")).strip()
        if raw:
            return Path(raw).expanduser()
    except (OSError, ValueError, AttributeError):
        pass
    return default_data_dir()


def web_root() -> Path:
    """Dossier de l'interface, tel qu'embarqué par PyInstaller ou en développement."""
    frozen = getattr(sys, "frozen", False)
    if frozen:
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        return base / "web"
    return Path(__file__).resolve().parent / "web"
