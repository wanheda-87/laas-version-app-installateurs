#!/usr/bin/env python3
"""Tests synthétiques du binaire applicatif embarqué. Aucune donnée réelle."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import desktop_shortcut
import setup_core

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "app"))
import paths  # noqa: E402  — module applicatif local, aucun réseau

COMPTE = [("lecteur@example.invalid", "motdepasse-long-1")]


class AppBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="laas-bundle-test-")
        self.root = Path(self.temp.name)
        environnement = mock.patch.dict(os.environ, {
            "XDG_CONFIG_HOME": str(self.root / "config"),
            "APPDATA": str(self.root / "appdata"),
        })
        environnement.start()
        self.addCleanup(environnement.stop)
        os.environ.pop(paths.ENV_DATA_DIR, None)
        self.source = self.root / "source-binaire" / setup_core.APP_BINARY_NAME
        self.source.parent.mkdir(parents=True)
        self.source.write_bytes(b"binaire applicatif synthetique\n")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_le_vrai_binaire_est_copie_et_le_dossier_de_donnees_est_configure(self) -> None:
        data = self.root / "donnees"
        app = self.root / "application"
        info = setup_core.install(
            data, COMPTE, app_dir=app, app_source=self.source, create_shortcut=False
        )
        destination = app / "app" / setup_core.APP_BINARY_NAME
        self.assertEqual(info["app"], {"status": "installed", "path": str(destination)})
        self.assertEqual(destination.read_bytes(), self.source.read_bytes())
        if os.name != "nt":
            self.assertTrue(os.access(destination, os.X_OK))
        self.assertEqual(Path(info["config"]), paths.config_path())
        self.assertEqual(paths.read_data_dir(), data.resolve())
        payload = json.loads(paths.config_path().read_text(encoding="utf-8"))
        self.assertEqual(set(payload), {"data_dir"})

    def test_le_lanceur_ouvre_le_binaire_sans_message_dattente(self) -> None:
        app = self.root / "application"
        info = setup_core.install(
            self.root / "donnees", COMPTE, app_dir=app,
            app_source=self.source, create_shortcut=False,
        )
        launcher = Path(info["launcher"])
        text = launcher.read_text(encoding="utf-8")
        self.assertNotIn("pas encore", text)
        self.assertIn("laas-version-app", text)
        if os.name == "nt":
            self.assertIn("%APP%", text)
        else:
            self.assertIn("exec \"$APP\"", text)

    def test_binaire_absent_refuse_linstallation_compilee_avant_toute_ecriture(self) -> None:
        data = self.root / "donnees-compilees"
        with mock.patch.object(setup_core.sys, "frozen", True, create=True):
            with self.assertRaises(FileNotFoundError):
                setup_core.install(data, COMPTE, app_source=self.root / "absent")
        self.assertFalse((data / setup_core.DB_NAME).exists())
        self.assertFalse(paths.config_path().exists())

    def test_binaire_absent_en_developpement_ne_bloque_pas_la_base(self) -> None:
        info = setup_core.install(
            self.root / "donnees-dev", COMPTE,
            app_dir=self.root / "application-dev",
            app_source=self.root / "absent", create_shortcut=False,
        )
        self.assertEqual(info["app"]["status"], "absent")
        self.assertTrue(Path(info["database"]).is_file())

    def test_un_binaire_deja_installe_nest_pas_ecrase(self) -> None:
        app = self.root / "application"
        setup_core.install(
            self.root / "donnees", COMPTE, app_dir=app,
            app_source=self.source, create_shortcut=False,
        )
        destination = app / "app" / setup_core.APP_BINARY_NAME
        destination.write_bytes(b"version deja installee\n")
        info = setup_core.install(
            self.root / "donnees-bis", COMPTE, app_dir=app,
            app_source=self.source, create_shortcut=False,
        )
        self.assertEqual(info["app"]["status"], "already-present")
        self.assertEqual(destination.read_bytes(), b"version deja installee\n")


if __name__ == "__main__":
    unittest.main()
