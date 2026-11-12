# Tabflow — EQ & Volume Booster

Un petit studio audio pour le son de tes onglets Chrome. Aucun serveur, aucun compte, aucun enregistrement audio.

## Installation

1. Télécharge ou clone ce dépôt.
2. Ouvre `chrome://extensions` et active **Mode développeur**.
3. Clique sur **Charger l’extension non empaquetée** et sélectionne le dossier **tabflow**.
4. Épingle Tabflow dans le menu Extensions de Chrome.
5. Ouvre une page avec du son, clique sur Tabflow puis **Activer sur cet onglet**.

Chrome 116 ou plus récent. Aucun build ni dépendance à installer.

## Ce que tu peux ajuster

- Volume de 0 à 400 %.
- Égaliseur six bandes, de −12 à +12 dB : 60, 170, 350, 1 000, 3 500 et 10 000 Hz.
- Préréglages : neutre, musique, voix/podcasts, cinéma et basses profondes.
- Renforcement des basses et clarté des voix.
- Ambiance avec un écho court de 120 ms.
- Mode nuit avec compression pour réduire les écarts de volume.
- Mono pour réunir les deux canaux.
- Son original pour comparer avec les effets désactivés et le volume à 100 %.
- Réinitialisation et désactivation pour restaurer la lecture normale.

Les effets restent actifs en fermant le panneau. Tu peux activer plusieurs onglets, chacun avec ses propres réglages. Les derniers réglages modifiés sont sauvegardés localement et servent de point de départ aux nouveaux onglets. Une fermeture d’onglet termine son traitement. Redémarrer Chrome ou recharger l’extension nécessite de réactiver les onglets.

## Limites

Le volume réel dépend de la source et de tes haut-parleurs. Le boost et les gains EQ peuvent saturer; un compresseur en sortie réduit les crêtes, sans garantir l’absence de distorsion. À fort niveau, le compresseur peut limiter l’augmentation perçue. Le mode Son original conserve ce compresseur de sortie. Le traitement peut ajouter une légère latence.

Les pages internes de Chrome et certains contenus protégés ne peuvent pas être capturés. Une autre extension qui capture déjà le même onglet (dont Tabtone) peut empêcher l’activation : arrête l’autre capture avant de démarrer Tabflow. Aucun micro n’est utilisé. Chrome peut afficher son indicateur de capture, même si le son n’est ni enregistré ni envoyé.

## Vérification

`npm test` vérifie les limites des réglages, les préréglages et le circuit audio avec des objets simulés : volume, EQ, comparaison, isolation des onglets et nettoyage.

À vérifier dans Chrome après installation :

1. Lire un morceau, activer Tabflow et vérifier que le son continue.
2. Modifier volume, EQ et effets; comparer avec Son original.
3. Fermer/réouvrir le panneau et vérifier que les réglages restent actifs.
4. Activer un second onglet et vérifier que ses réglages sont indépendants.
5. Désactiver Tabflow et vérifier le retour à la lecture normale.
6. Fermer un onglet traité et vérifier que les autres restent actifs.

Architecture : Manifest V3, tabCapture, document offscreen et Web Audio API. Permissions : activeTab (onglet sélectionné), tabCapture (flux audio), offscreen (traitement en arrière-plan) et storage (réglages). Pas d’accès global aux sites.

Documentation Chrome : https://developer.chrome.com/docs/extensions/reference/api/tabCapture/
