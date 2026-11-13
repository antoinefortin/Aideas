'use strict';
/* ============================================================
   Pointage : mains (le « show ») et jeu (le « pegging »)
   ============================================================ */

const Scoring = (() => {
  const NUM_FR = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt',
    'vingt et un', 'vingt-deux', 'vingt-trois', 'vingt-quatre', 'vingt-cinq', 'vingt-six', 'vingt-sept',
    'vingt-huit', 'vingt-neuf'];

  const TYPE_ORDER = ['fifteen', 'pair', 'run', 'flush', 'nobs'];

  function subsets(arr) {
    const out = [];
    const n = arr.length;
    for (let m = 1; m < (1 << n); m++) {
      const s = [];
      for (let i = 0; i < n; i++) if (m & (1 << i)) s.push(arr[i]);
      out.push(s);
    }
    return out;
  }

  function isRun(cards) {
    if (cards.length < 3) return false;
    const r = cards.map(c => c.rank).sort((a, b) => a - b);
    for (let i = 1; i < r.length; i++) if (r[i] !== r[i - 1] + 1) return false;
    return true;
  }

  function sum(cards) { return cards.reduce((a, c) => a + cardValue(c), 0); }

  /** Longueur de la plus longue suite présente dans ces cartes (0 si aucune). */
  function maxRunLength(cards) {
    const subs = subsets(cards);
    for (let L = cards.length; L >= 3; L--) {
      if (subs.some(s => s.length === L && isRun(s))) return L;
    }
    return 0;
  }

  /**
   * Compte une main de 4 cartes (+ la coupe). Retourne toutes les combinaisons.
   * starter peut être null (évaluation d'une main avant la coupe).
   */
  function scoreHand(hand, starter, isCrib) {
    const all = starter ? hand.concat([starter]) : hand.slice();
    const subs = subsets(all);
    const combos = [];

    // 1. Quinzes : toute combinaison de cartes dont la somme fait 15
    for (const s of subs) {
      if (s.length >= 2 && sum(s) === 15) combos.push({ type: 'fifteen', cards: sortCards(s), points: 2 });
    }
    // 2. Paires : chaque couple de cartes de même rang
    for (const s of subs) {
      if (s.length === 2 && s[0].rank === s[1].rank) combos.push({ type: 'pair', cards: sortCards(s), points: 2 });
    }
    // 3. Suites : seules les plus longues comptent
    let L = 0;
    for (let k = all.length; k >= 3 && !L; k--) {
      if (subs.some(s => s.length === k && isRun(s))) L = k;
    }
    if (L) {
      for (const s of subs) if (s.length === L && isRun(s)) combos.push({ type: 'run', cards: sortCards(s), points: L });
    }
    // 4. Couleur
    if (hand.length === 4 && hand.every(c => c.suit === hand[0].suit)) {
      if (starter && starter.suit === hand[0].suit) combos.push({ type: 'flush', cards: sortCards(all), points: 5 });
      else if (!isCrib) combos.push({ type: 'flush', cards: sortCards(hand), points: 4 });
    }
    // 5. Nobs : valet de la main de même sorte que la coupe
    if (starter) {
      for (const c of hand) if (c.rank === 11 && c.suit === starter.suit) combos.push({ type: 'nobs', cards: [c], points: 1 });
    }
    const total = combos.reduce((a, c) => a + c.points, 0);
    return { total, combos };
  }

  function quickTotal(hand, starter, isCrib) {
    return scoreHand(hand, starter, isCrib).total;
  }

  /**
   * Points marqués au jeu par la DERNIÈRE carte de la séquence.
   * pile = cartes jouées depuis la dernière remise à zéro, count = total.
   */
  function scorePegging(pile, count) {
    const res = [];
    const last = pile[pile.length - 1];
    if (count === 15) res.push({ type: 'fifteen', points: 2 });
    if (count === 31) res.push({ type: 'thirtyone', points: 2 });
    let n = 1;
    for (let i = pile.length - 2; i >= 0 && pile[i].rank === last.rank; i--) n++;
    if (n >= 2) res.push({ type: 'pair', n, points: n === 2 ? 2 : n === 3 ? 6 : 12, cards: pile.slice(-n) });
    for (let k = pile.length; k >= 3; k--) {
      const seg = pile.slice(-k);
      const r = seg.map(c => c.rank);
      if (new Set(r).size === k && Math.max(...r) - Math.min(...r) === k - 1) {
        res.push({ type: 'run', points: k, cards: seg });
        break;
      }
    }
    return res;
  }

  function pegLabel(s) {
    switch (s.type) {
      case 'fifteen': return 'quinze (2)';
      case 'thirtyone': return 'trente et un (2)';
      case 'pair': return s.n === 2 ? 'paire (2)' : s.n === 3 ? 'brelan — 3 pareilles (6)' : 'carré — 4 pareilles (12)';
      case 'run': return 'suite de ' + s.points + ' (' + s.points + ')';
    }
    return '';
  }

  function pegExplain(s, count) {
    switch (s.type) {
      case 'fifteen': return 'Le compte arrive à 15 pile : 2 points.';
      case 'thirtyone': return 'Le compte arrive à 31 pile : 2 points, et le compte repart à zéro.';
      case 'pair':
        if (s.n === 2) return 'Même rang que la carte précédente : une paire, 2 points.';
        if (s.n === 3) return 'Trois cartes pareilles de suite : 3 paires = 6 points.';
        return 'Quatre cartes pareilles de suite : 6 paires = 12 points.';
      case 'run': return `Les ${s.points} dernières cartes (${miniCards(sortCards(s.cards))}) forment une suite, peu importe l'ordre joué : ${s.points} points.`;
    }
    return '';
  }

  function comboLabel(c) {
    switch (c.type) {
      case 'fifteen': return 'Quinze';
      case 'pair': return 'Paire';
      case 'run': return 'Suite de ' + c.points;
      case 'flush': return 'Couleur de ' + c.points;
      case 'nobs': return 'Nobs';
    }
    return '';
  }

  function comboDetail(c, starter) {
    const sid = starter ? starter.id : null;
    switch (c.type) {
      case 'fifteen':
        return c.cards.map(x => miniCard(x, sid)).join(' + ') +
          ' <span class="eq">= ' + c.cards.map(cardValue).join(' + ') + ' = 15</span>';
      case 'pair': return miniCards(c.cards, sid, ' ');
      case 'run': return miniCards(c.cards, sid, ' – ');
      case 'flush': return miniCards(c.cards, sid, ' ') + ' <span class="eq">tous ' + SUITS[c.cards[0].suit].sym + '</span>';
      case 'nobs': return miniCard(c.cards[0], sid) + ' <span class="eq">même sorte que la coupe ' + miniCard(starter, sid) + '</span>';
    }
    return '';
  }

  /** Annonce à voix haute, comme le font les joueurs : « Quinze-deux, quinze-quatre… » */
  function announce(combos) {
    let t = 0;
    const parts = [];
    for (const c of combos) {
      t += c.points;
      const n = NUM_FR[t] || String(t);
      switch (c.type) {
        case 'fifteen': parts.push('quinze-' + n); break;
        case 'pair': parts.push('une paire fait ' + n); break;
        case 'run': parts.push('une suite de ' + NUM_FR[c.points] + ' fait ' + n); break;
        case 'flush': parts.push('une couleur de ' + NUM_FR[c.points] + ' fait ' + n); break;
        case 'nobs': parts.push('et le nobs fait ' + n); break;
      }
    }
    if (!parts.length) return 'Rien du tout : zéro point. (Les joueurs disent souvent « dix-neuf » pour une main nulle, car 19 est impossible à obtenir.)';
    const s = parts.join(', ');
    return s[0].toUpperCase() + s.slice(1) + '.';
  }

  /** Raccourcis classiques reconnus dans la main (pour l'apprentissage). */
  function patternNotes(res) {
    const notes = [];
    const pairs = res.combos.filter(c => c.type === 'pair');
    const runs = res.combos.filter(c => c.type === 'run');
    const byRank = {};
    pairs.forEach(p => { byRank[p.cards[0].rank] = (byRank[p.cards[0].rank] || 0) + 1; });
    for (const r in byRank) {
      const n = byRank[r];
      if (n === 3) notes.push(`Trois ${RANK_LABEL[r]} forment <b>3 paires différentes</b> (un brelan) : 3 × 2 = 6 points.`);
      if (n === 6) notes.push(`Quatre ${RANK_LABEL[r]} forment <b>6 paires différentes</b> (un carré) : 6 × 2 = 12 points.`);
    }
    if (runs.length >= 2) {
      const L = runs[0].points, r = runs.length;
      if (r === 2) notes.push(`<b>Double suite de ${L}</b> : 2 suites de ${L} (${2 * L}) + 1 paire (2) = ${2 * L + 2} points, avant les quinzes. Raccourci à retenir !`);
      if (r === 3) notes.push(`<b>Triple suite de ${L}</b> : 3 suites de ${L} (${3 * L}) + 3 paires (6) = ${3 * L + 6} points, avant les quinzes.`);
      if (r === 4) notes.push(`<b>Double-double suite</b> : 4 suites de 3 (12) + 2 paires (4) = 16 points, avant les quinzes.`);
    }
    const fif = res.combos.filter(c => c.type === 'fifteen').length;
    if (fif >= 4) notes.push(`${fif} quinzes différents = ${fif * 2} points. Une même carte peut servir dans plusieurs quinzes.`);
    if (res.total === 29) notes.push('🏆 <b>29 : la main parfaite</b>, le maximum possible au cribbage !');
    return notes;
  }

  return {
    NUM_FR, TYPE_ORDER, subsets, isRun, sum, maxRunLength, scoreHand, quickTotal,
    scorePegging, pegLabel, pegExplain, comboLabel, comboDetail, announce, patternNotes,
  };
})();
