'use strict';
/* ============================================================
   Déroulement de la partie (toi contre l'ordinateur) + tuteur
   ============================================================ */

const $ = s => document.querySelector(s);
const OPP = p => (p === 'you' ? 'cpu' : 'you');
const WHO = { you: 'Toi', cpu: "L'ordi" };
const WIN = 121;
const fmt = x => x.toFixed(1).replace('.', ',');
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

/* ---------------- Options ---------------- */
const DEFAULT_OPTS = {
  countMode: 'guided', quizCpu: true, missed: 'give', discardFeedback: true,
  pegTips: true, showPlayable: true, cpuSpeed: 'normal',
};
function loadOpts() {
  try {
    const o = JSON.parse(localStorage.getItem('cribbage-opts') || '{}');
    return Object.assign({}, DEFAULT_OPTS, o);
  } catch (e) { return Object.assign({}, DEFAULT_OPTS); }
}
function saveOpts() {
  try { localStorage.setItem('cribbage-opts', JSON.stringify(OPTS)); } catch (e) { /* ignoré */ }
}
let OPTS = loadOpts();
const cpuDelay = () => ({ slow: 1500, normal: 950, fast: 450 })[OPTS.cpuSpeed] || 950;

/* ---------------- Attentes annulables ---------------- */
class Cancelled extends Error {}
class GameOver extends Error {}
const pending = new Set();
function waitFor(setup) {
  return new Promise((resolve, reject) => {
    const entry = { reject };
    pending.add(entry);
    setup(v => {
      if (!pending.has(entry)) return;
      pending.delete(entry);
      resolve(v);
    });
  });
}
const sleep = ms => waitFor(done => setTimeout(done, ms));
function cancelAll() {
  for (const e of pending) e.reject(new Cancelled());
  pending.clear();
}

/* ---------------- Fenêtres modales ---------------- */
function makeModal(sel) {
  const el = $(sel);
  const body = el.querySelector('.modal-body');
  const title = el.querySelector('.modal-title');
  const x = el.querySelector('.modal-x');
  let closable = true;
  x.addEventListener('click', () => hide());
  el.addEventListener('mousedown', e => { if (e.target === el && closable) hide(); });
  function open(t, o = {}) {
    closable = o.closable !== false;
    title.innerHTML = t;
    body.innerHTML = '';
    x.style.display = closable ? '' : 'none';
    el.querySelector('.modal-panel').classList.toggle('wide', !!o.wide);
    el.classList.remove('hidden');
    body.scrollTop = 0;
    return body;
  }
  function hide() { el.classList.add('hidden'); }
  return { open, hide, el, isOpen: () => !el.classList.contains('hidden'), get closable() { return closable; } };
}
let GameModal, InfoModal;

/* ---------------- État ---------------- */
let G = null;
function freshGame() {
  return {
    scores: { you: 0, cpu: 0 }, back: { you: 0, cpu: 0 },
    dealer: null, deck: [], hands: { you: [], cpu: [] }, kept: { you: [], cpu: [] },
    crib: [], starter: null, phase: 'idle', peg: null, handNo: 0, winner: null,
    cutCards: null, selected: new Set(), view: { you: [], cpu: [], cpuFaceUp: false },
    onYouCardClick: null, onDeckClick: null, playableCheck: null, turn: null,
    stats: { you: { peg: 0, hand: 0, crib: 0, heels: 0, muggins: 0 }, cpu: { peg: 0, hand: 0, crib: 0, heels: 0, muggins: 0 } },
    handPts: null, discardOpts: null, lastDiscard: null,
  };
}
const emptyPts = () => ({ you: { peg: 0, hand: 0, crib: 0, heels: 0, muggins: 0 }, cpu: { peg: 0, hand: 0, crib: 0, heels: 0, muggins: 0 } });

/* ---------------- Marquer des points ---------------- */
function peg(p, pts, reason, cat) {
  if (pts <= 0) return;
  G.back[p] = G.scores[p];
  G.scores[p] = Math.min(WIN, G.scores[p] + pts);
  const gained = G.scores[p] - G.back[p];
  G.stats[p][cat] = (G.stats[p][cat] || 0) + gained;
  if (G.handPts) G.handPts[p][cat] = (G.handPts[p][cat] || 0) + gained;
  Board.update(G.scores, G.back);
  updateScores(p);
  log(p, `<b class="pts">+${pts}</b> ${reason}`);
  if (G.scores[p] >= WIN) {
    G.winner = p;
    throw new GameOver();
  }
}

/* ---------------- Interface : rendu ---------------- */
function updateScores(flash) {
  $('#scoreYou').textContent = G.scores.you;
  $('#scoreCpu').textContent = G.scores.cpu;
  $('#needYou').textContent = G.scores.you >= WIN ? 'gagné !' : `il te manque ${WIN - G.scores.you}`;
  $('#needCpu').textContent = G.scores.cpu >= WIN ? 'gagné !' : `il lui manque ${WIN - G.scores.cpu}`;
  if (flash) {
    const el = $(flash === 'you' ? '#scoreBoxYou' : '#scoreBoxCpu');
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
}

function render() {
  renderZone('cpu');
  renderZone('you');
  renderMiddle();
  $('#youDealerTag').innerHTML = G.dealer === 'you' ? '<span class="tag">Donneur · crib à toi</span>' : (G.dealer ? '<span class="tag light">Non-donneur · joue et compte en premier</span>' : '');
  $('#cpuDealerTag').innerHTML = G.dealer === 'cpu' ? '<span class="tag">Donneur · crib à lui</span>' : (G.dealer ? '<span class="tag light">Non-donneur</span>' : '');
  $('#youZone').classList.toggle('active', G.turn === 'you');
  $('#cpuZone').classList.toggle('active', G.turn === 'cpu');
}

function renderZone(p) {
  const el = $(p === 'you' ? '#youHand' : '#cpuHand');
  el.innerHTML = '';
  const cards = G.view[p] || [];
  const faceUp = p === 'you' || G.view.cpuFaceUp;
  for (const c of cards) {
    const ce = cardEl(c, { faceDown: !faceUp });
    if (p === 'you') {
      if (G.selected.has(c.id)) ce.classList.add('selected');
      if (G.playableCheck && OPTS.showPlayable) ce.classList.add(G.playableCheck(c) ? 'playable' : 'unplayable');
      if (G.onYouCardClick) {
        ce.classList.add('clickable');
        ce.tabIndex = 0;
        ce.addEventListener('click', () => G.onYouCardClick && G.onYouCardClick(c));
        ce.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && G.onYouCardClick) { e.preventDefault(); G.onYouCardClick(c); } });
      }
    }
    el.appendChild(ce);
  }
  if (!cards.length) el.innerHTML = `<div class="empty-hand">${G.phase === 'peg' ? 'plus de cartes' : ''}</div>`;
}

function renderMiddle() {
  // Paquet
  const d = $('#deck');
  d.innerHTML = '';
  if (G.deck.length) {
    const stack = document.createElement('div');
    stack.className = 'deck-stack' + (G.onDeckClick ? ' clickable pulse' : '');
    stack.appendChild(cardEl(null, { faceDown: true }));
    if (G.onDeckClick) {
      stack.title = 'Clique pour couper';
      stack.addEventListener('click', () => G.onDeckClick && G.onDeckClick());
    }
    d.appendChild(stack);
  }
  const st = $('#starter');
  st.innerHTML = '';
  if (G.starter) {
    const ce = cardEl(G.starter);
    ce.classList.add('starter');
    st.appendChild(ce);
  } else {
    st.innerHTML = '<div class="card-slot">coupe</div>';
  }

  // Zone de jeu
  const pl = $('#pile');
  pl.innerHTML = '';
  const cd = $('#countDisplay');
  cd.textContent = '';
  if (G.cutCards) {
    for (const p of ['you', 'cpu']) {
      const w = document.createElement('div');
      w.className = 'cutcard';
      w.innerHTML = `<div class="cnt-lab">${p === 'you' ? 'Ta coupe' : "Coupe de l'ordi"}</div>`;
      w.appendChild(cardEl(G.cutCards[p]));
      pl.appendChild(w);
    }
  } else if (G.peg) {
    const P = G.peg;
    for (let s = 0; s <= P.seq; s++) {
      const items = P.played.filter(x => x.seq === s);
      if (!items.length) continue;
      const g = document.createElement('div');
      g.className = 'seq' + (s !== P.seq ? ' old' : '');
      for (const it of items) {
        const ce = cardEl(it.card, { size: 'sm' });
        ce.classList.add('by-' + it.p);
        ce.title = (it.p === 'you' ? 'Joué par toi' : "Joué par l'ordi") + ' — ' + cardName(it.card);
        g.appendChild(ce);
      }
      if (s !== P.seq) g.insertAdjacentHTML('beforeend', `<span class="seq-t">${P.seqTotals[s]}</span>`);
      pl.appendChild(g);
    }
    if (!P.played.length) pl.innerHTML = '<div class="muted">Les cartes jouées apparaîtront ici.</div>';
    cd.innerHTML = `<span class="count-n">${P.count}</span><span class="count-of">/ 31</span>`;
  }

  // Crib
  const cr = $('#crib');
  cr.innerHTML = '';
  for (let i = 0; i < G.crib.length; i++) {
    const ce = cardEl(null, { faceDown: true, size: 'sm' });
    ce.style.marginLeft = i ? '-34px' : '0';
    cr.appendChild(ce);
  }
  if (!G.crib.length) cr.innerHTML = '<div class="card-slot sm">vide</div>';
  $('#cribLabel').textContent = G.dealer ? `Crib ${G.dealer === 'you' ? '(à toi)' : "(à l'ordi)"}` : 'Crib';
}

function setPhase(title, html) {
  $('#phaseName').innerHTML = title;
  $('#phaseText').innerHTML = html;
  setAdvice('');
}
function setAdvice(html) {
  const a = $('#advice');
  a.innerHTML = html;
  a.classList.toggle('hidden', !html);
}

function setActions(list) {
  const el = $('#actions');
  el.innerHTML = '';
  for (const a of list) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.innerHTML = a.label;
    b.disabled = !!a.disabled;
    b.addEventListener('click', a.onClick);
    el.appendChild(b);
  }
}
function waitButton(label, extra = []) {
  return waitFor(done => {
    setActions([{ label, cls: 'primary', onClick: () => { setActions([]); done(); } }, ...extra]);
  });
}

function log(who, html) {
  const d = document.createElement('div');
  d.className = 'log-e ' + who;
  const tag = who === 'you' ? '<span class="who">Toi</span>' : who === 'cpu' ? '<span class="who">Ordi</span>' : '';
  d.innerHTML = tag + '<span class="log-t">' + html + '</span>';
  const l = $('#log');
  l.appendChild(d);
  l.scrollTop = l.scrollHeight;
}

let toastTimer = null;
function toast(html) {
  const t = $('#toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

function summarizeCombos(combos) {
  const n = t => combos.filter(c => c.type === t).length;
  const parts = [];
  if (n('fifteen')) parts.push(plural(n('fifteen'), 'quinze').replace('quinzes', 'quinzes'));
  if (n('pair')) parts.push(plural(n('pair'), 'paire'));
  if (n('run')) parts.push(n('run') + ' suite' + (n('run') > 1 ? 's' : '') + ' de ' + combos.find(c => c.type === 'run').points);
  if (n('flush')) parts.push('couleur');
  return parts.join(', ');
}

/* ---------------- Textes du tuteur ---------------- */
const PEG_REF = `<table class="ref">
  <tr><td>Total à 15</td><td>2</td><td>Paire</td><td>2</td></tr>
  <tr><td>Total à 31</td><td>2</td><td>Brelan</td><td>6</td></tr>
  <tr><td>Go</td><td>1</td><td>Carré</td><td>12</td></tr>
  <tr><td>Dernière carte</td><td>1</td><td>Suite</td><td>1/carte</td></tr>
</table>`;

function discardText(isDealer) {
  return `<p>Tu as reçu <b>6 cartes</b>. Garde-en <b>4</b> et mets-en <b>2</b> face cachée dans le <b>crib</b>.
    L'ordi fait la même chose : le crib aura 4 cartes.</p>` +
    (isDealer
      ? `<p class="good-box">Tu es le <b>donneur</b> : le crib est <b>à toi</b>. Ses points seront ajoutés à ton score à la fin de la main.
         Tu peux y mettre de bonnes cartes : des 5, une paire, deux cartes qui font 15 (7-8, 6-9, 5-10) ou qui se suivent.</p>`
      : `<p class="warn-box">L'ordi est le donneur : le crib est <b>à lui</b>. Tout ce que tu y mets peut lui rapporter des points.
         Évite de lui donner des 5, des paires, des cartes qui font 15 ensemble ou qui se suivent. Un roi et une carte éloignée sont de bons écarts.</p>`) +
    `<p>Pense d'abord à ce que tes 4 cartes valent <b>déjà</b> (quinzes, paires, suites) : la coupe ne fera qu'ajouter.</p>
     <p class="do">👉 Clique sur 2 cartes de ta main, puis sur « Mettre au crib ».</p>`;
}

/* ---------------- Coupe pour la donne ---------------- */
async function cutForDeal() {
  G.phase = 'cutdeal';
  setPhase('Bienvenue ! Qui donne en premier ?', `
    <p>Une partie de cribbage se joue jusqu'à <b>121 points</b>. Je vais t'expliquer chaque étape au fur et à mesure,
    ici, dans ce panneau. Le <b>journal</b> en dessous garde la trace de tous les points marqués et pourquoi.</p>
    <p>Pour savoir qui donne la première main, chaque joueur <b>coupe le paquet</b>. La carte la <b>plus basse donne</b>
    (l'As est la plus basse). En cas d'égalité, on recoupe. Ensuite, on alterne à chaque main.</p>
    <p>Être donneur est un avantage : le <b>crib</b> lui appartient. Mais le non-donneur joue en premier et
    compte sa main en premier — ce qui peut faire gagner en fin de partie.</p>
    <p class="do">👉 Clique sur le paquet pour couper.</p>`);
  while (true) {
    G.deck = shuffle(newDeck());
    G.cutCards = null;
    await waitFor(done => { G.onDeckClick = () => { G.onDeckClick = null; done(); }; render(); });
    const a = G.deck[randInt(52)];
    let b;
    do { b = G.deck[randInt(52)]; } while (b === a);
    G.cutCards = { you: a, cpu: b };
    render();
    log('sys', `Coupe pour la donne : toi ${miniCard(a)}, l'ordi ${miniCard(b)}.`);
    if (a.rank === b.rank) {
      setPhase('Égalité !', `<p>Les deux cartes sont du même rang (${RANK_NAME[a.rank]}). On recoupe.</p><p class="do">👉 Clique de nouveau sur le paquet.</p>`);
      await sleep(400);
      continue;
    }
    G.dealer = a.rank < b.rank ? 'you' : 'cpu';
    break;
  }
  const low = G.dealer === 'you' ? G.cutCards.you : G.cutCards.cpu;
  setPhase(G.dealer === 'you' ? 'Tu donnes en premier' : "L'ordi donne en premier",
    `<p>${G.dealer === 'you' ? 'Ta' : "La"} carte la plus basse est ${miniCard(low)} : ${G.dealer === 'you' ? '<b>tu donnes</b> et le premier crib sera à toi' : "<b>l'ordi donne</b> et le premier crib sera à lui"}.</p>
     <p>Le donneur distribue <b>6 cartes</b> à chacun, une à la fois, en commençant par son adversaire.</p>`);
  await waitButton('Distribuer les cartes ▸');
  G.cutCards = null;
  G.deck = [];
}

/* ---------------- Une main complète ---------------- */
async function playHand() {
  G.handNo++;
  G.handPts = emptyPts();
  const dealer = G.dealer, pone = OPP(dealer);
  log('sep', `Main ${G.handNo} — ${dealer === 'you' ? 'tu donnes, le crib est à toi' : "l'ordi donne, le crib est à lui"}`);
  G.deck = shuffle(newDeck());
  G.starter = null; G.crib = []; G.peg = null; G.turn = null; G.playableCheck = null;
  G.view = { you: [], cpu: [], cpuFaceUp: false };
  const h = { you: [], cpu: [] };
  for (let i = 0; i < 6; i++) {
    h[pone].push(G.deck.pop());
    h[dealer].push(G.deck.pop());
  }
  G.hands.you = sortCards(h.you);
  G.hands.cpu = sortCards(h.cpu);
  G.view.you = G.hands.you;
  G.view.cpu = G.hands.cpu;
  G.phase = 'discard';
  render();

  await discardPhase();
  await cutPhase();
  await peggingPhase();
  await countingPhase();
  G.dealer = OPP(G.dealer);
}

/* ---------------- L'écart ---------------- */
async function discardPhase() {
  const isDealer = G.dealer === 'you';
  setPhase('L\'écart : 2 cartes au crib', discardText(isDealer));
  await sleep(30);
  G.discardOpts = AI.discardOptions(G.hands.you, isDealer);
  const cpuChoice = AI.chooseDiscard(G.hands.cpu, G.dealer === 'cpu');
  const chosen = await userDiscard();
  G.hands.you = sortCards(G.hands.you.filter(c => !chosen.some(x => x.id === c.id)));
  G.hands.cpu = cpuChoice.keep.slice();
  G.crib = chosen.concat(cpuChoice.discard);
  G.kept.you = G.hands.you.slice();
  G.kept.cpu = G.hands.cpu.slice();
  G.view.you = G.hands.you;
  G.view.cpu = G.hands.cpu;
  G.selected.clear();
  render();
  log('you', `Tu mets ${miniCards(chosen)} au crib ${isDealer ? '(ton crib)' : "(crib de l'ordi)"}.`);
  log('cpu', "L'ordi met 2 cartes face cachée au crib.");
  G.lastDiscard = { opts: G.discardOpts, isDealer, ids: chosen.map(c => c.id).sort().join() };
  if (OPTS.discardFeedback) discardFeedback();
}

function userDiscard() {
  G.selected = new Set();
  return waitFor(done => {
    const refresh = () => {
      setActions([
        {
          label: `Mettre au crib (${G.selected.size}/2)`, cls: 'primary', disabled: G.selected.size !== 2,
          onClick: () => {
            const ch = G.hands.you.filter(c => G.selected.has(c.id));
            G.onYouCardClick = null;
            setActions([]);
            setAdvice('');
            done(ch);
          },
        },
        { label: '💡 Conseil', onClick: () => showDiscardAdvice(G.discardOpts, G.dealer === 'you', null) },
      ]);
      if (G.selected.size === 2) {
        const keep = G.hands.you.filter(c => !G.selected.has(c.id));
        const disc = G.hands.you.filter(c => G.selected.has(c.id));
        const r = Scoring.scoreHand(keep, null, false);
        const o = G.discardOpts.find(x => x.discard.map(c => c.id).sort().join() === disc.map(c => c.id).sort().join());
        setAdvice(`<div class="adv-t">Aperçu de ton choix</div>
          <p>Tu gardes ${miniCards(keep)} : ces 4 cartes valent <b>déjà ${plural(r.total, 'point')}</b> sans la coupe
          ${r.combos.length ? '(' + summarizeCombos(r.combos) + ')' : ''}.</p>
          <p>Avec la coupe, en moyenne : <b>${fmt(o.handAvg)}</b> pts. Le crib recevra ${miniCards(disc)}.</p>`);
      } else setAdvice('');
      render();
    };
    G.onYouCardClick = c => {
      if (G.selected.has(c.id)) G.selected.delete(c.id);
      else {
        if (G.selected.size >= 2) { toast('Tu as déjà choisi 2 cartes. Clique sur une carte choisie pour la retirer.'); return; }
        G.selected.add(c.id);
      }
      refresh();
    };
    refresh();
  });
}

function discardFeedback() {
  const { opts, isDealer, ids } = G.lastDiscard;
  const mine = opts.find(o => o.discard.map(c => c.id).sort().join() === ids);
  const best = opts[0];
  const rank = opts.indexOf(mine) + 1;
  const link = ' <a href="#" data-act="discard-analysis">Voir l\'analyse</a>';
  if (best.net - mine.net < 0.2) {
    log('tip', `🎯 Excellent écart ! ${rank === 1 ? 'C\'est le meilleur choix' : 'C\'est pratiquement le meilleur choix'} selon les probabilités (valeur attendue ${fmt(mine.net)} pts).${link}`);
  } else {
    log('tip', `Ton écart vaut en moyenne <b>${fmt(mine.net)}</b> pts (main ≈ ${fmt(mine.handAvg)} ${isDealer ? '+' : '−'} crib ≈ ${fmt(mine.cribAvg)}).
      Le meilleur était de garder ${miniCards(best.keep)} et de mettre ${miniCards(best.discard)} au crib : <b>${fmt(best.net)}</b> pts.
      Le tien était le ${rank}<sup>e</sup> choix sur 15.${link}`);
  }
}

function showDiscardAdvice(opts, isDealer, mineIds) {
  const b = InfoModal.open('Analyse de l\'écart', { wide: true });
  let rows = '';
  opts.forEach((o, i) => {
    const isMine = mineIds && o.discard.map(c => c.id).sort().join() === mineIds;
    rows += `<tr class="${i === 0 ? 'best' : ''} ${isMine ? 'mine' : ''}">
      <td>${i + 1}${isMine ? ' <span class="tag">ton choix</span>' : ''}</td>
      <td>${miniCards(o.keep)}</td><td>${miniCards(o.discard)}</td>
      <td>${o.base}</td><td>${fmt(o.handAvg)}</td>
      <td class="${isDealer ? 'plus' : 'minus'}">${isDealer ? '+' : '−'}${fmt(o.cribAvg)}</td>
      <td><b>${fmt(o.net)}</b></td></tr>`;
  });
  b.innerHTML = `
    <p>Il y a <b>15 façons</b> de choisir 2 cartes parmi 6. Pour chacune, on calcule :</p>
    <ul>
      <li><b>Sans coupe</b> : ce que tes 4 cartes valent déjà, à coup sûr.</li>
      <li><b>Moyenne main</b> : la moyenne exacte de ta main sur les <b>46 coupes possibles</b> (toutes les cartes que tu ne vois pas).</li>
      <li><b>Crib</b> : une estimation de ce que vaudra le crib avec tes 2 cartes (moyenne sur des centaines de cribs simulés).
        ${isDealer ? 'C\'est <b>ton</b> crib : sa valeur s\'<b>ajoute</b>.' : 'C\'est le crib de l\'<b>adversaire</b> : sa valeur se <b>soustrait</b>.'}</li>
      <li><b>Valeur nette</b> = moyenne main ${isDealer ? '+' : '−'} crib. Le meilleur écart est celui qui a la plus haute valeur nette.</li>
    </ul>
    <div class="table-scroll"><table class="adv-table">
      <tr><th>#</th><th>Tu gardes</th><th>Au crib</th><th>Sans coupe</th><th>Moyenne main</th><th>Crib</th><th>Valeur nette</th></tr>
      ${rows}
    </table></div>
    <p class="muted">Ces chiffres sont des moyennes : la coupe peut toujours te surprendre ! Les écarts au crib adverse
    les plus sûrs sont généralement des cartes éloignées (ex. roi + 2) ; les plus dangereux sont les 5 et les paires.</p>`;
}

/* ---------------- La coupe ---------------- */
async function cutPhase() {
  G.phase = 'cut';
  const pone = OPP(G.dealer);
  setPhase('La coupe', `
    <p>Le <b>non-donneur</b> coupe le paquet, puis le <b>donneur</b> retourne la carte du dessus de la partie du bas et la pose face visible : c'est la <b>coupe</b>.</p>
    <p>La coupe ne se joue pas, mais elle compte comme <b>5e carte dans chaque main ET dans le crib</b>.</p>
    <p>Si la coupe est un <b>valet</b>, le donneur marque <b>2 points</b> tout de suite (« his heels »).</p>
    <p class="do">👉 ${pone === 'you' ? 'Tu es le non-donneur : clique sur le paquet pour le couper.' : "L'ordi a coupé : clique sur le paquet pour retourner la coupe."}</p>`);
  await waitFor(done => { G.onDeckClick = () => { G.onDeckClick = null; done(); }; render(); });
  G.starter = G.deck.splice(4 + randInt(G.deck.length - 8), 1)[0];
  render();
  log('sys', `Coupe : ${miniCard(G.starter)} (${cardName(G.starter)}) — elle fait partie de chaque main et du crib.`);
  if (G.starter.rank === 11) {
    setAdvice(`<div class="adv-t">His heels !</div><p>La coupe est un valet : le donneur (${G.dealer === 'you' ? 'toi' : "l'ordi"}) marque 2 points immédiatement.</p>`);
    peg(G.dealer, 2, 'His heels : la coupe est un valet, 2 points au donneur.', 'heels');
  }
  await sleep(600);
}

/* ---------------- Le jeu (pegging) ---------------- */
function canPlay(p) {
  const P = G.peg;
  return P.hands[p].some(c => P.count + cardValue(c) <= 31);
}

function pegPhaseText(extra = '') {
  const P = G.peg;
  const turn = P.turnInfo || '';
  return `<p class="countline">Total en cours : <b>${P.count}</b> / 31</p>${turn}${extra}
    <details class="mini-rules"><summary>Rappel des points au jeu</summary>${PEG_REF}
    <p>Si tu ne peux pas jouer sans dépasser 31 : dis « Go ». L'autre continue seul tant qu'il peut,
    puis marque 1 point (2 s'il atteint 31). Le total repart ensuite à 0.</p></details>`;
}

function resetSeq() {
  const P = G.peg;
  P.seqTotals[P.seq] = P.count;
  P.seq++;
  P.count = 0;
  P.pile = [];
  P.go = { you: false, cpu: false };
}

async function peggingPhase() {
  G.phase = 'peg';
  const P = G.peg = {
    hands: { you: G.kept.you.slice(), cpu: G.kept.cpu.slice() },
    count: 0, pile: [], played: [], seq: 0, seqTotals: {},
    go: { you: false, cpu: false }, last: null, turn: OPP(G.dealer),
  };
  G.view.you = P.hands.you;
  G.view.cpu = P.hands.cpu;
  setPhase('Le jeu (« pegging »)', `
    <p>Le <b>non-donneur</b> (${P.turn === 'you' ? 'toi' : "l'ordi"}) commence. À tour de rôle, chacun pose une carte et on additionne :
    le total ne peut jamais dépasser <b>31</b>.</p>
    <p>On marque des points en posant une carte qui fait <b>15</b> ou <b>31</b>, une <b>paire</b> avec la carte précédente,
    ou une <b>suite</b> avec les dernières cartes posées.</p>${PEG_REF}`);
  render();
  await sleep(500);

  while (true) {
    if (!P.hands.you.length && !P.hands.cpu.length) {
      if (P.pile.length && P.count !== 31) {
        peg(P.last, 1, `Dernière carte jouée (total ${P.count}) : 1 point.`, 'peg');
      }
      break;
    }
    const p = P.turn, o = OPP(p);
    G.turn = p;
    if (canPlay(p)) {
      if (p === 'you') {
        const card = await userPegTurn();
        await playCard('you', card);
      } else {
        P.turnInfo = '<p class="turn cpu">L\'ordi réfléchit…</p>';
        setPhase('Le jeu — tour de l\'ordi', pegPhaseText());
        render();
        await sleep(cpuDelay());
        const e = AI.choosePlay(P.hands.cpu, P.pile, P.count);
        await playCard('cpu', e.card, e);
      }
      continue;
    }
    // p ne peut pas jouer
    // (Si l'adversaire a déjà dit « Go », on ne répète pas : on marque directement le point.)
    if (P.hands[p].length && !P.go[p] && !P.go[o]) {
      if (p === 'you') await userSayGo();
      else {
        log('cpu', `« Go ! » — l'ordi ne peut pas jouer sans dépasser 31 (total ${P.count}).`);
        P.turnInfo = '<p class="turn cpu">L\'ordi dit <b>« Go »</b> : il ne peut pas jouer sans dépasser 31.</p>';
        setPhase('Le jeu — l\'ordi dit « Go »', pegPhaseText());
        await sleep(cpuDelay());
      }
      P.go[p] = true;
    }
    if (canPlay(o)) {
      P.turn = o;
      continue;
    }
    // Personne ne peut jouer : point de go pour le dernier joueur
    const lp = P.last;
    peg(lp, 1, `Go : personne ne peut plus jouer sous 31 et ${lp === 'you' ? 'tu as' : "l'ordi a"} posé la dernière carte (total ${P.count}) : 1 point.`, 'peg');
    resetSeq();
    P.turn = OPP(lp);
    log('sys', `Le total repart à 0. ${P.turn === 'you' ? 'Tu reprends' : "L'ordi reprend"} (celui qui n'a pas joué la dernière carte).`);
    render();
    await sleep(500);
  }
  G.turn = null;
  G.playableCheck = null;
  render();
  setPhase('Fin du jeu', '<p>Toutes les cartes ont été jouées. On passe au <b>compte des mains</b>.</p>');
  await sleep(700);
}

function userPegTurn() {
  const P = G.peg;
  const goCount = P.go.cpu ? '<p class="note">L\'ordi a dit « Go » : tu continues à jouer seul tant que tu peux.</p>' : '';
  P.turnInfo = `<p class="turn you">À toi de jouer.</p>${goCount}`;
  setPhase('Le jeu — à toi', pegPhaseText('<p class="do">👉 Clique sur une carte pour la poser.</p>'));
  G.playableCheck = c => P.count + cardValue(c) <= 31;
  return waitFor(done => {
    G.onYouCardClick = c => {
      if (P.count + cardValue(c) > 31) {
        toast(`Impossible : ${P.count} + ${cardValue(c)} = ${P.count + cardValue(c)}, ça dépasserait 31.`);
        return;
      }
      G.onYouCardClick = null;
      setActions([]);
      done(c);
    };
    setActions([
      {
        label: 'Dire « Go »', onClick: () => {
          const legal = P.hands.you.filter(c => P.count + cardValue(c) <= 31);
          toast(`Pas encore ! On doit jouer si on peut. Tu peux poser ${miniCards(legal)} sans dépasser 31.`);
        },
      },
      { label: '💡 Conseil', onClick: () => showPegAdvice() },
    ]);
    render();
  });
}

function userSayGo() {
  const P = G.peg;
  P.turnInfo = `<p class="turn you">Aucune de tes cartes ne passe : ${P.hands.you.map(c => `${P.count} + ${cardValue(c)} = ${P.count + cardValue(c)}`).join(', ')} — tout dépasse 31.</p>`;
  setPhase('Le jeu — tu dois dire « Go »', pegPhaseText(`<p class="do">👉 Annonce « Go ». ${P.go.cpu ? '' : "L'ordi va continuer seul s'il le peut, et marquera le point de go."}</p>`));
  G.playableCheck = c => P.count + cardValue(c) <= 31;
  return waitFor(done => {
    G.onYouCardClick = c => toast(`Tu ne peux pas : ${P.count} + ${cardValue(c)} = ${P.count + cardValue(c)} dépasse 31. Dis « Go ».`);
    setActions([{
      label: 'Dire « Go »', cls: 'primary', onClick: () => {
        G.onYouCardClick = null;
        setActions([]);
        log('you', `« Go ! » — tu ne peux pas jouer sans dépasser 31 (total ${P.count}).`);
        done();
      },
    }]);
    render();
  });
}

function showPegAdvice() {
  const P = G.peg;
  const ev = AI.evalPlays(P.hands.you, P.pile, P.count);
  if (!ev.length) return;
  const best = ev[0];
  const line = e => {
    const what = AI.describePlay(e);
    const notes = e.notes.length ? e.notes.join(' ; ') : 'pas de risque particulier';
    return `<li>${miniCard(e.card)} → total ${e.nc}${what ? ' : <b>' + what + '</b>' : ''}. <span class="muted">${notes}.</span></li>`;
  };
  setAdvice(`<div class="adv-t">💡 Conseil</div>
    <p>Je jouerais ${miniCard(best.card)}${best.pts ? ` : il ${AI.describePlay(best)}` : ''}.</p>
    <ul class="adv-list">${ev.map(line).join('')}</ul>
    <p class="muted">Le conseil combine les points immédiats et le risque de laisser des points à l'adversaire.</p>`);
}

async function playCard(p, card, cpuEval) {
  const P = G.peg;
  const before = p === 'you' && OPTS.pegTips ? AI.evalPlays(P.hands.you, P.pile, P.count) : null;
  const idx = P.hands[p].findIndex(c => c.id === card.id);
  P.hands[p].splice(idx, 1);
  P.count += cardValue(card);
  P.pile.push(card);
  P.played.push({ card, p, seq: P.seq });
  P.last = p;
  G.playableCheck = null;
  setAdvice('');
  render();
  let extra = '';
  if (p === 'cpu' && cpuEval && !cpuEval.pts && P.pile.length === 1 && card.rank < 5) extra = ' <span class="muted">(entame sous 5 : tu ne peux pas faire 15 avec une seule carte)</span>';
  log(p, `${p === 'you' ? 'Tu joues' : "L'ordi joue"} ${miniCard(card)} — total <b>${P.count}</b>.${extra}`);
  const sc = Scoring.scorePegging(P.pile, P.count);
  for (const s of sc) {
    peg(p, s.points, `${Scoring.pegLabel(s)[0].toUpperCase() + Scoring.pegLabel(s).slice(1)} — ${Scoring.pegExplain(s, P.count)}`, 'peg');
  }
  if (sc.length) {
    const total = sc.reduce((a, s) => a + s.points, 0);
    toast(`${p === 'you' ? 'Tu marques' : "L'ordi marque"} <b>${total}</b> : ${sc.map(Scoring.pegLabel).join(' + ')}`);
  }

  // Conseils après ton coup
  if (before) {
    const mine = before.find(e => e.card.id === card.id);
    const bestPts = before.reduce((m, e) => Math.max(m, e.pts), 0);
    if (bestPts > mine.pts) {
      const b = before.find(e => e.pts === bestPts);
      log('tip', `Occasion manquée : ${miniCard(b.card)} aurait ${AI.describePlay(b)}.`);
    } else if (P.count === 5 || P.count === 21) {
      const safer = before.find(e => e.pts === mine.pts && e.nc !== 5 && e.nc !== 21);
      if (safer) log('tip', `Attention : en laissant le total à ${P.count}, une carte de 10 (10, J, Q, K) donne ${P.count === 5 ? 15 : 31} à l'adversaire. ${miniCard(safer.card)} était plus prudent.`);
    } else if (sc.some(s => s.type === 'pair') && P.hands[OPP(p)].length) {
      log('tip', 'Bien joué pour la paire ! Mais attention : l\'adversaire peut répondre avec une 3e carte pareille (brelan = 6 pts).');
    }
  }

  if (P.count === 31) {
    resetSeq();
    P.turn = OPP(p);
    log('sys', `31 ! Le total repart à 0. ${P.turn === 'you' ? 'Tu recommences' : "L'ordi recommence"}.`);
  } else {
    P.turn = P.go[OPP(p)] ? p : OPP(p);
  }
  render();
  await sleep(sc.length ? 650 : 250);
}

/* ---------------- Le compte ---------------- */
function missedNote() {
  if (OPTS.missed === 'give') return 'En mode apprentissage, ces points te sont quand même accordés (voir Options).';
  if (OPTS.missed === 'lose') return 'Règle standard : les points oubliés sont perdus.';
  return 'Muggins ! L\'ordi va prendre les points que tu as oubliés.';
}

async function countingPhase() {
  G.phase = 'count';
  G.peg = null;
  G.turn = null;
  G.view.you = G.kept.you;
  G.view.cpu = G.kept.cpu;
  G.view.cpuFaceUp = true;
  render();
  const pone = OPP(G.dealer);
  setPhase('Le compte des mains (« le show »)', `
    <p>Chacun reprend ses 4 cartes. On compte <b>toujours dans cet ordre</b> :</p>
    <ol><li>la main du <b>non-donneur</b> (${pone === 'you' ? 'toi' : "l'ordi"})</li>
    <li>la main du <b>donneur</b> (${G.dealer === 'you' ? 'toi' : "l'ordi"})</li>
    <li>le <b>crib</b>, qui appartient au donneur</li></ol>
    <p>Chaque main se compte avec ses 4 cartes <b>plus la coupe</b> ${miniCard(G.starter)}.</p>
    <p>L'ordre compte : en fin de partie, le non-donneur peut atteindre 121 avant que le donneur ne compte !</p>`);
  await waitButton('Commencer le compte ▸');
  await countOne(pone, G.kept[pone], false, 1);
  await countOne(G.dealer, G.kept[G.dealer], false, 2);
  await countOne(G.dealer, G.crib, true, 3);

  const hp = G.handPts;
  const line = p => {
    const t = hp[p].peg + hp[p].hand + hp[p].crib + hp[p].heels + hp[p].muggins;
    const parts = [`jeu ${hp[p].peg}`, `main ${hp[p].hand}`];
    if (G.dealer === p) parts.push(`crib ${hp[p].crib}`);
    if (hp[p].heels) parts.push(`his heels ${hp[p].heels}`);
    if (hp[p].muggins) parts.push(`muggins ${hp[p].muggins}`);
    return `<tr><td>${WHO[p]}</td><td><b>+${t}</b></td><td class="muted">${parts.join(' · ')}</td></tr>`;
  };
  setPhase(`Fin de la main ${G.handNo}`, `
    <table class="sum">${line('you')}${line('cpu')}</table>
    <p>Score : toi <b>${G.scores.you}</b>, l'ordi <b>${G.scores.cpu}</b>.</p>
    <p>À la prochaine main, ${G.dealer === 'you' ? "c'est l'ordi qui donne (le crib sera à lui)" : "c'est toi qui donnes (le crib sera à toi)"}.</p>`);
  await waitButton('Main suivante ▸');
}

async function countOne(owner, cards, isCrib, order) {
  const what = isCrib ? (owner === 'you' ? 'Ton crib' : "Le crib de l'ordi") : (owner === 'you' ? 'Ta main' : "La main de l'ordi");
  const why = order === 1 ? 'le non-donneur compte en premier' : order === 2 ? 'puis le donneur compte sa main' : 'enfin, le donneur compte le crib';
  const title = `${order}/3 · ${what} <span class="muted">— ${why}</span>`;
  const cat = isCrib ? 'crib' : 'hand';
  const body = GameModal.open(`Compte ${order}/3 <span class="modal-score">Toi ${G.scores.you} · Ordi ${G.scores.cpu}</span>`, { closable: false, wide: true });
  if (owner === 'you') {
    const r = await waitFor(done => Counter.userCount(body, {
      hand: cards, starter: G.starter, isCrib, title, missedNote: missedNote(), finishLabel: 'Marquer mes points ▸',
    }, OPTS.countMode).then(done));
    GameModal.hide();
    const label = isCrib ? 'ton crib' : 'ta main';
    if (r.total === 0) log('you', `${label[0].toUpperCase() + label.slice(1)} ne vaut rien : 0 point.`);
    if (OPTS.missed === 'give') {
      peg('you', r.total, `pour ${label}${r.missed ? ` (dont ${r.missed} oublié${r.missed > 1 ? 's' : ''}, accordé${r.missed > 1 ? 's' : ''} en mode apprentissage)` : ''}.`, cat);
    } else {
      peg('you', r.found, `pour ${label}${r.missed ? ` (${r.missed} point${r.missed > 1 ? 's' : ''} oublié${r.missed > 1 ? 's' : ''})` : ''}.`, cat);
      if (OPTS.missed === 'muggins' && r.missed) peg('cpu', r.missed, `Muggins ! L'ordi prend les ${r.missed} points que tu as oubliés.`, 'muggins');
    }
  } else {
    const res = await waitFor(done => Counter.showCpu(body, {
      hand: cards, starter: G.starter, isCrib, title, quiz: OPTS.quizCpu, who: "L'ordi", finishLabel: 'Continuer ▸',
    }).then(done));
    GameModal.hide();
    if (res.total === 0) log('cpu', `${isCrib ? 'Son crib' : 'Sa main'} ne vaut rien : 0 point.`);
    peg('cpu', res.total, `pour ${isCrib ? 'son crib' : 'sa main'} : ${Scoring.announce(res.combos)}`, cat);
  }
  await sleep(300);
}

/* ---------------- Fin de partie ---------------- */
function showGameOver() {
  G.phase = 'over';
  G.turn = null;
  G.onYouCardClick = null;
  G.onDeckClick = null;
  setActions([{ label: 'Nouvelle partie', cls: 'primary', onClick: () => newGame(false) }]);
  const w = G.winner, l = OPP(w), ls = G.scores[l];
  const skunk = ls <= 60 ? 'double' : ls <= 90 ? 'simple' : null;
  const skText = skunk === 'double'
    ? `<p class="warn-box"><b>Double skunk !</b> ${l === 'you' ? 'Tu n\'as' : "L'ordi n'a"} même pas dépassé 60 points : la victoire compte triple (selon les règles maison).</p>`
    : skunk === 'simple'
      ? `<p class="warn-box"><b>Skunk !</b> ${l === 'you' ? 'Tu n\'as' : "L'ordi n'a"} pas dépassé la ligne de 90 points : la victoire compte double.</p>`
      : '';
  const st = p => G.stats[p];
  const b = GameModal.open(w === 'you' ? '🏆 Tu as gagné !' : "L'ordi a gagné", { closable: true });
  b.innerHTML = `
    <p class="final">Toi <b>${G.scores.you}</b> — Ordi <b>${G.scores.cpu}</b> après ${plural(G.handNo, 'main')}.</p>
    ${skText}
    <p>${w === 'you' ? 'Bravo !' : 'Pas de chance !'} La partie s'arrête dès qu'un joueur atteint 121, même au milieu d'une main.</p>
    <table class="sum stats"><tr><th></th><th>Toi</th><th>Ordi</th></tr>
      <tr><td>Au jeu (pegging)</td><td>${st('you').peg}</td><td>${st('cpu').peg}</td></tr>
      <tr><td>Mains</td><td>${st('you').hand}</td><td>${st('cpu').hand}</td></tr>
      <tr><td>Crib</td><td>${st('you').crib}</td><td>${st('cpu').crib}</td></tr>
      <tr><td>His heels</td><td>${st('you').heels}</td><td>${st('cpu').heels}</td></tr>
      <tr><td>Muggins</td><td>${st('you').muggins}</td><td>${st('cpu').muggins}</td></tr>
    </table>`;
  const act = document.createElement('div');
  act.className = 'cnt-actions';
  act.append(Counter.btn('Nouvelle partie', () => newGame(false), 'primary'));
  b.appendChild(act);
  setPhase(w === 'you' ? '🏆 Victoire !' : 'Défaite', `<p>${w === 'you' ? 'Tu as' : "L'ordi a"} atteint 121 points.</p><p>Clique sur « Nouvelle partie » pour rejouer.</p>`);
  log('sep', `${w === 'you' ? 'Tu gagnes' : "L'ordi gagne"} ${G.scores.you} à ${G.scores.cpu}${skunk ? ' (skunk' + (skunk === 'double' ? ' double' : '') + ')' : ''}.`);
}

/* ---------------- Nouvelle partie ---------------- */
async function newGame(ask) {
  if (ask && G && G.handNo > 0 && G.phase !== 'over' && !confirm('Abandonner la partie en cours et en commencer une nouvelle ?')) return;
  cancelAll();
  GameModal.hide();
  G = freshGame();
  $('#log').innerHTML = '';
  setActions([]);
  Board.update(G.scores, G.back);
  updateScores();
  render();
  const myG = G;
  try {
    await cutForDeal();
    while (true) await playHand();
  } catch (e) {
    if (e instanceof GameOver && G === myG) { render(); showGameOver(); }
    else if (!(e instanceof Cancelled) && !(e instanceof GameOver)) { console.error(e); }
  }
}

/* ---------------- Règles, options, pratique ---------------- */
function showRules(sectionId) {
  const b = InfoModal.open('📖 Les règles du cribbage', { wide: true });
  b.innerHTML = `<div class="rules"><nav class="rules-nav">${RULES.map(r => `<button data-r="${r.id}">${r.title}</button>`).join('')}</nav><div class="rules-content"></div></div>`;
  const content = b.querySelector('.rules-content');
  const show = id => {
    const r = RULES.find(x => x.id === id) || RULES[0];
    content.innerHTML = `<h3>${r.title}</h3>${r.html}`;
    b.querySelectorAll('.rules-nav button').forEach(x => x.classList.toggle('cur', x.dataset.r === r.id));
    content.scrollTop = 0;
  };
  b.querySelectorAll('.rules-nav button').forEach(x => x.addEventListener('click', () => show(x.dataset.r)));
  show(sectionId || 'but');
}

function showOptions() {
  const b = InfoModal.open('⚙️ Options');
  const sel = (k, label, options, help) => `<div class="opt"><label for="opt-${k}">${label}</label>
    <select id="opt-${k}" data-k="${k}">${options.map(([v, t]) => `<option value="${v}" ${String(OPTS[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${help ? `<div class="opt-help">${help}</div>` : ''}</div>`;
  const yn = [['true', 'Oui'], ['false', 'Non']];
  b.innerHTML =
    sel('countMode', 'Compte de tes mains et de ton crib', [
      ['guided', 'Guidé : je trouve chaque combinaison moi-même (recommandé)'],
      ['total', 'J\'annonce le total, puis je vois le détail'],
      ['auto', 'Automatique : montre-moi le détail'],
    ], 'Le mode guidé t\'apprend à compter étape par étape : quinzes, paires, suites, couleur, nobs.') +
    sel('quizCpu', 'Compte des mains de l\'ordi', [['true', 'Je devine d\'abord le total (exercice)'], ['false', 'Montrer directement le détail']]) +
    sel('missed', 'Points que tu oublies en comptant', [
      ['give', 'Accordés quand même (apprentissage)'],
      ['lose', 'Perdus (règle standard)'],
      ['muggins', 'Muggins : l\'ordi les prend'],
    ]) +
    sel('discardFeedback', 'Analyse de ton écart après chaque main', yn) +
    sel('pegTips', 'Conseils après tes coups au jeu', yn) +
    sel('showPlayable', 'Griser les cartes qui dépasseraient 31', yn) +
    sel('cpuSpeed', 'Vitesse de l\'ordi', [['slow', 'Lente'], ['normal', 'Normale'], ['fast', 'Rapide']]) +
    '<p class="muted">Les changements s\'appliquent immédiatement (au prochain compte pour les modes de compte).</p>';
  b.querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
    const v = s.value;
    OPTS[s.dataset.k] = v === 'true' ? true : v === 'false' ? false : v;
    saveOpts();
    render();
  }));
}

const EXAMPLES = [
  { name: 'La main parfaite (29)', hand: ['5C', '5D', '5H', 'JS'], starter: '5S' },
  { name: 'Les quatre 5 (28)', hand: ['5C', '5D', '5H', '5S'], starter: 'KH' },
  { name: 'Double-double suite (24)', hand: ['4C', '4D', '5H', '5S'], starter: '6H' },
  { name: 'Double suite de 3', hand: ['4C', '5D', '5H', '6S'], starter: 'KC' },
  { name: 'Triple suite', hand: ['7C', '7D', '7H', '8S'], starter: '9C' },
  { name: 'Quinzes à 4 cartes', hand: ['AS', '2H', '2D', 'KC'], starter: '10H' },
  { name: 'Suite de 5 et couleur', hand: ['3H', '4H', '5H', '6H'], starter: '7H' },
  { name: 'Couleur dans le crib ?', hand: ['2H', '6H', '9H', 'KH'], starter: 'QS', crib: true },
  { name: 'Le nobs', hand: ['JD', '7C', '8S', '2D'], starter: 'QD' },
  { name: 'Piège : 10 et roi', hand: ['10S', 'KH', '5D', 'QC'], starter: '5C' },
  { name: 'Main nulle (« dix-neuf »)', hand: ['2S', '4H', '6D', '8C'], starter: 'QH' },
];

const practiceStats = { hands: 0, perfect: 0, streak: 0 };
function showPractice() {
  const b = InfoModal.open('🎓 Pratique du compte', { wide: true });
  b.innerHTML = `
    <p>Entraîne-toi à compter des mains sans jouer une partie. Chaque main = 4 cartes + la coupe.</p>
    <div class="prac-bar">
      <button class="btn" data-p="hand">Main au hasard</button>
      <button class="btn" data-p="crib">Crib au hasard</button>
      <select class="prac-ex"><option value="">Exemples instructifs…</option>${EXAMPLES.map((e, i) => `<option value="${i}">${e.name}</option>`).join('')}</select>
      <select class="prac-mode"><option value="guided">Mode guidé</option><option value="total">Total seulement</option></select>
    </div>
    <div class="prac-stats"></div>
    <div class="prac-body"></div>`;
  const pb = b.querySelector('.prac-body');
  const modeSel = b.querySelector('.prac-mode');
  let last = 'hand';
  const stats = () => {
    b.querySelector('.prac-stats').innerHTML = practiceStats.hands
      ? `Mains comptées : <b>${practiceStats.hands}</b> · sans erreur : <b>${practiceStats.perfect}</b> · série en cours : <b>${practiceStats.streak}</b>`
      : '';
  };
  const run = (hand, starter, isCrib, label) => {
    pb.innerHTML = '';
    pb._chipHover = false;
    const fresh = document.createElement('div');
    pb.appendChild(fresh);
    Counter.userCount(fresh, {
      hand, starter, isCrib, title: label || (isCrib ? 'Compte ce crib' : 'Compte cette main'),
      missedNote: 'Regarde bien les combinaisons en rouge.', finishLabel: 'Main suivante ▸',
    }, modeSel.value).then(r => {
      practiceStats.hands++;
      if (r.missed === 0 && r.found === r.total) { practiceStats.perfect++; practiceStats.streak++; } else practiceStats.streak = 0;
      stats();
      random(last);
    });
  };
  const random = kind => {
    last = kind;
    const d = shuffle(newDeck());
    run(sortCards(d.slice(0, 4)), d[4], kind === 'crib');
  };
  b.querySelectorAll('[data-p]').forEach(x => x.addEventListener('click', () => random(x.dataset.p)));
  b.querySelector('.prac-ex').addEventListener('change', e => {
    const ex = EXAMPLES[e.target.value];
    if (!ex) return;
    run(sortCards(ex.hand.map(parseCard)), parseCard(ex.starter), !!ex.crib, 'Exemple : ' + ex.name);
    e.target.value = '';
  });
  modeSel.addEventListener('change', () => random(last));
  stats();
  random('hand');
}

/* ---------------- Démarrage ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  GameModal = makeModal('#gameModal');
  InfoModal = makeModal('#infoModal');
  Board.init($('#board'));
  $('#btnNew').addEventListener('click', () => newGame(true));
  $('#btnRules').addEventListener('click', () => showRules());
  $('#btnPractice').addEventListener('click', showPractice);
  $('#btnOptions').addEventListener('click', showOptions);
  $('#gameModalRules').addEventListener('click', () => showRules('compte'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && InfoModal.isOpen()) InfoModal.hide();
  });
  $('#log').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.act === 'discard-analysis' && G.lastDiscard) {
      showDiscardAdvice(G.lastDiscard.opts, G.lastDiscard.isDealer, G.lastDiscard.ids);
    }
  });
  newGame(false);
});
