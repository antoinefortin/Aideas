'use strict';
/* ============================================================
   Planche de cribbage (SVG) : 121 trous par joueur, 2 chevilles
   ============================================================ */

const Board = (() => {
  const SP = 21, GAP = 9, X0 = 78, Y0 = 40, LEG_H = 50, LANE = 14;
  const LEG_W = 29 * SP + 5 * GAP;
  const W = X0 + LEG_W + 46;
  const H = Y0 + 3 * LEG_H + LANE + 30;
  const LANES = { you: 0, cpu: 1 };
  let svg = null;

  function xy(lane, n) {
    if (n <= 0) return [X0 - 50 + (n === 0 ? 16 : 0), Y0 + lane * LANE];
    if (n >= 121) return [X0 - 40, Y0 + 3 * LEG_H + LANE / 2];
    const leg = Math.floor((n - 1) / 30), i = (n - 1) % 30, g = Math.floor(i / 5);
    const xi = i * SP + g * GAP;
    const x = leg % 2 === 0 ? X0 + xi : X0 + LEG_W - xi;
    return [x, Y0 + leg * LEG_H + lane * LANE];
  }

  function init(el) {
    svg = el;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let s = `<defs>
      <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c8955a"/><stop offset=".5" stop-color="#a8723c"/><stop offset="1" stop-color="#8a5a2c"/>
      </linearGradient>
      <radialGradient id="pegYou" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#9fd0ff"/><stop offset="1" stop-color="#1d63c4"/></radialGradient>
      <radialGradient id="pegCpu" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ffb3a8"/><stop offset="1" stop-color="#c0322a"/></radialGradient>
    </defs>
    <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="20" fill="url(#wood)" stroke="#5c3a1a" stroke-width="3"/>`;

    // Bandes de couleur des deux pistes
    for (let leg = 0; leg < 4; leg++) {
      for (const p of ['you', 'cpu']) {
        const y = Y0 + leg * LEG_H + LANES[p] * LANE;
        s += `<rect x="${X0 - 8}" y="${y - 6}" width="${LEG_W + 16}" height="12" rx="6" class="lane lane-${p}"/>`;
      }
    }
    // Trous
    for (const p of ['you', 'cpu']) {
      for (let n = 1; n <= 120; n++) {
        const [x, y] = xy(LANES[p], n);
        s += `<circle cx="${x}" cy="${y}" r="3.2" class="hole"/>`;
      }
      for (const n of [-1, 0]) {
        const [x, y] = xy(LANES[p], n);
        s += `<circle cx="${x}" cy="${y}" r="3.2" class="hole"/>`;
      }
    }
    // Trou final
    const [fx, fy] = xy(0, 121);
    s += `<circle cx="${fx}" cy="${fy}" r="6" class="hole finish"/>`;
    s += `<text x="${fx}" y="${fy + 20}" class="blabel strong" text-anchor="middle">121</text>`;
    s += `<text x="${X0 - 42}" y="${Y0 - 14}" class="blabel" text-anchor="middle">départ</text>`;

    // Numéros tous les 5 trous
    for (let leg = 0; leg < 4; leg++) {
      for (let g = 1; g <= 6; g++) {
        const n = leg * 30 + g * 5;
        const [x] = xy(0, n);
        const y = Y0 + leg * LEG_H - 10;
        s += `<text x="${x}" y="${y}" class="blabel${g === 6 ? ' strong' : ''}" text-anchor="middle">${n}</text>`;
      }
    }
    // Lignes de skunk
    const [sx1] = xy(0, 90);
    s += `<line x1="${sx1 + 12}" y1="${Y0 + 2 * LEG_H - 8}" x2="${sx1 + 12}" y2="${Y0 + 3 * LEG_H + LANE + 8}" class="skunk"/>`;
    s += `<text x="${sx1 + 18}" y="${Y0 + 2 * LEG_H + LANE + 30}" class="blabel skunk-t" transform="rotate(-90 ${sx1 + 18} ${Y0 + 2 * LEG_H + LANE + 30})">skunk</text>`;

    // Chevilles
    for (const p of ['you', 'cpu']) {
      const grad = p === 'you' ? 'pegYou' : 'pegCpu';
      s += `<g class="peg back" id="peg-${p}-back"><circle r="5" fill="url(#${grad})" stroke="#222" stroke-width=".8"/></g>`;
      s += `<g class="peg front" id="peg-${p}-front"><circle r="6" fill="url(#${grad})" stroke="#111" stroke-width="1"/></g>`;
    }
    svg.innerHTML = s;
    update({ you: 0, cpu: 0 }, { you: 0, cpu: 0 });
  }

  function place(id, lane, n) {
    const g = svg.querySelector('#' + id);
    const [x, y] = xy(lane, n);
    g.style.transform = `translate(${x}px, ${y}px)`;
  }

  function update(scores, back) {
    if (!svg) return;
    for (const p of ['you', 'cpu']) {
      const front = scores[p];
      const b = front === 0 ? -1 : back[p];
      place(`peg-${p}-front`, LANES[p], front);
      place(`peg-${p}-back`, LANES[p], b);
    }
  }

  return { init, update };
})();
