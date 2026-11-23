#!/usr/bin/env python3
"""Tests synthétiques du noyau d'installation. Aucune donnée réelle."""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import desktop_shortcut
import setup_core

IDENTIFIANTS = ["utilisateur-un@example.invalid", "utilisateur-deux@example.invalid", "profil-trois"]


def comptes(nombre: int) -> list[tuple[str, str]]:
    return [(IDENTIFIANTS[i], f"motdepasse-long-{i + 1}") for i in range(nombre)]


class SetupCoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="laas-app-test-")
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_default_locations_are_always_available(self) -> None:
        self.assertEqual(setup_core.default_data_dir().name, "LaaSVersionApp-data")
        self.assertEqual(setup_core.default_app_dir().name, "LaaSVersionApp")
        self.assertEqual(setup_core.path_or_default("", setup_core.default_data_dir), setup_core.default_data_dir())
        self.assertEqual(setup_core.path_or_default("   ", setup_core.default_app_dir), setup_core.default_app_dir())
        choisi = setup_core.path_or_default(self.root / "choisi", setup_core.default_data_dir)
        self.assertEqual(choisi, self.root / "choisi")

    def test_install_accepts_one_two_or_three_accounts(self) -> None:
        for nombre in (1, 2, 3):
            with self.subTest(comptes=nombre):
                data = self.root / f"donnees-{nombre}"
                info = setup_core.install(data, comptes(nombre), create_launcher=False)
                self.assertTrue((data / setup_core.DB_NAME).is_file())
                self.assertTrue((data / setup_core.MARKER_NAME).is_file())
                self.assertEqual(info["identifiers"], [c[0] for c in comptes(nombre)])
                self.assertEqual(setup_core.verify_install(data, comptes(nombre))["accounts"], nombre)
                self.assertEqual(setup_core.verify_install(data, comptes(nombre))["documents"], 0)

    def test_passwords_are_hashed_and_never_plain(self) -> None:
        data = self.root / "hachage"
        setup_core.install(data, comptes(1), create_launcher=False)
        with sqlite3.connect(data / setup_core.DB_NAME) as connection:
            salt, digest = connection.execute("SELECT salt, password_hash FROM users").fetchone()
        self.assertEqual(len(salt), setup_core.SALT_BYTES)
        self.assertNotEqual(bytes(digest), b"motdepasse-long-1")
        self.assertTrue(setup_core.check_password("motdepasse-long-1", salt, digest))
        self.assertFalse(setup_core.check_password("mauvais-mot-de-passe", salt, digest))

    def test_existing_database_is_never_overwritten(self) -> None:
        data = self.root / "existant"
        setup_core.install(data, comptes(1), create_launcher=False)
        with self.assertRaises(FileExistsError):
            setup_core.install(data, comptes(2), create_launcher=False)

    def test_short_password_and_bad_identifier_are_refused(self) -> None:
        with self.assertRaises(ValueError):
            setup_core.validate_password("court")
        with self.assertRaises(ValueError):
            setup_core.normalize_identifier(" Identifiant avec espaces ")
        with self.assertRaises(ValueError):
            setup_core.normalize_identifier("a@b")

    def test_duplicate_identifier_is_refused(self) -> None:
        informes = [("profil-unique", "motdepasse-long-1"), ("PROFIL-UNIQUE", "motdepasse-long-2")]
        with self.assertRaises(ValueError):
            setup_core.validate_accounts(informes)

    def test_wrong_confirmation_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            setup_core.validate_password("motdepasse-long-1", "autre-chose")

    def test_launcher_is_created_in_app_directory(self) -> None:
        data = self.root / "donnees"
        app = self.root / "application"
        with mock.patch.object(desktop_shortcut, "IS_WINDOWS", True), mock.patch.object(
            desktop_shortcut, "IS_LINUX", False
        ):
            info = setup_core.install(data, comptes(1), app_dir=app, create_shortcut=False)
        self.assertTrue(Path(info["launcher"]).is_file())
        self.assertIn("laas-version-app.exe", Path(info["launcher"]).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
