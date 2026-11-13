# AudioDock

Application Windows x64 en C# / WPF (.NET 8). Interface française sombre.

## Démarrage

1. Installer .NET Desktop Runtime 8 x64 : https://dotnet.microsoft.com/download/dotnet/8.0
2. Lancer `AudioDock.exe` dans le dossier `app` du ZIP.
3. Cliquer sur **Installer / mettre à jour les outils**. Le logiciel télécharge yt-dlp depuis son dépôt GitHub, FFmpeg depuis Gyan.dev et Deno depuis son dépôt GitHub. Cela peut prendre quelques minutes. Les outils restent dans `%LOCALAPPDATA%\AudioDock\tools`.
4. Coller une URL HTTPS YouTube par ligne, puis **Ajouter à la file**.
5. Saisir ou coller un chemin complet (par exemple `D:\Musique\Mes MP3`) dans le champ de destination, ou utiliser **Parcourir**, puis choisir le débit et **Démarrer**. Les variables comme `%USERPROFILE%` sont acceptées et les dossiers inexistants sont créés au lancement. Le chemin est mémorisé et ne peut pas être modifié pendant un export.

Pour une chaîne, utiliser son onglet `/videos`, `/shorts`, `/streams` ou `/playlists` pour choisir les contenus. Une URL de vidéo contenant `list=` est traitée comme une playlist. Les exports de grandes chaînes peuvent prendre longtemps. Les sources sont traitées successivement ; chaque playlist/chaîne est parcourue par yt-dlp.

Par défaut, les MP3 sont enregistrés directement dans le dossier choisi. Décocher **Enregistrer directement dans ce dossier** pour les classer dans des sous-dossiers par créateur et playlist. L'identifiant vidéo évite les collisions de titres. Métadonnées et pochette sont intégrées. Le débit sélectionné ne peut pas améliorer la qualité de la source. Changer ce réglage ne déplace pas les fichiers déjà téléchargés ; l'archive continue d'ignorer les vidéos déjà exportées dans cette destination.

**Arrêter** termine le processus et ses enfants. **Démarrer** reprend les sources non terminées ; les fichiers partiels sont repris lorsque possible. L'archive `.audiodock-archive.txt`, dans le dossier de sortie, évite de réexporter les vidéos déjà traitées. Changer de qualité ne reconvertit pas les fichiers existants ; utiliser un nouveau dossier pour un autre export.

La file incomplète et les préférences sont sauvegardées dans `%LOCALAPPDATA%\AudioDock\settings.json`. Le journal affiché aide à diagnostiquer les vidéos indisponibles. En cas d'erreur YouTube, mettre les outils à jour. Aucun contournement de DRM, abonnement ou connexion n'est fourni. Certaines vidéos nécessitant une connexion ou des vérifications YouTube ne fonctionneront pas. Utiliser uniquement pour les contenus que vous êtes autorisé à télécharger.

## Compiler

### VS Code et CMake

Ouvrir `AudioDock.code-workspace` dans VS Code. Prérequis : SDK .NET 8 ou supérieur, CMake 3.24 ou supérieur et Ninja dans le PATH. Installer les extensions recommandées C#, C# Dev Kit et CMake Tools.

- `Ctrl+Shift+B` : configurer et compiler en Debug.
- `F5` : compiler et démarrer le débogueur C#.
- Terminal > Run Task > AudioDock: publish Release : publier en Release.
- `AudioDock.sln` est également fourni pour Visual Studio ou C# Dev Kit.

Depuis le dossier contenant `CMakeLists.txt` :

```powershell
cmake --preset debug
cmake --build --preset debug
cmake --build build/debug --target run

cmake --preset release
cmake --build --preset publish
```

Sorties : `build/debug/app/AudioDock.exe` et `build/release/publish/AudioDock.exe`.
CMake orchestre le SDK .NET via des cibles personnalisées ; le `.csproj` reste le projet C# de référence. Les presets utilisent Ninja et ne nécessitent pas le compilateur C++ de Visual Studio.

Avec le SDK .NET 8 ou supérieur, sous Windows :

```powershell
dotnet build AudioDock.csproj -c Release
dotnet publish AudioDock.csproj -c Release -o app
```

Projet sans dépendances NuGet tierces. L'exécutable distribué nécessite le runtime Desktop .NET 8 ; il n'est pas autonome.

## Dépendances et licences

Les outils sont téléchargés séparément et ne sont pas inclus dans cette distribution :

- yt-dlp : https://github.com/yt-dlp/yt-dlp (licences et dépendances : voir le dépôt)
- FFmpeg : https://ffmpeg.org et https://www.gyan.dev/ffmpeg/builds/ (build essentials Gyan, GPL ; sources/licences disponibles chez le fournisseur)
- Deno : https://github.com/denoland/deno (MIT)

## Validation

Compilation Release réalisée sous Windows. Le téléchargement réel de vidéos n'est pas validé dans cette livraison ; son fonctionnement dépend de YouTube et des versions des outils. Les téléchargements restent soumis aux limitations et aux erreurs signalées par yt-dlp.
