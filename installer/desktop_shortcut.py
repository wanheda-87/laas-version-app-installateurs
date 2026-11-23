#!/usr/bin/env python3
"""Raccourci de lancement, sans dépendance tierce et sans réseau.

Windows : un vrai .lnk est créé par PowerShell via WScript.Shell.
Linux   : un fichier .desktop est créé dans le menu des applications et, si le
          dossier Bureau existe, une copie y est déposée.
Aucune plateforme n'installe de service, de démarrage automatique ou de port réseau.
"""
from __future__ import annotations

import base64
import os
import platform
import subprocess
from pathlib import Path

from shortcut_icon import ICON_B64, ICON_PNG_B64

SHORTCUT_NAME = "LaaS Version App.lnk"
ICON_NAME = "laas-icon.ico"

WINDOWS_LAUNCHER_NAME = "Lancer LaaS Version App.bat"
WINDOWS_LAUNCHER_TEMPLATE = """@echo off
setlocal
set "APP=%~dp0app\\laas-version-app.exe"
if exist "%APP%" (
  start "" "%APP%" %*
  exit /b 0
)
echo Application introuvable : %APP% 1>&2
exit /b 1
"""

LINUX_ICON_NAME = "laas-icon.png"
LINUX_LAUNCHER_NAME = "Lancer LaaS Version App.sh"
LINUX_MENU_FILE = "laas-version-app.desktop"
LINUX_DESKTOP_FILE = "LaaS Version App.desktop"
LINUX_LAUNCHER_TEMPLATE = """#!/bin/sh
set -eu
APP="$(dirname "$0")/app/laas-version-app"
if [ -x "$APP" ]; then
  # Nécessaire pour WebEngine dans une AppImage ou un environnement sans
  # espace utilisateur autorisé ; aucun réseau, aucun port, aucun serveur.
  QTWEBENGINE_DISABLE_SANDBOX="${QTWEBENGINE_DISABLE_SANDBOX:-1}"
  export QTWEBENGINE_DISABLE_SANDBOX
  exec "$APP" "$@"
fi
echo "Application introuvable : $APP" >&2
exit 1
"""

# Calculés une seule fois : les tests les remplacent sans changer os.name, qui
# modifierait aussi le type Path utilisé par pathlib.
IS_WINDOWS = os.name == "nt"
IS_LINUX = platform.system() == "Linux"


def write_icon(app_dir: Path) -> Path:
    """Écrit l'icône .ico à côté du lanceur Windows."""
    destination = Path(app_dir).expanduser().resolve() / ICON_NAME
    destination.write_bytes(base64.b64decode(ICON_B64))
    return destination


def write_png_icon(app_dir: Path) -> Path:
    """Écrit l'icône PNG à côté du lanceur Linux."""
    destination = Path(app_dir).expanduser().resolve() / LINUX_ICON_NAME
    destination.write_bytes(base64.b64decode(ICON_PNG_B64))
    return destination


def launcher_name() -> str:
    """Nom du lanceur adapté à la plateforme."""
    if IS_WINDOWS:
        return WINDOWS_LAUNCHER_NAME
    if IS_LINUX:
        return LINUX_LAUNCHER_NAME
    return WINDOWS_LAUNCHER_NAME


def write_windows_launcher(app_dir: Path) -> Path:
    """Écrit le lanceur .bat, sans écraser un lanceur déjà présent."""
    destination = Path(app_dir).expanduser().resolve() / WINDOWS_LAUNCHER_NAME
    if not destination.exists():
        destination.write_text(WINDOWS_LAUNCHER_TEMPLATE, encoding="utf-8")
    return destination


def write_linux_launcher(app_dir: Path) -> Path:
    """Écrit le lanceur shell exécutable utilisé par le .desktop Linux."""
    destination = Path(app_dir).expanduser().resolve() / LINUX_LAUNCHER_NAME
    if not destination.exists():
        destination.write_text(LINUX_LAUNCHER_TEMPLATE, encoding="utf-8")
    os.chmod(destination, 0o755)
    return destination


def write_launcher(app_dir: Path) -> Path:
    """Écrit un seul lanceur, adapté à la plateforme détectée."""
    if IS_WINDOWS:
        return write_windows_launcher(app_dir)
    if IS_LINUX:
        return write_linux_launcher(app_dir)
    return write_windows_launcher(app_dir)


def _run_powershell(script: str, *, timeout: int = 20) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        capture_output=True,
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def desktop_path() -> Path:
    """Retourne le Bureau Windows réel, y compris s'il est redirigé."""
    if IS_WINDOWS:
        try:
            script = (
                "[Convert]::ToBase64String("
                "[Text.Encoding]::UTF8.GetBytes("
                "[Environment]::GetFolderPath('Desktop')))"
            )
            result = _run_powershell(script, timeout=15)
            if result.returncode == 0:
                encoded = result.stdout.decode("ascii", "ignore").strip()
                candidate = base64.b64decode(encoded).decode("utf-8").strip()
                if candidate:
                    return Path(candidate)
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    return Path.home() / "Desktop"


def linux_desktop_dir() -> Path:
    """Retourne le dossier Bureau Linux déclaré par XDG, ou ~/Desktop."""
    configured = os.environ.get("XDG_DESKTOP_DIR")
    return Path(configured).expanduser() if configured else Path.home() / "Desktop"


def _quote(value: str | Path) -> str:
    """Échappe une chaîne pour un littéral simple entre guillemets PowerShell."""
    return "'" + str(value).replace("'", "''") + "'"


def _quote_exec(value: str | Path) -> str:
    """Échappe un chemin pour la clé Exec d'un fichier .desktop."""
    text = (
        str(value)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("$", "\\$")
        .replace("`", "\\`")
    )
    return '"' + text + '"'


def powershell_script(
    *, shortcut: Path, target: Path, working_dir: Path, icon: Path | None = None
) -> str:
    """Construit le script de création du .lnk (fonction pure, testable partout)."""
    lines = [
        "$ErrorActionPreference = 'Stop'",
        "$shell = New-Object -ComObject WScript.Shell",
        f"$shortcut = $shell.CreateShortcut({_quote(shortcut)})",
        f"$shortcut.TargetPath = {_quote(target)}",
        f"$shortcut.WorkingDirectory = {_quote(working_dir)}",
        "$shortcut.Description = 'Ouvrir LaaS version app'",
    ]
    if icon is not None:
        lines.append(f"$shortcut.IconLocation = {_quote(str(icon) + ',0')}")
    lines.extend(["$shortcut.Save()", "Write-Output 'OK'"])
    return "\n".join(lines)


def desktop_entry_text(*, launcher: Path, icon: Path) -> str:
    """Construit le contenu du fichier .desktop (fonction pure, testable partout)."""
    return "\n".join(
        [
            "[Desktop Entry]",
            "Type=Application",
            "Version=1.0",
            "Name=LaaS Version App",
            "Comment=Ouvrir LaaS version app",
            f"Exec={_quote_exec(launcher)}",
            f"Icon={icon}",
            "Terminal=false",
            "Categories=Utility;",
            "StartupNotify=true",
            "",
        ]
    )


def create_windows_shortcut(
    *, folder: Path, target: Path, desktop: str | Path | None = None
) -> dict:
    """Crée le .lnk Windows et retourne un état sans jamais lever d'exception."""
    icon = write_icon(folder)
    bureau = (Path(desktop) if desktop is not None else desktop_path()).expanduser().resolve()
    shortcut = bureau / SHORTCUT_NAME
    try:
        result = _run_powershell(
            powershell_script(shortcut=shortcut, target=target, working_dir=folder, icon=icon)
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"status": "failed", "reason": str(exc), "path": str(shortcut), "icon": str(icon)}
    if result.returncode != 0:
        reason = result.stderr.decode("utf-8", "replace").strip() or f"code {result.returncode}"
        return {"status": "failed", "reason": reason, "path": str(shortcut), "icon": str(icon)}
    if not shortcut.is_file():
        return {
            "status": "failed",
            "reason": "Le fichier .lnk n'a pas été créé.",
            "path": str(shortcut),
            "icon": str(icon),
        }
    return {"status": "created", "path": str(shortcut), "icon": str(icon)}


def create_linux_shortcut(
    *, app_dir: Path, desktop: str | Path | None = None, launcher: Path | None = None
) -> dict:
    """Crée l'entrée de menu Linux et une copie sur le Bureau s'il existe."""
    folder = Path(app_dir).expanduser().resolve()
    if launcher is not None and Path(launcher).resolve().suffix == ".sh":
        choix = Path(launcher).expanduser().resolve()
        os.chmod(choix, 0o755)
    else:
        choix = write_linux_launcher(folder)
    icon = write_png_icon(folder)
    content = desktop_entry_text(launcher=choix, icon=icon)

    data_home = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local/share")).expanduser()
    applications = data_home / "applications"
    applications.mkdir(parents=True, exist_ok=True)
    menu_entry = applications / LINUX_MENU_FILE
    menu_entry.write_text(content, encoding="utf-8")
    os.chmod(menu_entry, 0o755)

    bureau = Path(desktop).expanduser().resolve() if desktop is not None else linux_desktop_dir()
    on_desktop = None
    if bureau.is_dir():
        on_desktop = bureau / LINUX_DESKTOP_FILE
        on_desktop.write_text(content, encoding="utf-8")
        os.chmod(on_desktop, 0o755)

    return {
        "status": "created",
        "path": str(on_desktop or menu_entry),
        "menu": str(menu_entry),
        "desktop": str(on_desktop) if on_desktop else None,
        "launcher": str(choix),
        "icon": str(icon),
    }


def create_shortcut(
    *,
    launcher: Path | None,
    app_dir: Path | None,
    desktop: str | Path | None = None,
) -> dict:
    """Crée le raccourci adapté à la plateforme. Ne lève pas d'exception bloquante."""
    if launcher is None or app_dir is None:
        return {"status": "skipped", "reason": "no-launcher", "path": None}

    folder = Path(app_dir).expanduser().resolve()
    target = Path(launcher).expanduser().resolve()
    if not target.is_file():
        return {"status": "skipped", "reason": "launcher-missing", "path": None}

    if IS_WINDOWS:
        return create_windows_shortcut(folder=folder, target=target, desktop=desktop)
    if IS_LINUX:
        return create_linux_shortcut(app_dir=folder, desktop=desktop, launcher=target)
    return {"status": "skipped", "reason": "unsupported-platform", "path": None}
