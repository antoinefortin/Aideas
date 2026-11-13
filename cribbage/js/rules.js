'use strict';
/* ============================================================
   Règles complètes du cribbage à 2 joueurs (en français)
   ============================================================ */

const RULES = [
  {
    id: 'but', title: '1. Le but',
    html: `
      <p>Le cribbage se joue à 2 avec un paquet de 52 cartes et une <b>planche</b> percée de trous.
      Le premier joueur à atteindre <b>121 points</b> gagne. La partie s'arrête <b>immédiatement</b>
      dès que quelqu'un atteint 121, même au milieu d'une main.</p>
      <p>On marque des points à <b>trois moments</b> de chaque main :</p>
      <ol>
        <li><b>La coupe</b> : si la carte retournée est un valet, le donneur marque 2 points.</li>
        <li><b>Le jeu</b> (« pegging ») : les joueurs posent leurs cartes une à une et marquent en cours de route.</li>
        <li><b>Le compte</b> (« show ») : chacun compte sa main, puis le donneur compte le crib.</li>
      </ol>
      <h4>La planche et les chevilles</h4>
      <p>Chaque joueur a deux chevilles. Pour marquer, on prend la cheville <b>arrière</b> et on la plante
      devant l'autre, du nombre de trous gagnés. Ainsi, l'écart entre les deux chevilles montre toujours
      les derniers points marqués — ce qui permet à l'adversaire de vérifier.</p>`,
  },
  {
    id: 'cartes', title: '2. Valeur et rang des cartes',
    html: `
      <p>Chaque carte a <b>deux</b> propriétés à ne pas confondre :</p>
      <table class="rt">
        <tr><th>Carte</th><th>Valeur (pour 15 et 31)</th><th>Rang (pour paires et suites)</th></tr>
        <tr><td>As</td><td>1</td><td>1 (toujours bas)</td></tr>
        <tr><td>2 à 10</td><td>son chiffre</td><td>son chiffre</td></tr>
        <tr><td>Valet (J)</td><td>10</td><td>11</td></tr>
        <tr><td>Dame (Q)</td><td>10</td><td>12</td></tr>
        <tr><td>Roi (K)</td><td>10</td><td>13</td></tr>
      </table>
      <p>Donc un 10 et un roi font tous les deux 10 pour compter, mais <b>ne forment pas une paire</b>.
      Et 10-J-Q est une suite, mais Q-K-A n'en est pas une (l'As ne suit jamais le roi).</p>
      <p>Les sortes (♠ ♥ ♦ ♣) ne servent que pour la <b>couleur</b> et le <b>nobs</b>.</p>`,
  },
  {
    id: 'donne', title: '3. Donne et crib',
    html: `
      <h4>Qui donne ?</h4>
      <p>Pour la première main, chaque joueur coupe le paquet : la <b>carte la plus basse donne</b>
      (égalité = on recoupe). Ensuite, le rôle de donneur alterne à chaque main.</p>
      <h4>La donne</h4>
      <p>Le donneur distribue <b>6 cartes</b> à chacun, une à la fois, en commençant par l'adversaire
      (qu'on appelle le <b>non-donneur</b>, ou « pone » en anglais).</p>
      <h4>L'écart et le crib</h4>
      <p>Chaque joueur choisit <b>2 cartes</b> qu'il met face cachée dans le <b>crib</b>. Le crib (4 cartes)
      appartient au <b>donneur</b> : il le comptera pour lui à la fin de la main. Chacun garde donc 4 cartes.</p>
      <ul>
        <li>Si c'est <b>ton</b> crib : tu peux y mettre de bonnes cartes (5, paires, cartes qui font 15 ensemble, cartes qui se suivent).</li>
        <li>Si c'est le crib de l'<b>adversaire</b> : évite de lui donner des points. Bons écarts : cartes éloignées l'une de l'autre, roi, et cartes qui ne font pas 15.</li>
      </ul>
      <h4>La coupe (la carte de départ)</h4>
      <p>Le non-donneur coupe le paquet, le donneur retourne la carte du dessus et la pose face visible :
      c'est la <b>coupe</b>. Elle ne se joue pas, mais elle compte comme 5e carte dans <b>chaque main et dans le crib</b>.</p>
      <p>Si la coupe est un <b>valet</b>, le donneur marque immédiatement <b>2 points</b> (« his heels » ou « his nibs »).</p>`,
  },
  {
    id: 'jeu', title: '4. Le jeu (pegging)',
    html: `
      <p>Le <b>non-donneur commence</b>. À tour de rôle, chaque joueur pose une carte face visible devant lui
      et annonce le <b>total cumulatif</b> des cartes posées (ex. « 7 », puis « 15 »…). Le total ne peut
      <b>jamais dépasser 31</b>.</p>
      <h4>Points pendant le jeu</h4>
      <table class="rt">
        <tr><th>Situation</th><th>Points</th></tr>
        <tr><td>Le total arrive à 15 pile</td><td>2</td></tr>
        <tr><td>Le total arrive à 31 pile</td><td>2</td></tr>
        <tr><td>Paire : même rang que la carte qui vient d'être jouée</td><td>2</td></tr>
        <tr><td>Brelan : 3 cartes de même rang de suite</td><td>6</td></tr>
        <tr><td>Carré : 4 cartes de même rang de suite</td><td>12</td></tr>
        <tr><td>Suite : les 3 dernières cartes (ou plus) forment une suite, <b>dans n'importe quel ordre</b></td><td>1 par carte</td></tr>
        <tr><td>Go : l'adversaire ne peut plus jouer et tu as posé la dernière carte</td><td>1</td></tr>
        <tr><td>Dernière carte de la main jouée</td><td>1</td></tr>
      </table>
      <h4>Le « Go »</h4>
      <p>Si tu ne peux poser aucune carte sans dépasser 31, tu dis <b>« Go »</b>. Tu n'as pas le choix :
      si tu peux jouer, <b>tu dois jouer</b>. L'adversaire continue alors à poser des cartes <b>tant qu'il peut</b>
      (et il marque normalement ses 15, paires, suites). Quand plus personne ne peut jouer, celui qui a posé la
      dernière carte marque <b>1 point</b> pour le go — ou <b>2 points</b> s'il a atteint 31 pile (pas les deux).</p>
      <p>Ensuite le total repart à <b>zéro</b>, et c'est le joueur qui <b>n'a pas</b> joué la dernière carte qui recommence.
      Les paires et suites ne se prolongent jamais par-dessus une remise à zéro.</p>
      <h4>La dernière carte</h4>
      <p>Celui qui joue la toute dernière carte de la main marque <b>1 point</b> (sauf s'il fait 31 : il marque alors 2, pas 3).</p>
      <h4>Exemples de suites au jeu</h4>
      <ul>
        <li>4, puis 6, puis 5 → les 3 dernières cartes (4-6-5) forment une suite : <b>3 points</b> pour celui qui joue le 5.</li>
        <li>Suite : 4-6-5, puis 3 → 4-6-5-3 = suite de 4 : <b>4 points</b>.</li>
        <li>4, 6, 6, 5 → les 3 dernières (6-6-5) ne forment pas une suite à cause du doublon : <b>0</b> pour la suite.</li>
      </ul>
      <h4>Exemples de paires au jeu</h4>
      <ul>
        <li>7 puis 7 → paire, 2 points. Un troisième 7 → brelan, 6 points pour celui qui le pose.</li>
        <li>7, 8, 7 → pas de paire : les cartes pareilles doivent se suivre directement.</li>
      </ul>`,
  },
  {
    id: 'compte', title: '5. Le compte des mains',
    html: `
      <p>Après le jeu, chacun reprend ses 4 cartes et on compte, <b>toujours dans cet ordre</b> :</p>
      <ol>
        <li>la main du <b>non-donneur</b>;</li>
        <li>la main du <b>donneur</b>;</li>
        <li>le <b>crib</b> (pour le donneur).</li>
      </ol>
      <p>Cet ordre est crucial en fin de partie : le non-donneur compte en premier et peut atteindre 121
      avant même que le donneur compte sa main !</p>
      <p>Chaque main se compte avec ses <b>4 cartes + la coupe</b>. On cherche les combinaisons suivantes,
      et on les annonce dans cet ordre :</p>
      <table class="rt">
        <tr><th>Combinaison</th><th>Points</th></tr>
        <tr><td><b>Quinze</b> : toute combinaison de cartes (2, 3, 4 ou 5) dont la valeur totale fait 15</td><td>2 chacune</td></tr>
        <tr><td><b>Paire</b> : 2 cartes de même rang (3 pareilles = 3 paires = 6 ; 4 pareilles = 6 paires = 12)</td><td>2 chacune</td></tr>
        <tr><td><b>Suite</b> : 3 cartes ou plus de rangs consécutifs (seule la plus longue compte)</td><td>1 par carte</td></tr>
        <tr><td><b>Couleur</b> (main) : 4 cartes de la main de même sorte (+1 si la coupe aussi)</td><td>4 ou 5</td></tr>
        <tr><td><b>Couleur</b> (crib) : les 5 cartes de même sorte, seulement</td><td>5</td></tr>
        <tr><td><b>Nobs</b> : le valet de la main de même sorte que la coupe</td><td>1</td></tr>
      </table>
      <h4>Les règles importantes</h4>
      <ul>
        <li>Une même carte peut servir dans <b>plusieurs</b> combinaisons (plusieurs quinzes, une paire et une suite…).</li>
        <li>Deux combinaisons sont différentes si elles n'utilisent pas exactement les mêmes cartes.</li>
        <li>Suites avec doublon : 4-5-5-6 contient <b>deux</b> suites de 3 (une avec chaque 5), plus la paire de 5.</li>
        <li>Suites : seule la plus longue compte. 3-4-5-6 = une suite de 4 (pas deux suites de 3).</li>
      </ul>
      <h4>L'annonce</h4>
      <p>On compte à voix haute en cumulant : « <i>Quinze-deux, quinze-quatre, une paire fait six, une suite de trois fait neuf.</i> »</p>
      <h4>Exemple complet : 5♥ 5♠ 6♦ 4♣ + coupe J♥</h4>
      <ul>
        <li>Quinzes : 5♥+J♥, 5♠+J♥, 5♥+6♦+4♣, 5♠+6♦+4♣ → 4 quinzes = 8</li>
        <li>Paire : 5♥ 5♠ → 2 (total 10)</li>
        <li>Suites : 4-5♥-6 et 4-5♠-6 → 2 suites de 3 = 6 (total 16)</li>
        <li>Couleur : non. Nobs : le valet est la coupe, il ne compte pas → total <b>16</b>.</li>
      </ul>`,
  },
  {
    id: 'raccourcis', title: '6. Combinaisons à connaître',
    html: `
      <p>Les bons joueurs reconnaissent ces groupes d'un coup d'œil. Mais apprends d'abord à les compter
      combinaison par combinaison — c'est ce que fait le mode guidé du jeu.</p>
      <table class="rt">
        <tr><th>Groupe</th><th>Exemple</th><th>Points (sans les quinzes)</th></tr>
        <tr><td>Double suite de 3</td><td>4-5-5-6</td><td>2 suites (6) + 1 paire (2) = 8</td></tr>
        <tr><td>Double suite de 4</td><td>3-4-5-5-6</td><td>2 suites (8) + 1 paire (2) = 10</td></tr>
        <tr><td>Triple suite</td><td>4-5-5-5-6</td><td>3 suites (9) + 3 paires (6) = 15</td></tr>
        <tr><td>Double-double suite</td><td>4-4-5-5-6</td><td>4 suites (12) + 2 paires (4) = 16</td></tr>
        <tr><td>Brelan</td><td>7-7-7</td><td>3 paires = 6</td></tr>
        <tr><td>Carré</td><td>5-5-5-5</td><td>6 paires = 12</td></tr>
      </table>
      <h4>Mains célèbres</h4>
      <ul>
        <li><b>29</b> — la main parfaite : 5-5-5-J avec la coupe le 5 de la même sorte que le valet.
          (8 quinzes = 16, 6 paires = 12, nobs = 1.)</li>
        <li><b>28</b> — 5-5-5-5 avec une carte de 10 en coupe.</li>
        <li><b>24</b> — 4-4-5-5-6, 7-7-8-8-9 ou 3-3-3-3-9 (avec les quinzes).</li>
        <li><b>19, 25, 26, 27</b> — impossibles ! C'est pourquoi on dit « j'ai dix-neuf » pour dire « zéro ».</li>
      </ul>`,
  },
  {
    id: 'fin', title: '7. Fin de partie',
    html: `
      <p>Le premier à <b>121</b> gagne, sur-le-champ. Pas besoin de finir la main.</p>
      <h4>Le skunk</h4>
      <ul>
        <li>Si le perdant n'a pas dépassé <b>90</b> points (il n'a pas franchi la « ligne de skunk »), c'est un
          <b>skunk</b> : la victoire compte double.</li>
        <li>S'il n'a pas dépassé <b>60</b>, c'est un <b>double skunk</b> (compte triple, selon les règles maison).</li>
      </ul>
      <h4>Muggins (variante)</h4>
      <p>Avec la règle du « muggins », si un joueur oublie des points en comptant sa main, son adversaire
      peut crier « Muggins ! » et prendre ces points pour lui. Tu peux activer cette règle dans les options.</p>`,
  },
  {
    id: 'strategie', title: '8. Stratégie de base',
    html: `
      <h4>À l'écart</h4>
      <ul>
        <li>Garde les combinaisons qui valent déjà des points (quinzes, paires, suites) : la coupe ne fera qu'ajouter.</li>
        <li>Les <b>5</b> sont précieux : 16 cartes sur 52 valent 10 et font 15 avec eux. Ne les donne pas au crib adverse.</li>
        <li>Pour ton propre crib, tu peux sacrifier un peu de ta main pour y mettre 5-5, 7-8, 5-10…</li>
        <li>Le bouton « Conseil » du jeu calcule la moyenne exacte de chaque écart sur les 46 coupes possibles.</li>
      </ul>
      <h4>Au jeu</h4>
      <ul>
        <li>Une entame <b>sous 5</b> (A, 2, 3, 4) empêche l'adversaire de faire 15 tout de suite.</li>
        <li>Évite de laisser le total à <b>5</b> ou à <b>21</b> : une carte de 10 donnerait 15 ou 31 à l'adversaire.</li>
        <li>Faire une paire est payant, mais l'adversaire peut répliquer un brelan (6 pts).</li>
        <li>Deux cartes proches (ex. 6 puis 7) invitent l'adversaire à faire une suite.</li>
        <li>Garde une petite carte pour la fin : elle permet souvent de jouer quand l'autre doit dire go.</li>
      </ul>`,
  },
  {
    id: 'glossaire', title: '9. Glossaire',
    html: `
      <dl class="gloss">
        <dt>Coupe</dt><dd>Carte retournée après l'écart (« starter »). Elle compte dans toutes les mains.</dd>
        <dt>Crib</dt><dd>Les 4 cartes écartées par les deux joueurs ; elles appartiennent au donneur.</dd>
        <dt>Donneur / non-donneur</dt><dd>Celui qui distribue / son adversaire (« pone »).</dd>
        <dt>Go</dt><dd>Annonce faite quand on ne peut plus jouer sans dépasser 31.</dd>
        <dt>His heels</dt><dd>La coupe est un valet : 2 points pour le donneur.</dd>
        <dt>Nobs (his nobs)</dt><dd>Valet de la main de même sorte que la coupe : 1 point.</dd>
        <dt>Pegging</dt><dd>Le jeu des cartes une à une, et le fait d'avancer ses chevilles.</dd>
        <dt>Show</dt><dd>Le compte des mains et du crib.</dd>
        <dt>Skunk</dt><dd>Gagner alors que l'adversaire n'a pas atteint 91 points.</dd>
        <dt>Muggins</dt><dd>Variante où l'on prend les points oubliés par l'adversaire.</dd>
      </dl>`,
  },
];
