'use strict';
/* ============================================================
   Compteur de mains : apprendre à compter, combinaison par combinaison
   - guided  : le joueur trouve lui-même chaque combinaison, étape par étape
   - total   : le joueur annonce un total, puis voit le détail
   - auto    : le détail est montré directement
   - showCpu : l'ordi compte (avec quiz optionnel), combinaison par combinaison
   ============================================================ */

const Counter = (() => {
  const TYPES = ['fifteen', 'pair', 'run', 'flush', 'nobs'];
  const key = (type, cards) => type + ':' + cards.map(c => c.id).sort().join(',');

  const STEP = {
    fifteen: {
      name: 'Quinzes',
      title: 'Étape 1 — Les quinzes (2 points chacun)',
      html: `<p>Trouve <b>toutes</b> les combinaisons de cartes dont la somme fait exactement <b>15</b>.
        Valeurs : As = 1, 2 à 10 = leur chiffre, <b>J, Q, K = 10</b>.</p>
        <p>Une même carte peut servir dans plusieurs quinzes. Méthode qui ne rate rien :
        cherche d'abord les combinaisons de <b>2 cartes</b> (10+5, 9+6, 8+7), puis de <b>3 cartes</b>
        (ex. 5+5+5, 4+4+7, 2+3+10), puis de <b>4</b> et enfin de <b>5 cartes</b>.</p>`,
    },
    pair: {
      name: 'Paires',
      title: 'Étape 2 — Les paires (2 points chacune)',
      html: `<p>Chaque paire de cartes de <b>même rang</b> vaut 2 points. Sélectionne-les <b>deux par deux</b>.</p>
        <p>Trois cartes pareilles = <b>3 paires différentes</b> (6 pts). Quatre pareilles = <b>6 paires</b> (12 pts).
        Attention : un 10 et un roi valent tous deux 10, mais ce n'est <b>pas</b> une paire — il faut le même rang.</p>`,
    },
    run: {
      name: 'Suites',
      title: 'Étape 3 — Les suites (1 point par carte)',
      html: `<p>Trois cartes ou plus de rangs <b>consécutifs</b>, peu importe la sorte. Ordre : A-2-3-…-10-J-Q-K.
        L'As est toujours bas : <b>Q-K-A n'est pas une suite</b>.</p>
        <p>Seule la suite la <b>plus longue</b> compte : dans 4-5-6-7, c'est une suite de 4 (4 pts), pas deux suites de 3.
        Si un rang est en double (ex. 4-5-5-6), il y a <b>deux suites distinctes</b> (une avec chaque 5) :
        sélectionne-les une à la fois.</p>`,
    },
    flush: {
      name: 'Couleur',
      title: 'Étape 4 — La couleur (« flush »)',
      html: `<p><b>Dans une main</b> : si tes 4 cartes sont de la même sorte = 4 points ; si la coupe est aussi de cette sorte = 5 points.</p>
        <p><b>Dans le crib</b> : la couleur compte seulement si les 5 cartes (avec la coupe) sont de la même sorte = 5 points.</p>
        <p>La coupe ne peut jamais remplacer une carte de la main. S'il n'y a pas de couleur, passe à l'étape suivante.</p>`,
    },
    nobs: {
      name: 'Nobs',
      title: 'Étape 5 — Le nobs (1 point)',
      html: `<p>Si tu as dans ta main (pas la coupe) le <b>valet (J) de la même sorte que la carte de la coupe</b>, tu marques 1 point.</p>
        <p>(Si la coupe elle-même est un valet, c'est le donneur qui a marqué 2 points au moment de la coupe : « his heels ».)</p>`,
    },
  };

  function cardsRow(hand, starter, opts = {}) {
    const row = document.createElement('div');
    row.className = 'cnt-cards';
    const handWrap = document.createElement('div');
    handWrap.className = 'cnt-hand';
    const lab = document.createElement('div');
    lab.className = 'cnt-lab';
    lab.textContent = opts.isCrib ? 'Crib (4 cartes)' : 'Main (4 cartes)';
    const hw = document.createElement('div');
    hw.className = 'cnt-row';
    for (const c of hand) hw.appendChild(makeCardBtn(c, opts));
    handWrap.append(lab, hw);
    const stWrap = document.createElement('div');
    stWrap.className = 'cnt-hand starter-wrap';
    const lab2 = document.createElement('div');
    lab2.className = 'cnt-lab';
    lab2.textContent = 'Coupe';
    const sw = document.createElement('div');
    sw.className = 'cnt-row';
    sw.appendChild(makeCardBtn(starter, opts, true));
    stWrap.append(lab2, sw);
    row.append(handWrap, stWrap);
    return row;
  }

  function makeCardBtn(c, opts, isStarter) {
    const el = cardEl(c);
    if (isStarter) el.classList.add('starter');
    if (opts.sel && opts.sel.has(c.id)) el.classList.add('selected');
    if (opts.hl && opts.hl.has(c.id)) el.classList.add('hl');
    if (opts.onClick) {
      el.classList.add('clickable');
      el.tabIndex = 0;
      el.addEventListener('click', () => opts.onClick(c));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClick(c); } });
    }
    return el;
  }

  function chipHTML(combo, starter, status, runningTotal) {
    const ids = combo.cards.map(c => c.id).join(',');
    const st = status === 'missed' ? ' missed' : status === 'found' ? ' found' : '';
    const tag = status === 'missed' ? '<span class="chip-tag">manqué</span>' : '';
    const run = runningTotal != null ? `<span class="chip-run">${runningTotal}</span>` : '';
    return `<div class="chip${st}" data-ids="${ids}"><span class="chip-l">${Scoring.comboLabel(combo)}</span>
      <span class="chip-d">${Scoring.comboDetail(combo, starter)}</span>${tag}
      <span class="chip-p">+${combo.points}</span>${run}</div>`;
  }

  function breakdownHTML(res, starter, statusOf) {
    if (!res.combos.length) {
      return `<div class="bd-empty">Aucune combinaison : <b>0 point</b>.</div>
        <div class="announce">« ${Scoring.announce([])} »</div>`;
    }
    let t = 0;
    let h = '<div class="bd-list">';
    for (const type of TYPES) {
      const cs = res.combos.filter(c => c.type === type);
      if (!cs.length) continue;
      h += `<div class="bd-group"><div class="bd-gt">${STEP[type].name}</div>`;
      for (const c of cs) { t += c.points; h += chipHTML(c, starter, statusOf ? statusOf(c) : null, t); }
      h += '</div>';
    }
    h += '</div>';
    h += `<div class="bd-total">Total : <b>${res.total}</b> point${res.total > 1 ? 's' : ''}</div>`;
    h += `<div class="announce">« ${Scoring.announce(res.combos)} »</div>`;
    const notes = Scoring.patternNotes(res);
    if (notes.length) h += '<ul class="notes">' + notes.map(n => `<li>${n}</li>`).join('') + '</ul>';
    return h;
  }

  /** Survol d'une puce -> surligne les cartes correspondantes. */
  function wireChipHover(root) {
    if (root._chipHover) return;
    root._chipHover = true;
    root.addEventListener('mouseover', e => {
      const chip = e.target.closest('.chip');
      if (!chip || !root.contains(chip)) return;
      const ids = chip.dataset.ids.split(',');
      root.querySelectorAll('.cnt-cards .card').forEach(el => el.classList.toggle('hover-hl', ids.includes(el.dataset.id)));
    });
    root.addEventListener('mouseout', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      root.querySelectorAll('.cnt-cards .card.hover-hl').forEach(el => el.classList.remove('hover-hl'));
    });
  }

  function headHTML(cfg) {
    const kind = cfg.isCrib
      ? 'Le crib : 4 cartes + la coupe. Rappel : une couleur de 4 ne compte pas dans le crib.'
      : 'Une main se compte avec ses 4 cartes <b>plus la coupe</b> (5 cartes en tout).';
    return `<div class="cnt-head"><div class="cnt-title">${cfg.title}</div><div class="cnt-sub">${kind}</div></div>`;
  }

  /* ---------------- Mode guidé ---------------- */
  function guided(root, cfg) {
    const { hand, starter, isCrib } = cfg;
    const res = Scoring.scoreHand(hand, starter, isCrib);
    const all = hand.concat([starter]);
    const maxRun = Scoring.maxRunLength(all);
    const status = new Map();
    let stepIdx = 0, revealPending = false, hintLevel = 0, hintIds = null;
    const sel = new Set();
    let msg = { kind: 'info', text: 'Clique sur les cartes qui forment une combinaison, puis sur « Valider ».' };
    wireChipHover(root);

    return new Promise(resolve => {
      const combosOf = t => res.combos.filter(c => c.type === t);
      const missingOf = t => combosOf(t).filter(c => !status.has(key(c.type, c.cards)));
      const selCards = () => all.filter(c => sel.has(c.id));
      const pts = st => res.combos.filter(c => status.get(key(c.type, c.cards)) === st).reduce((a, c) => a + c.points, 0);
      const setMsg = (kind, text) => { msg = { kind, text }; render(); };

      function check(type, cs) {
        const vals = cs.map(cardValue);
        switch (type) {
          case 'fifteen': {
            if (cs.length < 2) return 'Un quinze se fait avec au moins 2 cartes.';
            const s = vals.reduce((a, b) => a + b, 0);
            if (s !== 15) {
              const face = cs.some(c => c.rank > 10) ? ' (Rappel : J, Q et K valent 10.)' : '';
              const ace = cs.some(c => c.rank === 1) ? ' (Rappel : l\'As vaut 1.)' : '';
              return `${vals.join(' + ')} = ${s}, pas 15.${face}${ace}`;
            }
            return null;
          }
          case 'pair': {
            const same = cs.every(c => c.rank === cs[0].rank);
            if (cs.length !== 2) {
              if (same && cs.length > 2) {
                const n = cs.length;
                return `Une paire, c'est exactement 2 cartes. Avec ${n} cartes pareilles, il y a ${n * (n - 1) / 2} paires différentes : sélectionne-les deux par deux.`;
              }
              return 'Une paire, c\'est exactement 2 cartes de même rang.';
            }
            if (!same) {
              if (vals[0] === 10 && vals[1] === 10) return `Elles valent toutes les deux 10, mais ${RANK_NAME[cs[0].rank]} et ${RANK_NAME[cs[1].rank]} ne sont pas le même rang : ce n'est pas une paire.`;
              return 'Ces deux cartes ne sont pas du même rang.';
            }
            return null;
          }
          case 'run': {
            if (cs.length < 3) return 'Une suite compte au moins 3 cartes.';
            const ranks = cs.map(c => c.rank).sort((a, b) => a - b);
            if (new Set(ranks).size !== ranks.length) return 'Une suite ne peut pas contenir deux cartes du même rang. Quand un rang est en double, il y a plusieurs suites : compte-les séparément, avec une seule carte du doublon à la fois.';
            if (!Scoring.isRun(cs)) {
              const lab = ranks.map(r => RANK_LABEL[r]).join('-');
              const ace = ranks.includes(1) && ranks.includes(13) ? ' L\'As est toujours bas : il ne suit pas le roi.' : '';
              return `${lab} : ces rangs ne se suivent pas.${ace}`;
            }
            if (cs.length < maxRun) return `Cette suite de ${cs.length} fait partie d'une suite de ${maxRun} : seule la plus longue compte. Sélectionne les ${maxRun} cartes.`;
            return null;
          }
          case 'flush': {
            if (!cs.every(c => c.suit === cs[0].suit)) return 'Ces cartes ne sont pas toutes de la même sorte.';
            const handCards = cs.filter(c => c.id !== starter.id);
            if (handCards.length < 4) return 'La couleur doit être faite avec les 4 cartes de la main ; la coupe peut seulement s\'y ajouter comme 5e carte.';
            const hasStarter = cs.length === 5;
            if (isCrib && !hasStarter) {
              return starter.suit === cs[0].suit
                ? 'Dans le crib il faut les 5 cartes : ajoute la coupe à ta sélection.'
                : 'Dans le crib, une couleur de 4 ne compte pas : il faudrait que la coupe soit aussi de cette sorte.';
            }
            if (!hasStarter && starter.suit === cs[0].suit) return 'Presque ! La coupe est aussi de cette sorte : ajoute-la pour une couleur de 5.';
            return null;
          }
          case 'nobs': {
            if (cs.length !== 1) return 'Le nobs, c\'est une seule carte : un valet.';
            const c = cs[0];
            if (c.rank !== 11) return 'Le nobs est forcément un valet (J).';
            if (c.id === starter.id) return 'Le valet de la coupe ne compte pas comme nobs. (Quand la coupe est un valet, le donneur a déjà marqué 2 points : « his heels ».)';
            if (c.suit !== starter.suit) return `Ce valet est ${SUITS[c.suit].name}, mais la coupe est ${SUITS[starter.suit].name} : il doit être de la même sorte.`;
            return null;
          }
        }
        return 'Combinaison invalide.';
      }

      function successText(c) {
        switch (c.type) {
          case 'fifteen': return `✔ ${c.cards.map(cardValue).join(' + ')} = 15 → <b>2 points</b> !`;
          case 'pair': return '✔ Une paire → <b>2 points</b> !';
          case 'run': return `✔ Suite de ${c.points} → <b>${c.points} points</b> !`;
          case 'flush': return `✔ Couleur de ${c.points} → <b>${c.points} points</b> !`;
          case 'nobs': return '✔ Le nobs → <b>1 point</b> !';
        }
        return '✔';
      }

      function validate() {
        const type = TYPES[stepIdx];
        const cs = selCards();
        if (!cs.length) return setMsg('warn', 'Sélectionne d\'abord des cartes en cliquant dessus.');
        const err = check(type, cs);
        if (err) return setMsg('err', err);
        const k = key(type, cs);
        if (status.has(k)) return setMsg('warn', status.get(k) === 'missed' ? 'Celle-là a déjà été révélée.' : 'Cette combinaison est déjà comptée. Cherche-en une autre !');
        const combo = res.combos.find(c => key(c.type, c.cards) === k);
        if (!combo) return setMsg('err', 'Cette combinaison ne compte pas.');
        status.set(k, 'found');
        sel.clear(); hintIds = null;
        const left = missingOf(type).length;
        setMsg('ok', successText(combo) + (left === 0 ? ' Il n\'en reste plus de ce type.' : ''));
      }

      function next() {
        const type = TYPES[stepIdx];
        const miss = missingOf(type);
        if (miss.length && !revealPending) {
          miss.forEach(c => status.set(key(c.type, c.cards), 'missed'));
          revealPending = true;
          const p = miss.reduce((a, c) => a + c.points, 0);
          sel.clear(); hintIds = null;
          return setMsg('err', `Il en restait ! Tu as manqué ${miss.length} combinaison${miss.length > 1 ? 's' : ''} (${p} pt${p > 1 ? 's' : ''}), marquée${miss.length > 1 ? 's' : ''} en rouge plus bas. Survole-les pour voir les cartes, puis continue.`);
        }
        const hadAny = combosOf(type).length > 0;
        const allFound = !revealPending;
        revealPending = false; hintLevel = 0; hintIds = null; sel.clear();
        stepIdx++;
        let t = '';
        if (allFound) t = hadAny ? `Bravo, tu as trouvé tous les ${STEP[type].name.toLowerCase()} ! ` : `Exact : aucun${type === 'flush' ? 'e couleur' : type === 'nobs' ? ' nobs' : 'e combinaison'} ici. `;
        if (stepIdx < TYPES.length) t += 'Prochaine étape : ' + STEP[TYPES[stepIdx]].name.toLowerCase() + '.';
        setMsg(allFound ? 'ok' : 'info', t || 'Continue.');
      }

      function hint() {
        const type = TYPES[stepIdx];
        const miss = missingOf(type);
        if (!miss.length) return setMsg('info', 'Il ne reste plus rien à trouver dans cette étape : passe à la suivante !');
        if (hintLevel === 0) {
          hintLevel = 1;
          return setMsg('info', `Indice : il reste <b>${miss.length}</b> combinaison${miss.length > 1 ? 's' : ''} à trouver dans cette étape. (Clique encore sur Indice pour en voir une.)`);
        }
        hintIds = new Set(miss[0].cards.map(c => c.id));
        setMsg('info', 'Regarde les cartes qui clignotent : ensemble, elles forment une combinaison. Sélectionne-les et valide.');
      }

      function selInfo() {
        const cs = selCards();
        const type = TYPES[stepIdx];
        if (!cs.length) return 'Aucune carte sélectionnée.';
        if (type === 'fifteen') {
          const s = Scoring.sum(cs);
          return `Sélection : ${cs.map(cardValue).join(' + ')} = <b class="${s === 15 ? 'good' : s > 15 ? 'bad' : ''}">${s}</b>`;
        }
        if (type === 'run') return 'Sélection (triée) : ' + sortCards(cs).map(c => RANK_LABEL[c.rank]).join(' – ');
        return 'Sélection : ' + miniCards(cs, starter.id);
      }

      function render() {
        root.innerHTML = '';
        root.insertAdjacentHTML('beforeend', headHTML(cfg));
        const done = stepIdx >= TYPES.length;
        root.appendChild(cardsRow(hand, starter, {
          isCrib, sel, hl: hintIds,
          onClick: done ? null : c => { sel.has(c.id) ? sel.delete(c.id) : sel.add(c.id); hintIds = hintIds; render(); },
        }));

        // Barre des étapes
        let tabs = '<div class="cnt-steps">';
        TYPES.forEach((t, i) => {
          const f = combosOf(t).filter(c => status.has(key(c.type, c.cards)));
          const p = f.reduce((a, c) => a + c.points, 0);
          const cls = i === stepIdx ? 'cur' : i < stepIdx ? 'past' : '';
          tabs += `<div class="cnt-step ${cls}"><span>${i + 1}. ${STEP[t].name}</span><b>${i <= stepIdx || i < stepIdx ? p : '·'}</b></div>`;
        });
        tabs += `<div class="cnt-step total"><span>Total</span><b>${pts('found') + pts('missed')}</b></div></div>`;
        root.insertAdjacentHTML('beforeend', tabs);

        if (!done) {
          const type = TYPES[stepIdx];
          root.insertAdjacentHTML('beforeend', `<div class="cnt-info"><h4>${STEP[type].title}</h4>${STEP[type].html}</div>`);
          root.insertAdjacentHTML('beforeend', `<div class="cnt-selinfo">${selInfo()}</div>`);
          root.insertAdjacentHTML('beforeend', `<div class="cnt-msg ${msg.kind}">${msg.text}</div>`);
          const act = document.createElement('div');
          act.className = 'cnt-actions';
          act.append(
            btn('Valider la combinaison', validate, 'primary', revealPending),
            btn('Effacer la sélection', () => { sel.clear(); render(); }, '', !sel.size),
            btn('💡 Indice', hint, '', revealPending),
            btn(revealPending ? 'Compris → étape suivante' : (stepIdx === TYPES.length - 1 ? 'J\'ai tout trouvé → résultat' : 'J\'ai tout trouvé → étape suivante'), next, revealPending ? 'primary' : 'next'),
          );
          root.appendChild(act);

          // Liste des combinaisons trouvées
          let t = 0;
          let list = '';
          for (const ty of TYPES) for (const c of res.combos.filter(x => x.type === ty)) {
            const st = status.get(key(c.type, c.cards));
            if (!st) continue;
            t += c.points;
            list += chipHTML(c, starter, st, t);
          }
          const counted = res.combos.filter(c => status.has(key(c.type, c.cards)));
          root.insertAdjacentHTML('beforeend',
            `<div class="cnt-found"><div class="cnt-lab">Ce que tu as compté jusqu'ici</div>${list || '<div class="muted">Rien encore.</div>'}</div>` +
            (counted.length ? `<div class="announce small">« ${Scoring.announce(counted)} »</div>` : ''));
        } else {
          const f = pts('found'), m = pts('missed');
          let verdict;
          if (m === 0) verdict = `<div class="cnt-msg ok">🎉 Parfait ! Tu as trouvé les <b>${res.total}</b> points sans aide.</div>`;
          else verdict = `<div class="cnt-msg warn">Tu as trouvé <b>${f}</b> point${f > 1 ? 's' : ''} sur <b>${res.total}</b>. Il t'en manquait <b>${m}</b> (en rouge). ${cfg.missedNote || ''}</div>`;
          root.insertAdjacentHTML('beforeend', verdict);
          root.insertAdjacentHTML('beforeend', `<div class="cnt-lab">Le compte complet, dans l'ordre où on l'annonce :</div>` +
            breakdownHTML(res, starter, c => status.get(key(c.type, c.cards))));
          const act = document.createElement('div');
          act.className = 'cnt-actions';
          act.append(btn(cfg.finishLabel || 'Continuer', () => resolve({ found: f, missed: m, total: res.total, res }), 'primary'));
          root.appendChild(act);
        }
      }
      render();
    });
  }

  /* ---------------- Mode « total seulement » ---------------- */
  function totalOnly(root, cfg) {
    const { hand, starter, isCrib } = cfg;
    const res = Scoring.scoreHand(hand, starter, isCrib);
    wireChipHover(root);
    return new Promise(resolve => {
      root.innerHTML = '';
      root.insertAdjacentHTML('beforeend', headHTML(cfg));
      root.appendChild(cardsRow(hand, starter, { isCrib }));
      root.insertAdjacentHTML('beforeend', `<div class="cnt-info"><p>Compte toute la main dans l'ordre : <b>quinzes, paires, suites, couleur, nobs</b>. Puis annonce ton total.</p></div>
        <div class="quiz"><label>Ton total : <input type="number" min="0" max="29" inputmode="numeric" class="quiz-in"></label></div>
        <div class="cnt-msg info">Entre un nombre puis clique sur « Annoncer ».</div>`);
      const act = document.createElement('div');
      act.className = 'cnt-actions';
      const input = root.querySelector('.quiz-in');
      const go = () => {
        const v = parseInt(input.value, 10);
        if (isNaN(v) || v < 0) { root.querySelector('.cnt-msg').textContent = 'Entre un nombre (0 à 29).'; return; }
        let m;
        if (v === res.total) m = `<div class="cnt-msg ok">🎉 Exact ! La main vaut bien <b>${res.total}</b>.</div>`;
        else if (v < res.total) m = `<div class="cnt-msg warn">Tu as annoncé ${v}, mais la main vaut <b>${res.total}</b> : il te manque ${res.total - v} point${res.total - v > 1 ? 's' : ''}. ${cfg.missedNote || ''}</div>`;
        else m = `<div class="cnt-msg err">Tu as annoncé ${v}, mais la main ne vaut que <b>${res.total}</b>. On ne peut marquer que ce que la main vaut vraiment.</div>`;
        root.querySelector('.quiz').remove();
        root.querySelector('.cnt-msg').remove();
        act.innerHTML = '';
        root.insertAdjacentHTML('beforeend', m + '<div class="cnt-lab">Le compte complet :</div>' + breakdownHTML(res, starter));
        act.append(btn(cfg.finishLabel || 'Continuer', () => resolve({ found: Math.min(v, res.total), missed: Math.max(0, res.total - v), total: res.total, res }), 'primary'));
        root.appendChild(act);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      act.append(btn('Annoncer', go, 'primary'));
      root.appendChild(act);
      setTimeout(() => input.focus(), 50);
    });
  }

  /* ---------------- Mode automatique ---------------- */
  function auto(root, cfg) {
    const res = Scoring.scoreHand(cfg.hand, cfg.starter, cfg.isCrib);
    return reveal(root, cfg, res, null).then(() => ({ found: res.total, missed: 0, total: res.total, res }));
  }

  /* ---------------- Compte de l'ordinateur ---------------- */
  function showCpu(root, cfg) {
    const res = Scoring.scoreHand(cfg.hand, cfg.starter, cfg.isCrib);
    if (!cfg.quiz) return reveal(root, cfg, res, null).then(() => res);
    wireChipHover(root);
    return new Promise(resolve => {
      root.innerHTML = '';
      root.insertAdjacentHTML('beforeend', headHTML(cfg));
      root.appendChild(cardsRow(cfg.hand, cfg.starter, { isCrib: cfg.isCrib }));
      root.insertAdjacentHTML('beforeend', `<div class="cnt-info"><p><b>Exercice :</b> avant que l'ordi annonce, compte toi-même cette main
        (quinzes, paires, suites, couleur, nobs). Combien vaut-elle ?</p></div>
        <div class="quiz"><label>Ton estimation : <input type="number" min="0" max="29" inputmode="numeric" class="quiz-in"></label></div>`);
      const act = document.createElement('div');
      act.className = 'cnt-actions';
      const input = root.querySelector('.quiz-in');
      const go = guess => reveal(root, cfg, res, guess).then(() => resolve(res));
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value !== '') go(parseInt(input.value, 10)); });
      act.append(
        btn('Vérifier', () => { if (input.value !== '') go(parseInt(input.value, 10)); else input.focus(); }, 'primary'),
        btn('Je ne sais pas, montre-moi', () => go(null)),
      );
      root.appendChild(act);
      setTimeout(() => input.focus(), 50);
    });
  }

  /** Révélation combinaison par combinaison, avec surlignage des cartes. */
  function reveal(root, cfg, res, guess) {
    wireChipHover(root);
    return new Promise(resolve => {
      let shown = res.combos.length ? 0 : res.combos.length;
      const ordered = [];
      for (const t of TYPES) ordered.push(...res.combos.filter(c => c.type === t));
      function render() {
        root.innerHTML = '';
        root.insertAdjacentHTML('beforeend', headHTML(cfg));
        const cur = shown > 0 && shown <= ordered.length ? ordered[shown - 1] : null;
        const all = shown >= ordered.length;
        root.appendChild(cardsRow(cfg.hand, cfg.starter, { isCrib: cfg.isCrib, hl: cur && !all ? new Set(cur.cards.map(c => c.id)) : null }));
        if (!all) {
          let t = 0, list = '';
          ordered.slice(0, shown).forEach(c => { t += c.points; list += chipHTML(c, cfg.starter, null, t); });
          const said = ordered.slice(0, shown);
          root.insertAdjacentHTML('beforeend', `<div class="cnt-info"><p>${cfg.who || 'On'} annonce les combinaisons une à une, dans l'ordre : quinzes, paires, suites, couleur, nobs. Les cartes concernées sont surlignées.</p></div>
            <div class="cnt-found">${list || '<div class="muted">Clique sur « Combinaison suivante ».</div>'}</div>
            ${said.length ? `<div class="announce small">« ${Scoring.announce(said)} »</div>` : ''}`);
          const act = document.createElement('div');
          act.className = 'cnt-actions';
          act.append(btn('Combinaison suivante ▸', () => { shown++; render(); }, 'primary'), btn('Tout montrer', () => { shown = ordered.length; render(); }));
          root.appendChild(act);
        } else {
          let fb = '';
          if (guess != null && !isNaN(guess)) {
            fb = guess === res.total
              ? `<div class="cnt-msg ok">🎉 Bien compté ! Tu avais trouvé <b>${res.total}</b>.</div>`
              : `<div class="cnt-msg warn">Tu avais estimé <b>${guess}</b> ; la main vaut <b>${res.total}</b>. Compare avec le détail ci-dessous.</div>`;
          }
          root.insertAdjacentHTML('beforeend', fb + breakdownHTML(res, cfg.starter));
          const act = document.createElement('div');
          act.className = 'cnt-actions';
          act.append(btn(cfg.finishLabel || 'Continuer', () => resolve(), 'primary'));
          root.appendChild(act);
        }
      }
      render();
    });
  }

  function btn(label, fn, cls = '', disabled = false) {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.innerHTML = label;
    b.disabled = !!disabled;
    b.addEventListener('click', fn);
    return b;
  }

  /** Compte d'une main du joueur, selon le mode choisi. */
  function userCount(root, cfg, mode) {
    if (mode === 'total') return totalOnly(root, cfg);
    if (mode === 'auto') return auto(root, cfg);
    return guided(root, cfg);
  }

  return { userCount, guided, totalOnly, auto, showCpu, breakdownHTML, btn, STEP };
})();
