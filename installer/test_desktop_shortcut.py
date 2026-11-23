#!/usr/bin/env python3
"""Tests synthétiques des raccourcis. Aucun vrai .lnk Windows n'est fabriqué ici."""
from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import desktop_shortcut
import setup_core


def faux_lanceur(root: Path) -> Path:
    folder = root / "application"
    folder.mkdir(parents=True, exist_ok=True)
    launcher = folder / desktop_shortcut.launcher_name()
    launcher.write_text("lanceur synthetique\n", encoding="utf-8")
    return launcher


class DesktopShortcutTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="laas-raccourci-test-")
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_install_demande_le_raccourci_par_defaut(self) -> None:
        launcher = faux_lanceur(self.root)
        sentinel = {"status": "created", "path": "C:\\Bureau\\LaaS Version App.lnk"}
        with mock.patch.object(
            setup_core.desktop_shortcut, "create_shortcut", return_value=sentinel
        ) as create:
            info = setup_core.install(
                self.root / "donnees",
                [("profil-unique", "motdepasse-long-1")],
                app_dir=launcher.parent,
            )
        create.assert_called_once()
        arguments = create.call_args.kwargs
        self.assertEqual(arguments["launcher"], launcher.resolve())
        self.assertEqual(arguments["app_dir"], launcher.parent.resolve())
        self.assertIsNone(arguments["desktop"])
        self.assertEqual(info["shortcut"], sentinel)

    def test_install_peut_desactiver_le_raccourci(self) -> None:
        with mock.patch.object(setup_core.desktop_shortcut, "create_shortcut") as create:
            info = setup_core.install(
                self.root / "donnees",
                [("profil-unique", "motdepasse-long-1")],
                app_dir=self.root / "application",
                create_shortcut=False,
            )
        create.assert_not_called()
        self.assertEqual(info["shortcut"]["status"], "disabled")

    def test_plateforme_non_windows_non_linux_est_ignoree(self) -> None:
        launcher = faux_lanceur(self.root)
        bureau = self.root / "Bureau"
        bureau.mkdir()
        with mock.patch.object(desktop_shortcut, "IS_WINDOWS", False), mock.patch.object(
            desktop_shortcut, "IS_LINUX", False
        ):
            result = desktop_shortcut.create_shortcut(
                launcher=launcher, app_dir=launcher.parent, desktop=bureau
            )
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "unsupported-platform")
        self.assertFalse((bureau / desktop_shortcut.SHORTCUT_NAME).exists())
        self.assertFalse((bureau / desktop_shortcut.LINUX_DESKTOP_FILE).exists())

    def test_windows_cree_le_lnk_avec_l_icone(self) -> None:
        launcher = faux_lanceur(self.root)
        bureau = self.root / "Bureau"
        bureau.mkdir()

        def faux_powershell(script: str, **_kwargs):
            self.assertIn("WScript.Shell", script)
            self.assertIn(str(launcher.resolve()), script)
            self.assertIn("laas-icon.ico,0", script)
            (bureau / desktop_shortcut.SHORTCUT_NAME).write_text("lnk", encoding="utf-8")
            return subprocess.CompletedProcess(args=[], returncode=0, stdout=b"OK", stderr=b"")

        with mock.patch.object(desktop_shortcut, "IS_WINDOWS", True), mock.patch.object(
            desktop_shortcut, "_run_powershell", side_effect=faux_powershell
        ):
            result = desktop_shortcut.create_shortcut(
                launcher=launcher, app_dir=launcher.parent, desktop=bureau
            )
        self.assertEqual(result["status"], "created")
        self.assertTrue((bureau / desktop_shortcut.SHORTCUT_NAME).is_file())
        self.assertTrue((launcher.parent / desktop_shortcut.ICON_NAME).is_file())

    def test_echec_windows_est_signale_sans_bloquer(self) -> None:
        launcher = faux_lanceur(self.root)
        bureau = self.root / "Bureau"
        bureau.mkdir()
        echec = subprocess.CompletedProcess(
            args=[], returncode=1, stdout=b"", stderr=b"acces refuse"
        )
        with mock.patch.object(desktop_shortcut, "IS_WINDOWS", True), mock.patch.object(
            desktop_shortcut, "_run_powershell", return_value=echec
        ):
            result = desktop_shortcut.create_shortcut(
                launcher=launcher, app_dir=launcher.parent, desktop=bureau
            )
        self.assertEqual(result["status"], "failed")
        self.assertIn("acces refuse", result["reason"])

    def test_script_powershell_echappe_les_apostrophes(self) -> None:
        script = desktop_shortcut.powershell_script(
            shortcut=Path("C:/Utilisateurs/O'Brien/Desktop/LaaS Version App.lnk"),
            target=Path("C:/Utilisateurs/O'Brien/LaaSVersionApp/Lancer LaaS Version App.bat"),
            working_dir=Path("C:/Utilisateurs/O'Brien/LaaSVersionApp"),
            icon=Path("C:/Utilisateurs/O'Brien/LaaSVersionApp/laas-icon.ico"),
        )
        self.assertIn("O''Brien", script)
        self.assertIn("$shortcut.TargetPath = ", script)
        self.assertIn("$shortcut.IconLocation = ", script)
        self.assertIn("$shortcut.Save()", script)

    def test_linux_cree_le_menu_et_une_copie_sur_le_bureau(self) -> None:
        launcher = faux_lanceur(self.root)
        bureau = self.root / "Bureau"
        bureau.mkdir()
        environnement = {
            "XDG_DATA_HOME": str(self.root / "xdg-data"),
            "XDG_DESKTOP_DIR": str(bureau),
        }
        with mock.patch.dict(os.environ, environnement, clear=False), mock.patch.object(
            desktop_shortcut, "IS_WINDOWS", False
        ), mock.patch.object(desktop_shortcut, "IS_LINUX", True):
            result = desktop_shortcut.create_shortcut(
                launcher=launcher, app_dir=launcher.parent
            )

        self.assertEqual(result["status"], "created")
        menu = Path(result["menu"])
        sur_bureau = Path(result["desktop"])
        self.assertTrue(menu.is_file())
        self.assertTrue(sur_bureau.is_file())
        contenu = menu.read_text(encoding="utf-8")
        self.assertIn("[Desktop Entry]", contenu)
        self.assertIn("Name=LaaS Version App", contenu)
        self.assertIn("Exec=", contenu)
        self.assertIn(desktop_shortcut.LINUX_LAUNCHER_NAME, contenu)
        self.assertEqual(sur_bureau.read_text(encoding="utf-8"), contenu)
        self.assertTrue(os.access(result["launcher"], os.X_OK))
        self.assertEqual(Path(result["icon"]).read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_linux_sans_dossier_bureau_cree_quand_meme_le_menu(self) -> None:
        launcher = faux_lanceur(self.root)
        absent = self.root / "Bureau-absent"
        environnement = {
            "XDG_DATA_HOME": str(self.root / "xdg-data-sans-bureau"),
            "XDG_DESKTOP_DIR": str(absent),
        }
        with mock.patch.dict(os.environ, environnement, clear=False), mock.patch.object(
            desktop_shortcut, "IS_WINDOWS", False
        ), mock.patch.object(desktop_shortcut, "IS_LINUX", True):
            result = desktop_shortcut.create_shortcut(
                launcher=launcher, app_dir=launcher.parent
            )
        self.assertEqual(result["status"], "created")
        self.assertIsNone(result["desktop"])
        self.assertTrue(Path(result["menu"]).is_file())
        self.assertFalse(absent.exists())

    def test_linux_lit_le_bureau_declare_par_xdg(self) -> None:
        choix = self.root / "Bureau-XDG"
        with mock.patch.dict(os.environ, {"XDG_DESKTOP_DIR": str(choix)}, clear=False):
            self.assertEqual(desktop_shortcut.linux_desktop_dir(), choix)

    def test_installation_linux_ne_cree_pas_de_lanceur_bat(self) -> None:
        """Le .desktop doit viser le lanceur .sh unique créé par install()."""
        data = self.root / "donnees-linux"
        app = self.root / "application-linux"
        bureau = self.root / "Bureau-linux"
        bureau.mkdir()
        environnement = {
            "XDG_DATA_HOME": str(self.root / "xdg-data-linux"),
            "XDG_DESKTOP_DIR": str(bureau),
        }
        with mock.patch.dict(os.environ, environnement, clear=False), mock.patch.object(
            desktop_shortcut, "IS_WINDOWS", False
        ), mock.patch.object(desktop_shortcut, "IS_LINUX", True):
            info = setup_core.install(
                data, [("profil-unique", "motdepasse-long-1")], app_dir=app
            )
        lanceur = Path(info["launcher"])
        self.assertEqual(lanceur.name, "Lancer LaaS Version App.sh")
        self.assertFalse((app / "Lancer LaaS Version App.bat").exists())
        self.assertTrue(os.access(lanceur, os.X_OK))
        contenu = Path(info["shortcut"]["menu"]).read_text(encoding="utf-8")
        self.assertIn(str(lanceur.resolve()), contenu)

    def test_exec_desktop_echappe_les_caracteres_speciaux(self) -> None:
        quoted = desktop_shortcut._quote_exec('/home/user/O"$`\\Data/app.sh')
        self.assertTrue(quoted.startswith('"') and quoted.endswith('"'))
        self.assertIn('\\"', quoted)
        self.assertIn('\\$', quoted)
        self.assertIn('\\`', quoted)
        self.assertIn('\\\\', quoted)

    def test_icone_integree_est_un_vrai_ico(self) -> None:
        icon = desktop_shortcut.write_icon(self.root)
        self.assertEqual(icon.read_bytes()[:4], b"\x00\x00\x01\x00")

    def test_icone_png_integree_est_un_vrai_png(self) -> None:
        icon = desktop_shortcut.write_png_icon(self.root)
        self.assertEqual(icon.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_repli_du_bureau_est_le_dossier_personnel(self) -> None:
        with mock.patch.object(desktop_shortcut, "IS_WINDOWS", False):
            self.assertEqual(desktop_shortcut.desktop_path(), Path.home() / "Desktop")


if __name__ == "__main__":
    unittest.main()
