#!/usr/bin/env python3
"""Assistant d'installation LaaS version app.

Double-clic sur Windows via setup.bat, ./setup.sh sur Linux, ou ligne de commande :
  python3 setup.py --headless --data-dir /tmp/essai --account "nom:motdepasse-long"

Le mot de passe n'est jamais écrit dans un fichier ni affiché après validation.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import setup_core


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Installation locale, sans réseau ni serveur.")
    parser.add_argument("--data-dir", help="Dossier de données (par défaut dans le dossier personnel)")
    parser.add_argument("--app-dir", help="Dossier de l'application (par défaut dans le dossier personnel)")
    parser.add_argument(
        "--account", action="append", default=[], metavar="IDENTIFIANT:MOT_DE_PASSE",
        help="Compte à créer, 1 à 3 fois. Mode sans interface.",
    )
    parser.add_argument("--headless", action="store_true", help="Pas d'interface graphique")
    parser.add_argument(
        "--no-launcher", action="store_true",
        help="Ne pas créer le lanceur (.bat sur Windows, .sh sur Linux)",
    )
    parser.add_argument(
        "--no-shortcut", action="store_true",
        help="Ne pas créer le raccourci sur le Bureau (créé par défaut)",
    )
    return parser


def run_headless(args: argparse.Namespace) -> int:
    accounts = []
    for spec in args.account:
        identifier, separator, password = spec.partition(":")
        if not separator:
            print(f"Compte invalide (attendu identifiant:motdepasse) : {spec!r}", file=sys.stderr)
            return 2
        accounts.append((identifier, password))
    if not 1 <= len(accounts) <= 3:
        print("Indique entre un et trois comptes avec --account.", file=sys.stderr)
        return 2
    data_dir = setup_core.path_or_default(args.data_dir, setup_core.default_data_dir)
    app_dir = setup_core.path_or_default(args.app_dir, setup_core.default_app_dir)
    try:
        info = setup_core.install(
            data_dir,
            accounts,
            app_dir=app_dir,
            create_launcher=not args.no_launcher,
            create_shortcut=not args.no_shortcut,
        )
    except Exception as exc:  # message sûr, sans mot de passe
        print(f"Échec de l'installation : {exc}", file=sys.stderr)
        return 1
    print("Installation terminée.")
    print(f"Base : {info['database']}")
    print(f"Marqueur : {info['marker']}")
    if info["launcher"]:
        print(f"Lanceur : {info['launcher']}")
    shortcut = info["shortcut"]
    if shortcut["status"] == "created":
        print(f"Raccourci : {shortcut['path']}")
    elif shortcut["status"] == "failed":
        print(f"Attention : raccourci non créé ({shortcut['reason']}).", file=sys.stderr)
    print("Comptes créés : " + ", ".join(info["identifiers"]))
    print("ATTENTION : ne pas oublier ces identifiants et leurs mots de passe.")
    return 0


def run_gui(args: argparse.Namespace) -> int:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    class Wizard(tk.Tk):
        def __init__(self) -> None:
            super().__init__()
            self.title("Installation — LaaS version app")
            self.geometry("660x560")
            self.resizable(False, False)
            self.step = 0
            self.info: dict = {}
            self.data_dir = tk.StringVar(
                value=str(setup_core.path_or_default(args.data_dir, setup_core.default_data_dir))
            )
            self.app_dir = tk.StringVar(
                value=str(setup_core.path_or_default(args.app_dir, setup_core.default_app_dir))
            )
            self.count = tk.IntVar(value=1)
            self.identifiers: list[tk.StringVar] = []
            self.passwords: list[tk.StringVar] = []
            self.confirmations: list[tk.StringVar] = []
            self.frame = ttk.Frame(self, padding=(22, 18))
            self.frame.pack(fill="both", expand=True)
            self.show()

        def clear(self) -> None:
            for widget in self.frame.winfo_children():
                widget.destroy()

        def heading(self, text: str) -> None:
            ttk.Label(self.frame, text=text, font=("Segoe UI", 17, "bold")).pack(anchor="w", pady=(0, 14))

        def paragraph(self, text: str, *, danger: bool = False, bold: bool = False) -> None:
            font = ("Segoe UI", 11, "bold") if bold else ("Segoe UI", 11)
            ttk.Label(
                self.frame, text=text, font=font, foreground="#b42318" if danger else "#1d1d1f",
                wraplength=610, justify="left",
            ).pack(anchor="w", pady=4)

        def nav(self, *, back: bool = True, label: str = "Suivant", command=None) -> None:
            box = ttk.Frame(self.frame)
            box.pack(fill="x", side="bottom", pady=(20, 0))
            if back:
                ttk.Button(box, text="Précédent", command=lambda: self.go(self.step - 1)).pack(side="left")
            ttk.Button(box, text=label, command=command or (lambda: self.go(self.step + 1))).pack(side="right")

        def go(self, step: int) -> None:
            self.step = step
            self.show()

        def prepare_accounts(self) -> None:
            number = self.count.get()
            self.identifiers = [tk.StringVar() for _ in range(number)]
            self.passwords = [tk.StringVar() for _ in range(number)]
            self.confirmations = [tk.StringVar() for _ in range(number)]

        def collect_accounts(self) -> list[tuple[str, str]] | None:
            accounts: list[tuple[str, str]] = []
            for index in range(self.count.get()):
                identifier = self.identifiers[index].get()
                password = self.passwords[index].get()
                confirmation = self.confirmations[index].get()
                try:
                    normalized = setup_core.normalize_identifier(identifier)
                    setup_core.validate_password(password, confirmation)
                except ValueError as exc:
                    messagebox.showerror(f"Compte {index + 1}", str(exc))
                    return None
                accounts.append((normalized, password))
            try:
                return setup_core.validate_accounts(accounts)
            except ValueError as exc:
                messagebox.showerror("Comptes", str(exc))
                return None

        def browse(self, variable: tk.StringVar) -> None:
            chosen = filedialog.askdirectory(initialdir=variable.get() or str(Path.home()))
            if chosen:
                variable.set(chosen)

        def accept_locations(self) -> None:
            """Remet un chemin par défaut si le champ a été vidé, puis continue."""
            self.data_dir.set(str(setup_core.path_or_default(self.data_dir.get(), setup_core.default_data_dir)))
            self.app_dir.set(str(setup_core.path_or_default(self.app_dir.get(), setup_core.default_app_dir)))
            self.go(2)

        def install(self) -> None:
            accounts = self.collect_accounts()
            if not accounts:
                return
            try:
                self.info = setup_core.install(
                    Path(self.data_dir.get()),
                    accounts,
                    app_dir=Path(self.app_dir.get()) if not args.no_launcher else None,
                    create_launcher=not args.no_launcher,
                    create_shortcut=not args.no_shortcut,
                )
            except Exception as exc:
                messagebox.showerror("Échec de l'installation", str(exc))
                return
            self.go(5)

        def show(self) -> None:
            self.clear()
            if self.step == 0:
                self.heading("Bienvenue")
                self.paragraph(
                    "Cet assistant crée une bibliothèque locale vide : une base SQLite, son marqueur "
                    "et les comptes d'accès. Aucun document n'est ajouté."
                )
                self.paragraph("Aucun réseau, aucun serveur, aucun compte en ligne.", bold=True)
                self.paragraph(
                    "Tu vas choisir un, deux ou trois identifiants avec un mot de passe chacun. "
                    "Ce sont tes clés d'accès : ne les oublie pas.",
                    danger=True, bold=True,
                )
                self.nav(back=False, label="Commencer")
            elif self.step == 1:
                self.heading("Emplacements")
                self.paragraph("Dossier des données : la base SQLite et le marqueur seront créés ici.")
                row = ttk.Frame(self.frame)
                row.pack(fill="x", pady=4)
                ttk.Entry(row, textvariable=self.data_dir).pack(side="left", fill="x", expand=True)
                ttk.Button(row, text="Parcourir", command=lambda: self.browse(self.data_dir)).pack(side="left", padx=(8, 0))
                self.paragraph("Dossier de l'application : le lanceur sera placé ici.")
                row2 = ttk.Frame(self.frame)
                row2.pack(fill="x", pady=4)
                ttk.Entry(row2, textvariable=self.app_dir).pack(side="left", fill="x", expand=True)
                ttk.Button(row2, text="Parcourir", command=lambda: self.browse(self.app_dir)).pack(side="left", padx=(8, 0))
                self.paragraph(
                    "Les deux emplacements sont déjà remplis : tu peux laisser ces valeurs "
                    "et cliquer simplement sur Suivant.",
                    bold=True,
                )
                self.paragraph("Aucun choix de disque ou de partition n'est demandé.", danger=True)
                self.nav(command=self.accept_locations)
            elif self.step == 2:
                self.heading("Comptes d'accès")
                self.paragraph("Combien de personnes ou de profils doivent pouvoir ouvrir l'application ?")
                for value, label in ((1, "Un compte"), (2, "Deux comptes"), (3, "Trois comptes")):
                    ttk.Radiobutton(self.frame, text=label, variable=self.count, value=value).pack(anchor="w", pady=5)
                self.paragraph("Chaque compte aura son propre mot de passe.", bold=True)
                self.nav(command=lambda: (self.prepare_accounts(), self.go(3)))
            elif self.step == 3:
                self.heading("Identifiants et mots de passe")
                for index in range(self.count.get()):
                    box = ttk.LabelFrame(self.frame, text=f"Compte {index + 1}", padding=10)
                    box.pack(fill="x", pady=8)
                    ttk.Label(box, text="E-mail ou nom d'utilisateur").pack(anchor="w")
                    ttk.Entry(box, textvariable=self.identifiers[index]).pack(fill="x", pady=(2, 8))
                    ttk.Label(box, text="Mot de passe (10 caractères minimum)").pack(anchor="w")
                    ttk.Entry(box, textvariable=self.passwords[index], show="*").pack(fill="x", pady=2)
                    ttk.Label(box, text="Confirmer le mot de passe").pack(anchor="w")
                    ttk.Entry(box, textvariable=self.confirmations[index], show="*").pack(fill="x", pady=2)
                self.paragraph("Les mots de passe ne seront jamais écrits dans un fichier.", danger=True)
                self.nav()
            elif self.step == 4:
                self.heading("Vérification")
                self.paragraph("Base : " + str(Path(self.data_dir.get()) / setup_core.DB_NAME))
                if not args.no_launcher and not args.no_shortcut:
                    self.paragraph(
                        "Un raccourci « LaaS Version App » sera créé automatiquement.",
                        bold=True,
                    )
                self.paragraph("Comptes qui seront créés :")
                for index in range(self.count.get()):
                    self.paragraph("• " + self.identifiers[index].get())
                self.paragraph(
                    "N'OUBLIE PAS ces identifiants et ces mots de passe. Il n'existe pas de "
                    "récupération automatique et aucun mot de passe ne sera sauvegardé en clair.",
                    danger=True, bold=True,
                )
                self.nav(label="Installer", command=self.install)
            else:
                self.heading("Installation terminée")
                self.paragraph("Base : " + self.info.get("database", ""))
                self.paragraph("Marqueur : " + self.info.get("marker", ""))
                if self.info.get("launcher"):
                    self.paragraph("Lanceur : " + self.info["launcher"])
                shortcut = self.info.get("shortcut", {})
                if shortcut.get("status") == "created":
                    self.paragraph("Raccourci : " + shortcut["path"], bold=True)
                elif shortcut.get("status") == "failed":
                    self.paragraph(
                        "Raccourci non créé : " + shortcut.get("reason", ""), danger=True
                    )
                self.paragraph(
                    "Garde tes identifiants et tes mots de passe en lieu sûr. "
                    "L'application te les demandera à l'ouverture.",
                    danger=True, bold=True,
                )
                self.nav(back=False, label="Terminer", command=self.destroy)

    Wizard().mainloop()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.headless or args.account:
        return run_headless(args)
    try:
        return run_gui(args)
    except ImportError as exc:
        print(f"Interface graphique indisponible ({exc}).", file=sys.stderr)
        print("Utilise --headless avec --account pour installer sans fenêtre.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
