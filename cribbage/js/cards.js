'use strict';
/* ============================================================
   Cartes : modèle, paquet, affichage
   ============================================================ */

const SUITS = {
  S: { sym: '♠', name: 'pique',   red: false },
  H: { sym: '♥', name: 'cœur',    red: true  },
  D: { sym: '♦', name: 'carreau', red: true  },
  C: { sym: '♣', name: 'trèfle',  red: false },
};
const SUIT_IDS = ['S', 'H', 'D', 'C'];
const RANK_LABEL = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAME  = [null, 'As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi'];

function makeCard(rank, suit) {
  return { rank, suit, id: RANK_LABEL[rank] + suit };
}

function newDeck() {
  const d = [];
  for (const s of SUIT_IDS) for (let r = 1; r <= 13; r++) d.push(makeCard(r, s));
  return d;
}

function randInt(n) {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  } catch (e) {
    return Math.floor(Math.random() * n);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Valeur pour compter (15 et 31) : As = 1, figures = 10. */
function cardValue(c) { return Math.min(10, c.rank); }

function cardText(c) { return RANK_LABEL[c.rank] + SUITS[c.suit].sym; }

function cardName(c) {
  return RANK_NAME[c.rank] + ' de ' + SUITS[c.suit].name;
}

function sortCards(cs) {
  return cs.slice().sort((a, b) => a.rank - b.rank || SUIT_IDS.indexOf(a.suit) - SUIT_IDS.indexOf(b.suit));
}

/** "5H", "10S", "JD", "AC" -> carte */
function parseCard(str) {
  const suit = str.slice(-1);
  const r = str.slice(0, -1);
  const rank = RANK_LABEL.indexOf(r);
  return makeCard(rank, suit);
}

/** Élément DOM d'une carte. */
function cardEl(c, opts = {}) {
  const el = document.createElement('div');
  const size = opts.size || '';
  if (opts.faceDown || !c) {
    el.className = 'card back ' + size;
    return el;
  }
  const s = SUITS[c.suit];
  el.className = 'card ' + (s.red ? 'red ' : 'black ') + size;
  el.dataset.id = c.id;
  const r = RANK_LABEL[c.rank];
  const center = c.rank > 10
    ? `<span class="face">${r}</span><span class="face-suit">${s.sym}</span>`
    : `<span class="pip">${s.sym}</span>`;
  el.innerHTML =
    `<div class="corner tl"><span>${r}</span><span>${s.sym}</span></div>` +
    `<div class="center">${center}</div>` +
    `<div class="corner br"><span>${r}</span><span>${s.sym}</span></div>`;
  el.title = cardName(c) + ' — vaut ' + cardValue(c) + ' pour compter';
  return el;
}

/** Petite carte en ligne (texte). */
function miniCard(c, starterId) {
  if (!c) return '';
  const red = SUITS[c.suit].red ? ' red' : '';
  const st = c.id === starterId ? ' is-starter' : '';
  const t = c.id === starterId ? ' title="carte de la coupe"' : '';
  return `<span class="mc${red}${st}"${t}>${cardText(c)}</span>`;
}

function miniCards(cs, starterId, sep = ' ') {
  return cs.map(c => miniCard(c, starterId)).join(sep);
}
