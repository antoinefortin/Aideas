'use strict';
/* ============================================================
   Intelligence de l'ordinateur + conseils pour le joueur
   ============================================================ */

const AI = (() => {
  // Générateur pseudo-aléatoire déterministe (pour des conseils stables)
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /**
   * Évalue les 15 façons d'écarter 2 cartes parmi 6.
   * - handAvg : moyenne exacte de la main sur les 46 coupes possibles
   * - cribAvg : estimation du crib (échantillonnage des 2 cartes adverses + coupe)
   * - net : valeur attendue pour soi (crib ajouté si on donne, soustrait sinon)
   */
  function discardOptions(hand6, isDealer, nSamples = 360) {
    const rest = newDeck().filter(c => !hand6.some(h => h.id === c.id));
    const R = mulberry32(hashStr(hand6.map(c => c.id).sort().join('')));
    const samples = [];
    for (let i = 0; i < nSamples; i++) {
      const idx = new Set();
      while (idx.size < 3) idx.add(Math.floor(R() * rest.length));
      const [a, b, s] = [...idx];
      samples.push({ opp: [rest[a], rest[b]], starter: rest[s] });
    }
    const opts = [];
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
      const discard = [hand6[i], hand6[j]];
      const keep = hand6.filter((_, k) => k !== i && k !== j);
      const base = Scoring.quickTotal(keep, null, false);
      let hs = 0;
      for (const s of rest) hs += Scoring.quickTotal(keep, s, false);
      const handAvg = hs / rest.length;
      let cs = 0;
      for (const smp of samples) cs += Scoring.quickTotal(discard.concat(smp.opp), smp.starter, true);
      const cribAvg = cs / samples.length;
      opts.push({
        keep: sortCards(keep), discard: sortCards(discard), base, handAvg, cribAvg,
        net: handAvg + (isDealer ? cribAvg : -cribAvg),
      });
    }
    opts.sort((a, b) => b.net - a.net);
    return opts;
  }

  function chooseDiscard(hand6, isDealer) {
    const opts = discardOptions(hand6, isDealer);
    // Légère variété parmi les choix presque égaux
    const near = opts.filter(o => opts[0].net - o.net < 0.15);
    return near[randInt(near.length)];
  }

  /** Évalue chaque carte jouable au pegging, avec des explications. */
  function evalPlays(hand, pile, count) {
    const legal = hand.filter(c => count + cardValue(c) <= 31);
    return legal.map(c => {
      const nc = count + cardValue(c);
      const np = pile.concat([c]);
      const scores = Scoring.scorePegging(np, nc);
      const pts = scores.reduce((a, s) => a + s.points, 0);
      let risk = 0;
      const notes = [];
      if (nc !== 31) {
        const n15 = 15 - nc;
        if (n15 >= 1 && n15 <= 10) {
          if (n15 === 10) { risk += 0.9; notes.push(`laisse le compte à ${nc} : une carte de 10 (10, J, Q, K) donnerait 15 à l'adversaire`); }
          else { risk += 0.35; notes.push(`l'adversaire ferait 15 avec un ${n15 === 1 ? 'As' : n15}`); }
        }
        const n31 = 31 - nc;
        if (n31 >= 1 && n31 <= 10) {
          if (n31 === 10) { risk += 0.9; notes.push(`laisse le compte à ${nc} : une carte de 10 donnerait 31 à l'adversaire`); }
          else { risk += 0.35; notes.push(`l'adversaire ferait 31 avec un ${n31 === 1 ? 'As' : n31}`); }
        }
        const pair = scores.find(s => s.type === 'pair');
        if (pair) {
          risk += pair.n === 2 ? 1.4 : 1.2;
          notes.push(pair.n === 2 ? 'après ta paire, l\'adversaire pourrait faire un brelan (6 pts)' : 'l\'adversaire pourrait compléter un carré (12 pts)');
        }
        if (pile.length && !pair) {
          const d = Math.abs(pile[pile.length - 1].rank - c.rank);
          if (d === 1 || d === 2) { risk += 0.6; notes.push('carte proche de la précédente : l\'adversaire pourrait faire une suite'); }
        }
      }
      if (count === 0) {
        if (c.rank === 5) { risk += 1; notes.push('entamer un 5 est risqué : 16 cartes valent 10 et feraient 15'); }
        else if (c.rank < 5) { risk -= 0.5; notes.push('entame sous 5 : l\'adversaire ne peut pas faire 15 tout de suite'); }
        else if (cardValue(c) === 10) { notes.push('entamer une carte de 10 est correct, mais l\'adversaire peut répondre un 5 pour faire 15'); }
      }
      // Garder les petites cartes pour plus tard (elles « passent » mieux près de 31)
      const value = pts - risk + cardValue(c) * 0.03;
      return { card: c, nc, scores, pts, risk, notes, value };
    }).sort((a, b) => b.value - a.value);
  }

  function choosePlay(hand, pile, count) {
    const ev = evalPlays(hand, pile, count);
    if (!ev.length) return null;
    const near = ev.filter(e => ev[0].value - e.value < 0.05);
    return near[randInt(near.length)];
  }

  function describePlay(e) {
    const parts = [];
    if (e.pts) parts.push('marque ' + e.scores.map(Scoring.pegLabel).join(' + ') + ' = ' + e.pts + ' pt' + (e.pts > 1 ? 's' : ''));
    if (e.nc === 31) parts.push('atteint 31 pile');
    return parts.join(' ; ');
  }

  return { discardOptions, chooseDiscard, evalPlays, choosePlay, describePlay };
})();
