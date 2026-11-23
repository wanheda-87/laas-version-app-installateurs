#!/usr/bin/env python3
"""Noyau local de l'application LaaS — liste d'actions FERMÉE, sans réseau.

Aucun `HTTPServer`, aucun port, aucune écoute : ce module reçoit une description
d'appel (méthode, chemin, corps) et renvoie une réponse en mémoire. Il reproduit
le contrat de `reference/server-version/server.py` pour le cœur : connexion,
régions, étagères, poches, documents, import, recherche (via /api/state), lecture
et thèmes (côté interface).

Les actions sensibles restent derrière une confirmation ou un mot de passe côté
interface. Il n'y a volontairement aucun interpréteur de commandes, aucun `eval`
et aucun chemin d'action libre : seules les routes ci-dessous existent.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import re
import secrets
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default as email_policy
from pathlib import Path
from urllib.parse import parse_qs, unquote

DB_NAME = "laas.sqlite3"
MARKER_NAME = "library-id.json"
ICON_DIR_NAME = "collection-icons"
MAX_JSON_BODY = 2_000_000
MAX_UPLOAD_BODY = 1_073_741_824
PBKDF2_ROUNDS = 310_000
SESSION_LIFETIME = 43_200
SESSION_IDLE = 3_600
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW = 300
HEX_ID = re.compile(r"^[a-f0-9]{32}$")
ICON_NAME = re.compile(r"^[a-f0-9]{32}\.(jpg|png|webp)$")

COLLECTIONS = {
    "regions": ("regions", "region_created", "region_renamed", "region_deleted"),
    "shelves": ("shelves", "shelf_created", "shelf_renamed", "shelf_deleted"),
    "pockets": ("pockets", "pocket_created", "pocket_renamed", "pocket_deleted"),
}


class _ConnectionContext:
    """Contexte qui commit/rollback puis FERME la connexion SQLite.

    ``with sqlite3.connect(...)`` ne ferme pas la connexion ; dans une fenêtre
    ouverte longtemps, cela laisserait un descripteur par action. Ce petit
    wrapper garde la syntaxe ``with self.db() as con`` tout en garantissant
    la fermeture.
    """

    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def __enter__(self) -> sqlite3.Connection:
        return self.connection

    def __exit__(self, exc_type, exc, traceback) -> None:
        if exc_type is None:
            self.connection.commit()
        else:
            self.connection.rollback()
        self.connection.close()


class ApiError(Exception):
    """Erreur d'action fermée, traduite en réponse JSON."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass
class ApiResponse:
    status: int = 200
    content_type: str = "application/json; charset=utf-8"
    body: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)


def _json_response(payload: object, status: int = 200) -> ApiResponse:
    return ApiResponse(
        status=status,
        body=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    )


def _error(message: str, status: int = 400) -> ApiResponse:
    return _json_response({"error": message}, status)


def _ok(**extra: object) -> ApiResponse:
    return _json_response({"ok": True, **extra})


def _clean_name(raw: str) -> str:
    name = Path(str(raw or "")).name.strip()
    if not name:
        raise ApiError("Nom de fichier invalide.")
    return name[:255]


def _new_id() -> str:
    return uuid.uuid4().hex


def _parse_multipart(body: bytes, content_type: str) -> list[tuple[str | None, str | None, bytes, str]]:
    """Parse multipart/form-data sans dépendance tierce, comme le serveur source."""
    header = (
        "Content-Type: " + content_type.replace("\r", "").replace("\n", "") + "\r\n"
        "MIME-Version: 1.0\r\n\r\n"
    ).encode("latin-1", errors="replace")
    message = BytesParser(policy=email_policy).parsebytes(header + body)
    parts: list[tuple[str | None, str | None, bytes, str]] = []
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        filename = part.get_param("filename", header="content-disposition")
        payload = part.get_payload(decode=True) or b""
        parts.append((name, filename, payload, part.get_content_type()))
    return parts


def _form_values(parts: list[tuple[str | None, str | None, bytes, str]]) -> dict[str, str]:
    values: dict[str, str] = {}
    for name, filename, payload, _content_type in parts:
        if name and filename is None:
            values[name] = payload.decode("utf-8", errors="replace")
    return values


def _magic_extension(payload: bytes) -> str:
    if payload.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return ".webp"
    return ""


class LocalApi:
    """Dispatcher fermé : une seule entrée `handle`, aucune écoute réseau."""

    def __init__(self, data_dir: str | Path, web_root: str | Path | None = None):
        self.data_dir = Path(data_dir).expanduser().resolve()
        self.web_root = Path(web_root).resolve() if web_root else None
        self.user: str | None = None
        self.session_id: str | None = None
        self._session_started = 0.0
        self._last_seen = 0.0
        self._failures: dict[str, list[float]] = {}

    # ------------------------------------------------------------------ base
    @property
    def db_path(self) -> Path:
        return self.data_dir / DB_NAME

    @property
    def icon_dir(self) -> Path:
        return self.data_dir / ICON_DIR_NAME

    def check_library(self) -> None:
        """Refuse une bibliothèque absente ; ne crée jamais de base vide ici."""
        if not (self.data_dir / MARKER_NAME).is_file():
            raise ApiError("Marqueur de bibliothèque absent. Aucune bibliothèque vide ne sera créée.", 503)
        if not self.db_path.is_file():
            raise ApiError("Base de données absente. Rien n'a été créé automatiquement.", 503)

    def db(self) -> _ConnectionContext:
        self.check_library()
        con = sqlite3.connect(self.db_path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        return _ConnectionContext(con)

    def close(self) -> None:
        self.user = None
        self.session_id = None
        self._failures.clear()

    # --------------------------------------------------------------- session
    def _session_valid(self) -> bool:
        if not self.user:
            return False
        now = time.monotonic()
        if now - self._last_seen > SESSION_IDLE or now - self._session_started > SESSION_LIFETIME:
            self.close()
            return False
        self._last_seen = now
        return True

    def _current_user(self) -> str | None:
        return self.user if self._session_valid() else None

    def _require_user(self) -> str:
        user = self._current_user()
        if not user:
            raise ApiError("Connecte-toi pour accéder à ta bibliothèque.", 401)
        return user

    def _new_session(self, email: str) -> None:
        self.user = email
        self.session_id = secrets.token_hex(8)
        now = time.monotonic()
        self._session_started = now
        self._last_seen = now
        self._failures.pop(email, None)

    def _record(self, con: sqlite3.Connection, action: str, target: str = "") -> None:
        con.execute(
            "INSERT INTO audit_events(actor,action,target) VALUES(?,?,?)",
            (self.user or "local", action, str(target)[:200]),
        )
        con.execute(
            "DELETE FROM audit_events WHERE datetime(created_at) < datetime('now','-30 days')"
        )

    def _too_many_failures(self, email: str) -> bool:
        now = time.monotonic()
        recent = [t for t in self._failures.get(email, []) if now - t < LOGIN_WINDOW]
        self._failures[email] = recent
        return len(recent) >= LOGIN_MAX_FAILURES

    # --------------------------------------------------------------- dispatch
    def handle(
        self,
        method: str,
        path: str,
        query: str = "",
        body: bytes = b"",
        content_type: str = "",
        extra_headers: dict[str, str] | None = None,
    ) -> ApiResponse:
        method = (method or "GET").upper()
        path = unquote(path)
        if "?" in path:  # un appel peut fournir la query dans le chemin
            path, _, embedded = path.partition("?")
            query = embedded + (("&" + query) if query else "")
        if not path.startswith("/"):
            path = "/" + path
        try:
            response = self._dispatch(method, path, query, body, content_type,
                                      extra_headers or {})
        except ApiError as exc:
            response = _error(exc.message, exc.status)
        except (ValueError, json.JSONDecodeError) as exc:
            response = _error(str(exc) or "Requête invalide.", 400)
        except sqlite3.Error as exc:
            response = _error(f"Erreur de bibliothèque : {exc}", 500)
        except Exception as exc:  # derniere garde : jamais de trace affichée à l'utilisateur
            response = _error(f"Erreur inattendue : {exc}", 500)
        # L'interface refuse un texte > 5 Mo en lisant Content-Length (app.js).
        # Le shim reconstruisant la Response avec ces mêmes en-têtes et ces mêmes
        # octets, la valeur doit être calculée ici, sur le corps utile.
        response.headers.setdefault("Content-Length", str(len(response.body)))
        return response

    def _dispatch(
        self,
        method: str,
        path: str,
        query: str,
        body: bytes,
        content_type: str,
        headers: dict[str, str],
    ) -> ApiResponse:
        # Actions fermées : le chemin est comparé à une liste connue, jamais exécuté.
        if method == "GET" and path == "/":
            return self._static("/index.html")
        if method == "GET" and path.startswith("/assets/"):
            return self._static(path)

        if method == "GET" and path == "/api/auth/status":
            return _json_response({"user": self._current_user()})
        if method == "POST" and path == "/api/auth/login":
            return self._login(body)
        if method == "POST" and path == "/api/auth/setup":
            return self._setup(body)
        if method == "POST" and path == "/api/auth/logout":
            self.close()
            return _ok()
        if method == "POST" and path == "/api/auth/change-password":
            return self._change_password(body)

        if method == "GET" and path == "/api/state":
            return self._state()
        if method == "GET" and path.startswith("/api/icons/"):
            return self._icon(path)
        if method == "GET" and path.startswith("/api/cover/"):
            return self._cover(path, query)
        if method == "GET" and path.startswith("/api/file/"):
            return self._file(path, query, headers)

        if method == "POST" and path.startswith("/api/"):
            table = path[len("/api/"):]
            if table in COLLECTIONS:
                return self._create_collection(table, body, content_type)
        if method == "POST" and path == "/api/links":
            return self._create_link(body)
        if method == "POST" and path == "/api/upload":
            return self._upload(body, content_type)

        match = re.fullmatch(r"/api/documents/([^/]+)/transfer", path)
        if method == "POST" and match:
            return self._transfer(match.group(1), body)

        match = re.fullmatch(r"/api/(regions|shelves|pockets)/([^/]+)", path)
        if method == "PATCH" and match:
            return self._rename_collection(match.group(1), match.group(2), body, content_type)
        if method == "DELETE" and match:
            return self._delete_collection(match.group(1), match.group(2))

        match = re.fullmatch(r"/api/documents/([^/]+)", path)
        if method == "DELETE" and match:
            return self._delete_document(match.group(1))

        return _error("Action inconnue.", 404)

    # ------------------------------------------------------------------ static
    def _static(self, path: str) -> ApiResponse:
        if self.web_root is None:
            return _error("Interface introuvable.", 404)
        relative = path.lstrip("/")
        target = (self.web_root / unquote(relative)).resolve()
        root = self.web_root.resolve()
        if target != root and root not in target.parents:
            return _error("Fichier hors périmètre.", 404)
        if not target.is_file():
            return _error("Introuvable.", 404)
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if mime.startswith("text/") or mime in ("application/javascript",):
            mime += "; charset=utf-8"
        return ApiResponse(status=200, content_type=mime, body=target.read_bytes())

    # ------------------------------------------------------------ auth routes
    def _body_json(self, body: bytes) -> dict:
        if len(body) > MAX_JSON_BODY:
            raise ApiError("Requête trop volumineuse.", 413)
        if not body:
            return {}
        payload = json.loads(body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ApiError("Requête invalide.")
        return payload

    def _identity(self, payload: dict) -> tuple[str, str]:
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        if not email or not password:
            raise ApiError("Identifiant et mot de passe requis.")
        return email, password

    def _setup(self, body: bytes) -> ApiResponse:
        email, password = self._identity(self._body_json(body))
        if len(password) < 10:
            raise ApiError("Le mot de passe doit contenir au moins 10 caractères.")
        with self.db() as con:
            if con.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                return _error("Ce compte existe déjà.", 409)
            salt = secrets.token_bytes(16)
            digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
            con.execute(
                "INSERT INTO users(email,salt,password_hash) VALUES(?,?,?)",
                (email, salt, digest),
            )
            self._new_session(email)
            self._record(con, "account_created", email)
        return _json_response({"ok": True, "user": email}, 201)

    def _login(self, body: bytes) -> ApiResponse:
        email, password = self._identity(self._body_json(body))
        if self._too_many_failures(email):
            raise ApiError("Trop de tentatives. Réessaie dans quelques minutes.", 429)
        with self.db() as con:
            row = con.execute(
                "SELECT salt,password_hash FROM users WHERE email=?", (email,)
            ).fetchone()
        if not row:
            return _error("Configure d'abord le mot de passe de ce compte.", 409)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), row["salt"], PBKDF2_ROUNDS)
        if not hmac.compare_digest(digest, row["password_hash"]):
            self._failures.setdefault(email, []).append(time.monotonic())
            with self.db() as con:
                self._record(con, "login_failed", email)
            raise ApiError("Identifiant ou mot de passe incorrect.", 403)
        self._new_session(email)
        with self.db() as con:
            self._record(con, "login", email)
        return _json_response({"ok": True, "user": email}, 201)

    def _change_password(self, body: bytes) -> ApiResponse:
        user = self._require_user()
        payload = self._body_json(body)
        old = str(payload.get("old_password", ""))
        new = str(payload.get("password", ""))
        if len(new) < 10:
            raise ApiError("Le mot de passe doit contenir au moins 10 caractères.")
        with self.db() as con:
            row = con.execute(
                "SELECT salt,password_hash FROM users WHERE email=?", (user,)
            ).fetchone()
            if not row:
                raise ApiError("Compte introuvable.", 404)
            old_digest = hashlib.pbkdf2_hmac("sha256", old.encode("utf-8"), row["salt"], PBKDF2_ROUNDS)
            if not hmac.compare_digest(old_digest, row["password_hash"]):
                raise ApiError("Ancien mot de passe incorrect.", 403)
            salt = secrets.token_bytes(16)
            digest = hashlib.pbkdf2_hmac("sha256", new.encode("utf-8"), salt, PBKDF2_ROUNDS)
            con.execute(
                "UPDATE users SET salt=?,password_hash=? WHERE email=?", (salt, digest, user)
            )
            self._record(con, "password_changed", user)
        return _ok()

    # ------------------------------------------------------------------- state
    def _state(self) -> ApiResponse:
        self._require_user()
        with self.db() as con:
            regions = [dict(row) for row in con.execute(
                "SELECT * FROM regions ORDER BY created_at, name"
            )]
            shelves = [dict(row) for row in con.execute(
                "SELECT s.*, (SELECT COUNT(*) FROM documents d WHERE d.shelf_id=s.id) "
                "AS document_count FROM shelves s ORDER BY s.created_at, s.name"
            )]
            pockets = [dict(row) for row in con.execute(
                "SELECT * FROM pockets ORDER BY created_at, name"
            )]
            documents = [dict(row) for row in con.execute(
                "SELECT d.id,d.shelf_id,dp.pocket_id,d.name,d.mime,d.size,d.created_at,"
                "d.source_path,d.link_url FROM documents d "
                "LEFT JOIN document_pockets dp ON dp.document_id=d.id "
                "ORDER BY d.created_at DESC"
            )]
            used = con.execute("SELECT COALESCE(SUM(size),0) FROM documents").fetchone()[0]
        for collection_name, items in (("regions", regions), ("shelves", shelves), ("pockets", pockets)):
            for item in items:
                icon_path = item.pop("icon_path", None)
                if icon_path:
                    item["icon_url"] = f"/api/icons/{collection_name}/{item['id']}"
        return _json_response({
            "regions": regions,
            "shelves": shelves,
            "pockets": pockets,
            "documents": documents,
            "used": used,
        })

    # ------------------------------------------------------------------ icons
    def _icon(self, path: str) -> ApiResponse:
        self._require_user()
        bits = path.strip("/").split("/")
        if len(bits) != 4 or bits[2] not in COLLECTIONS or not HEX_ID.fullmatch(bits[3]):
            return _error("Icône introuvable.", 404)
        table = bits[2]
        with self.db() as con:
            row = con.execute(f"SELECT icon_path FROM {table} WHERE id=?", (bits[3],)).fetchone()
        if not row or not row["icon_path"] or not ICON_NAME.fullmatch(row["icon_path"]):
            return _error("Icône introuvable.", 404)
        target = (self.icon_dir / row["icon_path"]).resolve()
        if self.icon_dir.resolve() not in target.parents:
            return _error("Icône introuvable.", 404)
        if not target.is_file():
            return _error("Icône introuvable.", 404)
        mime = mimetypes.guess_type(target.name)[0] or "image/jpeg"
        return ApiResponse(status=200, content_type=mime, body=target.read_bytes())

    def _save_icon(self, payload: bytes) -> str | None:
        extension = _magic_extension(payload)
        if not extension or len(payload) > 8_000_000:
            raise ApiError("Icône invalide : utilise un JPG, PNG ou WebP de moins de 8 Mo.")
        self.icon_dir.mkdir(parents=True, exist_ok=True)
        name = _new_id() + extension
        (self.icon_dir / name).write_bytes(payload)
        return name

    def _delete_icon(self, name: str | None) -> None:
        if name and ICON_NAME.fullmatch(name):
            (self.icon_dir / name).unlink(missing_ok=True)

    # --------------------------------------------------------- collection CRUD
    def _collection_body(self, body: bytes, content_type: str) -> tuple[dict, bytes | None]:
        if "multipart/form-data" in content_type.lower():
            if len(body) > 8_000_000 + 65_536:
                raise ApiError("Formulaire trop volumineux.", 413)
            parts = _parse_multipart(body, content_type)
            values = _form_values(parts)
            icon = next((payload for name, filename, payload, _t in parts
                         if name == "icon" and filename), None)
            return values, icon
        return self._body_json(body), None

    def _create_collection(self, path: str, body: bytes, content_type: str) -> ApiResponse:
        self._require_user()
        table = path.strip("/").split("/")[-1]
        if table not in COLLECTIONS:
            return _error("Action inconnue.", 404)
        values, icon_payload = self._collection_body(body, content_type)
        name = str(values.get("name", "")).strip()
        if not 1 <= len(name) <= 100:
            raise ApiError("Le nom doit contenir entre 1 et 100 caractères.")
        icon_path = self._save_icon(icon_payload) if icon_payload else None
        new_id = _new_id()
        try:
            with self.db() as con:
                parent = None
                if table == "shelves":
                    parent = str(values.get("region_id", ""))
                    if not HEX_ID.fullmatch(parent) or not con.execute(
                        "SELECT 1 FROM regions WHERE id=?", (parent,)
                    ).fetchone():
                        raise ApiError("Rayon introuvable.", 404)
                elif table == "pockets":
                    parent = str(values.get("shelf_id", ""))
                    if not HEX_ID.fullmatch(parent) or not con.execute(
                        "SELECT 1 FROM shelves WHERE id=?", (parent,)
                    ).fetchone():
                        raise ApiError("Étagère introuvable.", 404)
                if table == "regions":
                    mode = str(values.get("mode", "offline"))
                    mode = mode if mode in ("online", "offline") else "offline"
                    color = str(values.get("color") or "#5c8cff")
                    con.execute(
                        "INSERT INTO regions(id,name,color,icon_path,mode) VALUES(?,?,?,?,?)",
                        (new_id, name, color, icon_path, mode),
                    )
                elif table == "shelves":
                    con.execute(
                        "INSERT INTO shelves(id,region_id,name,icon_path) VALUES(?,?,?,?)",
                        (new_id, parent, name, icon_path),
                    )
                else:
                    con.execute(
                        "INSERT INTO pockets(id,shelf_id,name,icon_path) VALUES(?,?,?,?)",
                        (new_id, parent, name, icon_path),
                    )
                self._record(con, COLLECTIONS[table][1], name)
        except Exception:
            self._delete_icon(icon_path)
            raise
        result: dict[str, object] = {"id": new_id, "name": name}
        if table == "regions":
            result["mode"] = mode
        return _json_response(result, 201)

    def _rename_collection(self, table: str, item_id: str, body: bytes, content_type: str) -> ApiResponse:
        self._require_user()
        if table not in COLLECTIONS or not HEX_ID.fullmatch(item_id):
            return _error("Élément introuvable.", 404)
        values, icon_payload = self._collection_body(body, content_type)
        name = str(values.get("name", "")).strip()
        if not 1 <= len(name) <= 100:
            raise ApiError("Le nom doit contenir entre 1 et 100 caractères.")
        if icon_payload and str(values.get("clear_icon", "")) == "1":
            raise ApiError("Choisis soit une nouvelle icône, soit sa suppression.")
        with self.db() as con:
            row = con.execute(
                f"SELECT name,icon_path FROM {table} WHERE id=?", (item_id,)
            ).fetchone()
            if not row:
                return _error("Élément introuvable.", 404)
            new_icon = self._save_icon(icon_payload) if icon_payload else row["icon_path"]
            if str(values.get("clear_icon", "")) == "1":
                new_icon = None
            con.execute(f"UPDATE {table} SET name=?,icon_path=? WHERE id=?",
                        (name, new_icon, item_id))
            if table == "regions" and values.get("mode") in ("online", "offline"):
                con.execute("UPDATE regions SET mode=? WHERE id=?",
                            (values["mode"], item_id))
            if new_icon != row["icon_path"]:
                self._delete_icon(row["icon_path"])
            self._record(con, COLLECTIONS[table][2], f"{row['name']} → {name}")
        return _ok(name=name)

    def _delete_collection(self, table: str, item_id: str) -> ApiResponse:
        self._require_user()
        if table not in COLLECTIONS:
            return _error("Action inconnue.", 404)
        with self.db() as con:
            row = con.execute(f"SELECT name FROM {table} WHERE id=?", (item_id,)).fetchone()
            if row:
                con.execute(f"DELETE FROM {table} WHERE id=?", (item_id,))
                self._record(con, COLLECTIONS[table][3], row["name"])
        return _ok()

    def _delete_document(self, doc_id: str) -> ApiResponse:
        self._require_user()
        with self.db() as con:
            row = con.execute("SELECT name FROM documents WHERE id=?", (doc_id,)).fetchone()
            if row:
                con.execute("DELETE FROM documents WHERE id=?", (doc_id,))
                self._record(con, "document_deleted", row["name"])
        return _ok()

    # ---------------------------------------------------------- links, upload
    def _create_link(self, body: bytes) -> ApiResponse:
        self._require_user()
        payload = self._body_json(body)
        name = str(payload.get("name", "")).strip()
        link_url = str(payload.get("link_url", "")).strip()
        shelf_id = str(payload.get("shelf_id", ""))
        pocket_id = str(payload.get("pocket_id") or "") or None
        if not name or not link_url or not shelf_id:
            raise ApiError("Nom, lien et étagère requis.")
        with self.db() as con:
            if not con.execute("SELECT 1 FROM shelves WHERE id=?", (shelf_id,)).fetchone():
                return _error("Étagère introuvable.", 404)
            if pocket_id and not con.execute(
                "SELECT 1 FROM pockets WHERE id=? AND shelf_id=?", (pocket_id, shelf_id)
            ).fetchone():
                return _error("Poche introuvable dans cette étagère.", 404)
            doc_id = _new_id()
            con.execute(
                "INSERT INTO documents(id,shelf_id,name,mime,size,data,link_url) "
                "VALUES(?,?,?,?,?,?,?)",
                (doc_id, shelf_id, name, "application/x-link", len(link_url),
                 link_url.encode("utf-8"), link_url),
            )
            if pocket_id:
                con.execute(
                    "INSERT INTO document_pockets(document_id,pocket_id) VALUES(?,?)",
                    (doc_id, pocket_id),
                )
            self._record(con, "link_created", name)
        return _json_response({"id": doc_id, "name": name, "link_url": link_url}, 201)

    def _upload(self, body: bytes, content_type: str) -> ApiResponse:
        self._require_user()
        if len(body) > MAX_UPLOAD_BODY:
            raise ApiError("Fichier trop volumineux (1 Gio maximum).", 413)
        if "multipart/form-data" not in content_type.lower():
            raise ApiError("Import multipart attendu.")
        parts = _parse_multipart(body, content_type)
        values = _form_values(parts)
        shelf_id = str(values.get("shelf_id", ""))
        pocket_id = str(values.get("pocket_id") or "") or None
        files = [(filename, payload, mime) for name, filename, payload, mime in parts
                 if name and filename is not None]
        if not shelf_id or not files:
            raise ApiError("Choisis une étagère et au moins un fichier.")
        with self.db() as con:
            if not con.execute("SELECT 1 FROM shelves WHERE id=?", (shelf_id,)).fetchone():
                return _error("Étagère introuvable.", 404)
            if pocket_id and not con.execute(
                "SELECT 1 FROM pockets WHERE id=? AND shelf_id=?", (pocket_id, shelf_id)
            ).fetchone():
                return _error("Poche introuvable dans cette étagère.", 404)
            for filename, payload, mime in files:
                if not filename:
                    continue
                safe_name = _clean_name(filename)
                doc_id = _new_id()
                con.execute(
                    "INSERT INTO documents(id,shelf_id,name,mime,size,data) VALUES(?,?,?,?,?,?)",
                    (doc_id, shelf_id, safe_name, mime or "application/octet-stream",
                     len(payload), payload),
                )
                if pocket_id:
                    con.execute(
                        "INSERT INTO document_pockets(document_id,pocket_id) VALUES(?,?)",
                        (doc_id, pocket_id),
                    )
                self._record(con, "document_uploaded", safe_name)
        return _json_response({"ok": True, "count": len(files)}, 201)

    def _transfer(self, doc_id: str, body: bytes) -> ApiResponse:
        self._require_user()
        payload = self._body_json(body)
        shelf_id = str(payload.get("shelf_id", ""))
        pocket_id = str(payload.get("pocket_id") or "") or None
        with self.db() as con:
            if not con.execute("SELECT 1 FROM documents WHERE id=?", (doc_id,)).fetchone():
                return _error("Fichier introuvable.", 404)
            if not con.execute("SELECT 1 FROM shelves WHERE id=?", (shelf_id,)).fetchone():
                return _error("Étagère introuvable.", 404)
            if pocket_id and not con.execute(
                "SELECT 1 FROM pockets WHERE id=? AND shelf_id=?", (pocket_id, shelf_id)
            ).fetchone():
                raise ApiError("Poche étrangère à cette étagère.")
            con.execute("UPDATE documents SET shelf_id=? WHERE id=?", (shelf_id, doc_id))
            con.execute("DELETE FROM document_pockets WHERE document_id=?", (doc_id,))
            if pocket_id:
                con.execute(
                    "INSERT INTO document_pockets(document_id,pocket_id) VALUES(?,?)",
                    (doc_id, pocket_id),
                )
            self._record(con, "document_transferred", doc_id)
        return _ok()

    # -------------------------------------------------------------- documents
    def _document_bytes(self, doc_id: str) -> tuple[sqlite3.Row, bytes]:
        with self.db() as con:
            row = con.execute(
                "SELECT id,name,mime,size,data,link_url FROM documents WHERE id=?", (doc_id,)
            ).fetchone()
            if not row:
                raise ApiError("Fichier introuvable.", 404)
            payload = row["data"]
            if len(payload) != row["size"]:
                chunks = con.execute(
                    "SELECT data FROM document_chunks WHERE document_id=? ORDER BY chunk_index",
                    (doc_id,),
                ).fetchall()
                payload = b"".join(chunk["data"] for chunk in chunks)
        return row, payload

    def _parse_range(self, raw: str, size: int) -> tuple[int, int] | None:
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", raw.strip())
        if not match or not (match.group(1) or match.group(2)):
            raise ApiError("Plage invalide.", 416)
        start = int(match.group(1)) if match.group(1) else max(0, size - int(match.group(2) or 0))
        end = int(match.group(2)) if match.group(2) else size - 1
        if start >= size or end < start:
            raise ApiError("Plage invalide.", 416)
        return start, min(end, size - 1)

    def _file(self, path: str, query: str, headers: dict[str, str]) -> ApiResponse:
        self._require_user()
        doc_id = path.strip("/").split("/")[-1]
        params = parse_qs(query)
        inline = "inline=1" in [part.strip() for part in query.split("&")]
        row, payload = self._document_bytes(doc_id)
        mime = row["mime"] or "application/octet-stream"
        name = row["name"]
        lower = name.lower()
        if lower.endswith(".mp4"):
            mime = "video/mp4"
        disposition = "inline" if inline else "attachment"
        from urllib.parse import quote
        response_headers = {
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(name, safe='')}",
            "Accept-Ranges": "bytes",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        }
        range_header = headers.get("Range", "")
        if range_header:
            try:
                span = self._parse_range(range_header, len(payload))
            except ApiError:
                return ApiResponse(
                    status=416,
                    body=b"",
                    headers={"Content-Range": f"bytes */{len(payload)}"},
                )
            start, end = span
            response_headers["Content-Range"] = f"bytes {start}-{end}/{len(payload)}"
            return ApiResponse(status=206, content_type=mime,
                               body=payload[start:end + 1], headers=response_headers)
        if not inline:
            with self.db() as con:
                self._record(con, "document_downloaded", name)
        return ApiResponse(status=200, content_type=mime, body=payload, headers=response_headers)

    def _cover(self, path: str, query: str) -> ApiResponse:
        self._require_user()
        doc_id = path.strip("/").split("/")[-1]
        if not HEX_ID.fullmatch(doc_id):
            return _error("Aperçu indisponible pour ce document.", 415)
        params = parse_qs(query)
        try:
            size = int(params.get("size", ["180"])[0])
        except ValueError:
            size = 180
        size = max(180, min(3840, size))
        with self.db() as con:
            row = con.execute("SELECT name,mime FROM documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            return _error("Fichier introuvable.", 404)
        name = row["name"].lower()
        allowed = name.endswith(".pdf") or row["mime"] == "application/pdf" or name.endswith(
            (".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf")
        )
        if not allowed:
            return _error("Aperçu indisponible pour ce document.", 415)
        _doc, payload = self._document_bytes(doc_id)
        jpeg = self._render_first_page(payload, size)
        if jpeg is None:
            return _error("Aperçu indisponible : aucun moteur de rendu local.", 415)
        return ApiResponse(
            status=200,
            content_type="image/jpeg",
            body=jpeg,
            headers={"Cache-Control": "private, max-age=86400", "X-Page-Count": "1"},
        )

    @staticmethod
    def _render_first_page(payload: bytes, size: int) -> bytes | None:
        """Rendu local d'une page PDF, sans réseau et sans service externe."""
        try:
            from PySide6.QtCore import QBuffer, QByteArray, QIODevice
            from PySide6.QtGui import QImage
            from PySide6.QtPdf import QPdfDocument
            from PySide6.QtWidgets import QApplication

            if QApplication.instance() is None:
                return None
            document = QPdfDocument()
            status = document.load(QByteArray(payload))
            if status != QPdfDocument.Error.None_ or document.pageCount() < 1:
                return None
            image = document.render(0, size if size <= 3840 else 3840)
            if image.isNull():
                return None
            buffer = QBuffer()
            buffer.open(QIODevice.OpenModeFlag.WriteOnly)
            image.save(buffer, "JPEG", 82)
            return bytes(buffer.data())
        except Exception:
            return None
