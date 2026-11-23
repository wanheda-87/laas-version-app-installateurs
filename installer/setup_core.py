#!/usr/bin/env python3
"""Noyau d'installation locale : base SQLite vierge + 1 à 3 comptes d'accès.

Fonctionne sur Windows et sur Linux : le raccourci adapté à la plateforme est créé
après le lanceur (.lnk Windows, .desktop Linux). Aucun réseau, aucun serveur,
aucun document, aucun secret écrit en clair.
Les mots de passe sont dérivés avec PBKDF2-HMAC-SHA256, comme dans le serveur
de référence. Ce module est utilisable en tests sans interface graphique.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

import desktop_shortcut

MARKER_NAME = "library-id.json"
MARKER_SCHEMA_VERSION = 1
DB_NAME = "laas.sqlite3"
PBKDF2_ROUNDS = 310_000
SALT_BYTES = 16
MIN_PASSWORD_LENGTH = 10

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,64}$")


def default_data_dir() -> Path:
    """Emplacement par défaut : la base est créée dans le dossier personnel."""
    return Path.home() / "LaaSVersionApp-data"


def default_app_dir() -> Path:
    """Emplacement par défaut : le lanceur est créé dans le dossier personnel."""
    return Path.home() / "LaaSVersionApp"


def path_or_default(value: str | Path | None, fallback) -> Path:
    """Un champ laissé vide retombe sur son emplacement par défaut."""
    raw = str(value or "").strip()
    return Path(raw).expanduser() if raw else fallback()

# Schéma synchronisé avec reference/server-version/server.py. Aucune donnée.
SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS regions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#5c8cff',
 icon_path TEXT, mode TEXT NOT NULL DEFAULT 'offline',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS shelves (
 id TEXT PRIMARY KEY, region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
 name TEXT NOT NULL, icon_path TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pockets (
 id TEXT PRIMARY KEY, shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
 name TEXT NOT NULL, icon_path TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL,
 source_path TEXT, sha256 TEXT, link_url TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS document_pockets (
 document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
 pocket_id TEXT NOT NULL REFERENCES pockets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS users (
 email TEXT PRIMARY KEY, salt BLOB NOT NULL, password_hash BLOB NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
 target TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
CREATE TABLE IF NOT EXISTS document_chunks (
 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL, data BLOB NOT NULL,
 PRIMARY KEY(document_id, chunk_index)
);
"""

# Alias Windows conservés pour la compatibilité des anciens appels. L'écriture
# réelle du lanceur est déléguée à desktop_shortcut, qui choisit .bat ou .sh.
LAUNCHER_NAME = desktop_shortcut.WINDOWS_LAUNCHER_NAME
LAUNCHER_TEMPLATE = desktop_shortcut.WINDOWS_LAUNCHER_TEMPLATE


def normalize_identifier(raw: str) -> str:
    """Accepte une adresse e-mail ou un nom d'utilisateur simple."""
    value = str(raw or "").strip().lower()
    if not (EMAIL_RE.fullmatch(value) or USERNAME_RE.fullmatch(value)):
        raise ValueError(
            "Identifiant invalide : utilise une adresse e-mail ou un nom de 3 à 64 "
            "caractères (lettres, chiffres, point, tiret, soulignement)."
        )
    return value


def validate_password(password: str, confirmation: str | None = None) -> str:
    """Valide un mot de passe sans jamais le journaliser."""
    value = str(password or "")
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères.")
    if confirmation is not None and value != str(confirmation or ""):
        raise ValueError("Les deux mots de passe ne correspondent pas.")
    return value


def derive_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)


def check_password(password: str, salt: bytes, expected: bytes) -> bool:
    return hmac.compare_digest(derive_password(password, salt), expected)


def validate_accounts(accounts: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Normalise et valide 1 à 3 comptes, sans doublon d'identifiant."""
    if not 1 <= len(accounts) <= 3:
        raise ValueError("Choisis entre un et trois comptes d'accès.")
    cleaned: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw_identifier, raw_password in accounts:
        identifier = normalize_identifier(raw_identifier)
        password = validate_password(raw_password)
        if identifier in seen:
            raise ValueError(f"Identifiant en double : {identifier}")
        seen.add(identifier)
        cleaned.append((identifier, password))
    return cleaned


def _write_marker(data_dir: Path, account_count: int) -> Path:
    marker = data_dir / MARKER_NAME
    if marker.exists():
        raise FileExistsError(f"Marqueur déjà présent : {marker}. Rien n'a été écrasé.")
    payload = {
        "schemaVersion": MARKER_SCHEMA_VERSION,
        "libraryId": uuid.uuid4().hex,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "accountCount": account_count,
    }
    temporary = data_dir / f".{MARKER_NAME}.tmp"
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if os.name != "nt":
        os.chmod(temporary, 0o600)
    os.replace(temporary, marker)
    return marker


def _write_launcher(app_dir: Path | None) -> Path | None:
    if app_dir is None:
        return None
    folder = app_dir.expanduser().resolve()
    folder.mkdir(parents=True, exist_ok=True)
    return desktop_shortcut.write_launcher(folder)


def install(
    data_dir: str | Path,
    accounts: list[tuple[str, str]],
    *,
    app_dir: str | Path | None = None,
    create_launcher: bool = True,
    create_shortcut: bool = True,
    desktop_dir: str | Path | None = None,
) -> dict:
    """Crée une bibliothèque vide et ses comptes. Refuse d'écraser une base existante.

    Le lanceur est adapté à la plateforme : .bat sur Windows, .sh sur Linux.
    Le raccourci est demandé par défaut juste après, avec le même lanceur.
    Son échec éventuel est signalé mais ne détruit pas l'installation réussie.
    """
    cleaned_accounts = validate_accounts(accounts)
    data = Path(data_dir).expanduser().resolve()
    data.mkdir(parents=True, exist_ok=True)

    db_path = data / DB_NAME
    if db_path.exists():
        raise FileExistsError(f"Base déjà présente : {db_path}. Rien n'a été écrasé.")

    with sqlite3.connect(db_path) as connection:
        connection.executescript(SCHEMA_SQL)
        for identifier, password in cleaned_accounts:
            salt = secrets.token_bytes(SALT_BYTES)
            digest = derive_password(password, salt)
            connection.execute(
                "INSERT INTO users(email, salt, password_hash) VALUES(?,?,?)",
                (identifier, salt, digest),
            )
        connection.commit()
        result = connection.execute("PRAGMA quick_check").fetchone()[0]
    if result != "ok":
        raise sqlite3.DatabaseError(f"Contrôle d'intégrité échoué : {result}")
    if os.name != "nt":
        os.chmod(db_path, 0o600)

    marker = _write_marker(data, len(cleaned_accounts))
    target_app_dir = Path(app_dir) if create_launcher else None
    launcher = _write_launcher(target_app_dir)

    if create_launcher and create_shortcut:
        shortcut = desktop_shortcut.create_shortcut(
            launcher=launcher, app_dir=target_app_dir, desktop=desktop_dir
        )
    else:
        shortcut = {"status": "disabled", "reason": "not-requested", "path": None}

    return {
        "dataDir": str(data),
        "database": str(db_path),
        "marker": str(marker),
        "launcher": str(launcher) if launcher else None,
        "shortcut": shortcut,
        "identifiers": [identifier for identifier, _ in cleaned_accounts],
    }


def verify_install(data_dir: str | Path, accounts: list[tuple[str, str]] | None = None) -> dict:
    """Contrôle une installation sans jamais révéler de mot de passe."""
    data = Path(data_dir).expanduser().resolve()
    db_path = data / DB_NAME
    marker = data / MARKER_NAME
    if not db_path.is_file() or not marker.is_file():
        raise FileNotFoundError("Base ou marqueur absent.")
    payload = json.loads(marker.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != MARKER_SCHEMA_VERSION:
        raise ValueError("Version du marqueur inattendue.")
    with sqlite3.connect(db_path) as connection:
        if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise sqlite3.DatabaseError("Contrôle d'intégrité échoué.")
        rows = connection.execute("SELECT email, salt, password_hash FROM users").fetchall()
        documents = connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    if documents != 0:
        raise ValueError("La bibliothèque contient des documents : copie non conforme.")
    if accounts:
        for identifier, password in accounts:
            row = next((r for r in rows if r[0] == normalize_identifier(identifier)), None)
            if row is None or not check_password(password, row[1], row[2]):
                raise ValueError(f"Compte ou mot de passe invalide : {identifier}")
    return {"accounts": len(rows), "documents": documents, "libraryId": payload.get("libraryId")}
