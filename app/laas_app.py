#!/usr/bin/env python3
"""Fenêtre locale LaaS — PySide6 + WebEngine, sans serveur, sans port, sans réseau.

L'interface HTML/CSS/JS d'origine est affichée telle quelle dans une vraie
fenêtre. Deux ponts internes, aucun socket :

* les fichiers statiques et les URL directes (<img>, <audio>, <video>) passent
  par un handler de schéma ``laas://`` ;
* les appels ``fetch('/api/...')`` sont routés par un script JS injecté vers un
  objet ``QWebChannel`` qui appelle directement la liste d'actions fermée.

Ce découpage évite ``QWebEngineUrlRequestJob.requestBody()``, qui segfault sur
PySide6 6.10, et permet de restituer les vrais statuts HTTP à l'interface.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from typing import Any

from PySide6.QtCore import QBuffer, QByteArray, QObject, QUrl, Slot
from PySide6.QtGui import QIcon, QPixmap
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import (
    QWebEngineProfile,
    QWebEngineScript,
    QWebEngineUrlRequestInterceptor,
    QWebEngineUrlRequestJob,
    QWebEngineUrlScheme,
    QWebEngineUrlSchemeHandler,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMessageBox, QVBoxLayout, QWidget

from local_api import ApiResponse, LocalApi
from paths import web_root

SCHEME = b"laas"
HOST = "local"
_SCHEME_REGISTERED = False
_alive: list[object] = []
_handler: "LocalUrlHandler | None" = None
_bridge: "ApiBridge | None" = None

# Ce script est injecté dans la page. Il n'effectue aucun appel réseau : le
# chargement de qwebchannel.js se fait depuis la ressource Qt intégrée au moteur,
# et chaque fetch d'API est traduit en appel à l'objet Python exposé ci-dessous.
SHIM = r"""
(function () {
  // Au point d'injection DocumentCreation, ni <head> ni <html> n'existent
  // encore. On pose l'écouteur maintenant et on insère la ressource Qt une
  // fois le DOM prêt, sans toucher au flux d'analyse du document.
  function loadChannelScript() {
    var tag = document.createElement('script');
    tag.src = 'qrc:///qtwebchannel/qwebchannel.js';
    (document.head || document.documentElement).appendChild(tag);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadChannelScript);
  } else {
    loadChannelScript();
  }

  function waitFor(predicate, callback) {
    if (predicate()) return callback();
    setTimeout(function () { waitFor(predicate, callback); }, 10);
  }

  var bridgePromise = new Promise(function (resolve, reject) {
    waitFor(function () {
      return window.QWebChannel && window.qt && window.qt.webChannelTransport;
    }, function () {
      new QWebChannel(window.qt.webChannelTransport, function (channel) {
        waitFor(function () { return !!channel.objects.laasBridge; }, function () {
          resolve(channel.objects.laasBridge);
        });
      });
    });
  });

  function bytesToBase64(bytes) {
    var result = '', step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      result += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(result);
  }

  function base64ToBytes(value) {
    if (!value) return new Uint8Array(0);
    var raw = atob(value), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function encodeText(value) { return new TextEncoder().encode(String(value)); }

  async function bodyToBytes(body, headers) {
    if (body == null) return new Uint8Array(0);
    if (typeof body === 'string') return encodeText(body);
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    if (ArrayBuffer.isView(body)) {
      return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      return encodeText(body.toString());
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      var boundary = '----LaasBridge' + Math.random().toString(16).slice(2);
      var chunks = [], enc = new TextEncoder();
      var entries = body.entries(), entry;
      while (!(entry = entries.next()).done) {
        var name = entry.value[0], value = entry.value[1];
        if (typeof value === 'string') {
          chunks.push(enc.encode('--' + boundary + '\r\nContent-Disposition: form-data; name="' +
                                name + '"\r\n\r\n' + value + '\r\n'));
        } else {
          chunks.push(enc.encode('--' + boundary + '\r\nContent-Disposition: form-data; name="' +
                                name + '"; filename="' + String(value.name || 'blob') +
                                '"\r\nContent-Type: ' + String(value.type || 'application/octet-stream') +
                                '\r\n\r\n'));
          chunks.push(new Uint8Array(await value.arrayBuffer()));
          chunks.push(enc.encode('\r\n'));
        }
      }
      chunks.push(enc.encode('--' + boundary + '--\r\n'));
      var total = 0, k;
      for (k = 0; k < chunks.length; k++) total += chunks[k].length;
      var merged = new Uint8Array(total), offset = 0;
      for (k = 0; k < chunks.length; k++) { merged.set(chunks[k], offset); offset += chunks[k].length; }
      headers['content-type'] = 'multipart/form-data; boundary=' + boundary;
      return merged;
    }
    return encodeText(String(body));
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = async function (url, options) {
    var path = '', query = '', protocol = '';
    try {
      var parsed = new URL(String(url), window.location.href);
      path = parsed.pathname;
      query = parsed.search.replace(/^\?/, '');
      protocol = parsed.protocol;
    } catch (e) {}
    // Ne détourner que nos propres appels : toute autre origine reste soumise
    // à l'intercepteur, qui la bloque (aucun socket, aucun tiers).
    if (path.indexOf('/api/') !== 0 || protocol !== window.location.protocol) {
      return realFetch(url, options);
    }

    var opts = options || {};
    var headers = {};
    try {
      new Headers(opts.headers || {}).forEach(function (v, k) { headers[k] = v; });
    } catch (e) {}
    var bytes = await bodyToBytes(opts.body, headers);
    var bridge = await bridgePromise;
    var raw = await new Promise(function (resolve, reject) {
      try {
        bridge.request(String(opts.method || 'GET').toUpperCase(), path, query,
                       JSON.stringify(headers), bytesToBase64(bytes), resolve);
      } catch (e) { reject(e); }
    });
    var result = JSON.parse(raw);
    return new Response(base64ToBytes(result.body_b64), {
      status: result.status,
      headers: new Headers(result.headers || {})
    });
  };
})();
"""


def _as_text(value: Any) -> str:
    """Selon la version de PySide6, Qt renvoie str ou QByteArray."""
    if isinstance(value, str):
        return value
    try:
        return bytes(value).decode("utf-8", errors="replace")
    except (TypeError, ValueError):
        return str(value)


class ApiBridge(QObject):
    """Objet exposé à la page : traduit un appel fermé en réponse JSON."""

    def __init__(self, api: LocalApi):
        super().__init__()
        self.api = api

    @Slot(str, str, str, str, str, result=str)
    def request(self, method: str, path: str, query: str,
                headers_json: str, body_b64: str) -> str:
        try:
            headers = json.loads(headers_json) if headers_json else {}
        except (TypeError, ValueError):
            headers = {}
        if not isinstance(headers, dict):
            headers = {}
        body = base64.b64decode(body_b64) if body_b64 else b""
        response = self.api.handle(method, path, query, body,
                                   headers.get("content-type", ""), headers)
        return json.dumps({
            "status": response.status,
            "content_type": response.content_type,
            "body_b64": base64.b64encode(response.body).decode("ascii"),
            "headers": response.headers,
        })


class LocalOnlyInterceptor(QWebEngineUrlRequestInterceptor):
    """Bloque toute origine qui n'est pas le schéme local de l'application."""

    def interceptRequest(self, info: Any) -> None:
        scheme = _as_text(info.requestUrl().scheme()).lower()
        if scheme not in ("laas", "data", "blob", "qrc"):
            info.block(True)


class LocalUrlHandler(QWebEngineUrlSchemeHandler):
    """Sert les fichiers statiques et les URL directes (images, médias)."""

    def __init__(self, api: LocalApi):
        super().__init__()
        self.api = api
        self._keepalive: dict[QWebEngineUrlRequestJob, QByteArray] = {}

    def requestStarted(self, job: QWebEngineUrlRequestJob) -> None:
        try:
            url = job.requestUrl()
            # Chromium résout les URL relatives en ``laas:/...`` (hôte vide) et
            # non en ``laas://local/...``. L'intercepteur a déjà filtré le schéma.
            if _as_text(url.host()).lower() not in ("", HOST):
                job.fail(QWebEngineUrlRequestJob.Error.RequestDenied)
                return
            method = _as_text(job.requestMethod()).upper()
            path = _as_text(url.path())
            query = _as_text(url.query())
            if method not in ("GET", "HEAD"):
                job.fail(QWebEngineUrlRequestJob.Error.RequestDenied)
                return
            response = self.api.handle("GET", path, query)
            self._send(job, response)
        except Exception as exc:
            job.fail(QWebEngineUrlRequestJob.Error.RequestFailed)
            print(f"Erreur locale : {exc}", file=sys.stderr)

    def _send(self, job: QWebEngineUrlRequestJob, response: ApiResponse) -> None:
        data = QByteArray(response.body)
        self._keepalive[job] = data
        buffer = QBuffer(data, job)
        buffer.open(QBuffer.OpenModeFlag.ReadOnly)
        if response.headers:
            pairs = {QByteArray(name.encode("latin-1")):
                     QByteArray(str(value).encode("latin-1"))
                     for name, value in response.headers.items()}
            try:
                job.setAdditionalResponseHeaders(pairs)
            except Exception as exc:  # en-têtes non supportés selon la version Qt
                print(f"En-têtes locaux ignorés : {exc}", file=sys.stderr)
        job.reply(response.content_type.encode("ascii"), buffer)


def register_scheme() -> None:
    global _SCHEME_REGISTERED
    if _SCHEME_REGISTERED:
        return
    scheme = QWebEngineUrlScheme(SCHEME)
    scheme.setFlags(
        QWebEngineUrlScheme.Flag.SecureScheme
        | QWebEngineUrlScheme.Flag.LocalScheme
        | QWebEngineUrlScheme.Flag.CorsEnabled
        | QWebEngineUrlScheme.Flag.FetchApiAllowed
    )
    QWebEngineUrlScheme.registerScheme(scheme)
    _SCHEME_REGISTERED = True


# Qt exige l'enregistrement d'un schéma AVANT la création de QApplication.
register_scheme()


def build_view(api: LocalApi) -> QWebEngineView:
    """Construit la fenêtre ; utile aussi aux tests en mode hors écran."""
    global _handler, _bridge
    register_scheme()
    profile = QWebEngineProfile.defaultProfile()
    if _handler is None:
        # Qt refuse d'installer deux fois un handler pour un même schéma sur le
        # profil par défaut. Une seule installation suffit : le handler et le
        # pont conservent une référence mutable vers le noyau.
        interceptor = LocalOnlyInterceptor()
        _handler = LocalUrlHandler(api)
        profile.setUrlRequestInterceptor(interceptor)
        profile.installUrlSchemeHandler(SCHEME, _handler)
        _alive.append(interceptor)
        _alive.append(_handler)
    else:
        _handler.api = api

    bridge = ApiBridge(api)
    _bridge = bridge
    channel = QWebChannel()
    channel.registerObject("laasBridge", bridge)
    _alive.append(bridge)
    _alive.append(channel)

    view = QWebEngineView()
    view.page().setWebChannel(channel)
    script = QWebEngineScript()
    script.setName("laas-local-bridge")
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setSourceCode(SHIM)
    view.page().scripts().insert(script)

    icon_file = web_root() / "assets" / "laas-icon.png"
    if icon_file.is_file():
        view.setWindowIcon(QIcon(QPixmap(str(icon_file))))
    view.setWindowTitle("LaaS — Bibliothèque personnelle")
    view.resize(1280, 820)
    view.load(QUrl(f"{SCHEME.decode()}://{HOST}/"))
    return view


def run(data_dir: str | Path) -> int:
    app = QApplication.instance() or QApplication(sys.argv)
    api = LocalApi(data_dir, web_root())
    try:
        api.check_library()
    except Exception as exc:
        QMessageBox.critical(None, "Bibliothèque introuvable", str(exc))
        return 2
    view = build_view(api)
    container = QWidget()
    layout = QVBoxLayout(container)
    layout.setContentsMargins(0, 0, 0, 0)
    layout.addWidget(view)
    container.setWindowTitle("LaaS — Bibliothèque personnelle")
    container.resize(1280, 820)
    container.show()
    return app.exec()


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="LaaS — application locale")
    parser.add_argument("--data-dir", default="", help="Dossier de données (optionnel)")
    args = parser.parse_args(argv)
    from paths import read_data_dir

    data_dir = args.data_dir or read_data_dir()
    return run(data_dir)


if __name__ == "__main__":
    raise SystemExit(main())
