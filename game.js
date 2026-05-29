'use strict';

// ── Card system ───────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const cardVal  = r => r === 'A' ? 1 : ['10','J','Q','K'].includes(r) ? 0 : +r;
const handTot  = h => h.reduce((s, c) => s + cardVal(c.rank), 0) % 10;
const isRedS   = s => s === '♥' || s === '♦';

function buildShoe() {
  const s = [];
  for (let d = 0; d < 8; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        s.push({ rank, suit });
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

// ── State ─────────────────────────────────────────────────────────────────────
const g = {
  shoe: buildShoe(),
  balance: 1000,
  commission: 0,
  bet: 0,
  betType: null,
  player: [],
  banker: [],
  outcome: null,
  history: [],
  bigRoad: [],
  bigEyeBoy: [],
  smallRoad: [],
  insight: '',
  prediction: '',
  stats: { rounds:0, wins:0, losses:0, ties:0, bigWin:0, bigLoss:0, netPnL:0 },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function dealCard() {
  if (g.shoe.length < 15) g.shoe = buildShoe();
  return g.shoe.pop();
}

// ── Third-card rules ──────────────────────────────────────────────────────────
function bankerDecision(bt, playerDrew, p3v) {
  if (bt <= 2) return { draws: true,  why: `Banker ${bt} (0–2): always draws.` };
  if (bt === 3) {
    if (!playerDrew) return { draws: true, why: 'Banker 3, Player stood: draws.' };
    return { draws: p3v !== 8, why: `Banker 3: ${p3v !== 8 ? 'draws' : 'stands'} (P3=${p3v}${p3v !== 8 ? ', ≠8' : '=8'}).` };
  }
  if (bt === 4) {
    if (!playerDrew) return { draws: false, why: 'Banker 4, Player stood: stands.' };
    const d = p3v >= 2 && p3v <= 7;
    return { draws: d, why: `Banker 4: ${d?'draws':'stands'} (P3=${p3v}, need 2–7).` };
  }
  if (bt === 5) {
    if (!playerDrew) return { draws: false, why: 'Banker 5, Player stood: stands.' };
    const d = p3v >= 4 && p3v <= 7;
    return { draws: d, why: `Banker 5: ${d?'draws':'stands'} (P3=${p3v}, need 4–7).` };
  }
  if (bt === 6) {
    if (!playerDrew) return { draws: false, why: 'Banker 6, Player stood: stands.' };
    const d = p3v === 6 || p3v === 7;
    return { draws: d, why: `Banker 6: ${d?'draws':'stands'} (P3=${p3v}, need 6–7).` };
  }
  return { draws: false, why: 'Banker 7: stands.' };
}

// ── Payout ────────────────────────────────────────────────────────────────────
function resolveResult(winner, explain) {
  const bet = g.bet, type = g.betType;
  let profit = 0;
  if (winner === 'tie') {
    if (type === 'tie') {
      profit = bet * 8;
      g.balance += bet + profit;
      g.outcome = 'WIN';
      explain.push({ cls: 'le-payout', text: `Tie pays 8:1 — profit: +$${profit}` });
    } else {
      g.balance += bet;
      g.outcome = 'PUSH';
      explain.push({ cls: 'le-payout', text: `Tie — ${type} bet returned (push)` });
    }
  } else if (winner === type) {
    if (type === 'banker') {
      const comm = Math.round(bet * 0.05 * 100) / 100;
      profit = bet - comm;
      g.commission += comm;
      g.balance += bet + profit;
      g.outcome = 'WIN';
      explain.push({ cls: 'le-payout', text: `Banker pays 0.95:1 — profit: +$${profit.toFixed(2)} (comm $${comm.toFixed(2)} tracked)` });
    } else {
      profit = bet;
      g.balance += bet + profit;
      g.outcome = 'WIN';
      explain.push({ cls: 'le-payout', text: `Player pays 1:1 — profit: +$${profit}` });
    }
  } else {
    g.outcome = 'LOSS';
    explain.push({ cls: 'le-payout', text: `${type[0].toUpperCase()+type.slice(1)} lost — -$${bet}` });
  }
  const h = winner === 'player' ? 'P' : winner === 'banker' ? 'B' : 'T';
  g.history.push(h);
  if (g.history.length > 10) g.history.shift();
  const s = g.stats;
  s.rounds++;
  if (g.outcome === 'WIN')  { s.wins++;   s.bigWin  = Math.max(s.bigWin,  profit); s.netPnL += profit; }
  if (g.outcome === 'LOSS') { s.losses++; s.bigLoss = Math.max(s.bigLoss, bet);    s.netPnL -= bet; }
  if (g.outcome === 'PUSH') s.ties++;
  updateBigRoad(h);
  updateDerivedRoads();
  updateInsight();
}

// ── Roads ─────────────────────────────────────────────────────────────────────
function updateBigRoad(h) {
  if (h === 'T') {
    if (g.bigRoad.length) g.bigRoad[g.bigRoad.length-1].at(-1).ties++;
    return;
  }
  if (!g.bigRoad.length) { g.bigRoad.push([{result:h,ties:0}]); return; }
  const last = g.bigRoad[g.bigRoad.length-1];
  if (last.at(-1).result === h) last.push({result:h,ties:0});
  else g.bigRoad.push([{result:h,ties:0}]);
  if (g.bigRoad.length > 20) g.bigRoad.shift();
}

function computeDerivedRoad(offset) {
  const result = [], cols = g.bigRoad;
  for (let ci = 1; ci < cols.length; ci++) {
    for (let ri = 0; ri < cols[ci].length; ri++) {
      const refCi = ci - offset + 1;
      if (refCi < 0) continue;
      let isRed;
      if (ri === 0) {
        const pL = cols[ci-1]?.length ?? 0;
        const rL = refCi > 0 ? (cols[refCi-1]?.length ?? 0) : 0;
        isRed = pL === rL;
      } else {
        isRed = ri < (cols[refCi]?.length ?? 0);
      }
      result.push(isRed ? 'R' : 'B');
      if (result.length >= 60) return result;
    }
  }
  return result;
}

function updateDerivedRoads() {
  g.bigEyeBoy = computeDerivedRoad(2);
  g.smallRoad = computeDerivedRoad(3);
}

function updateInsight() {
  const nt = g.history.filter(x => x !== 'T');
  if (!nt.length) { g.insight = ''; g.prediction = ''; return; }
  let bStr = 0, pStr = 0;
  for (let i = nt.length-1; i >= 0 && nt[i]==='B'; i--) bStr++;
  for (let i = nt.length-1; i >= 0 && nt[i]==='P'; i--) pStr++;
  let alt = nt.length >= 4;
  for (let i = 1; i < Math.min(nt.length,6); i++)
    if (nt[nt.length-i] === nt[nt.length-i-1]) { alt = false; break; }
  let bebRed = 0;
  for (let i = g.bigEyeBoy.length-1; i >= 0 && g.bigEyeBoy[i]==='R'; i--) bebRed++;

  if (bStr >= 3) {
    g.insight = `🔴 Banker streak: ${bStr} — casino players often ride this`;
    g.prediction = `Roads lean Banker — superstition, not math`;
  } else if (pStr >= 3) {
    g.insight = `🔵 Player streak: ${pStr} — notable run for Player`;
    g.prediction = `Roads lean Player — superstition, not math`;
  } else if (alt) {
    g.insight = `🔵 Chopping pattern — some players bet the chop`;
    g.prediction = `Roads lean ${nt.at(-1)==='B'?'Player':'Banker'} — superstition, not math`;
  } else if (bebRed >= 4) {
    g.insight = `Pattern repeating — Big Eye roads matching`;
    g.prediction = `Roads lean Unclear — superstition, not math`;
  } else {
    g.insight = `No strong pattern detected`;
    g.prediction = `Roads lean Unclear — superstition, not math`;
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function renderCard(card, container, delay = 0) {
  const div = el('div', `card ${isRedS(card.suit) ? 'red' : 'black'}`);
  div.style.animationDelay = delay + 'ms';
  div.appendChild(Object.assign(el('div','card-tl'), { textContent: card.rank }));
  div.appendChild(Object.assign(el('div','card-suit'), { textContent: card.suit }));
  div.appendChild(Object.assign(el('div','card-br'), { textContent: card.rank }));
  container.appendChild(div);
  return div;
}

function updateScores() {
  $('player-score').textContent = g.player.length ? handTot(g.player) : '';
  $('banker-score').textContent = g.banker.length ? handTot(g.banker) : '';
}

function updateBalance() {
  $('balance').textContent = '$' + g.balance.toFixed(2);
  $('commission').textContent = '$' + g.commission.toFixed(2);
  $('current-bet-display').textContent = '$' + g.bet;
}

function updateHistory() {
  const row = $('history-dots');
  row.innerHTML = '';
  for (const h of g.history) {
    const d = el('div', `hdot hdot-${h}`, h);
    row.appendChild(d);
  }
}

function renderBigRoad() {
  const grid = $('big-road');
  grid.innerHTML = '';
  const maxCols = 13, maxRows = 6;
  const cells = [];
  for (let r = 0; r < maxRows; r++) {
    cells.push([]);
    for (let c = 0; c < maxCols; c++) cells[r].push(null);
  }
  const start = Math.max(0, g.bigRoad.length - maxCols);
  for (let ci = start; ci < g.bigRoad.length; ci++) {
    const col = g.bigRoad[ci];
    const gc  = ci - start;
    for (let ri = 0; ri < Math.min(col.length, maxRows); ri++) {
      cells[ri][gc] = col[ri];
    }
  }
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < maxCols; c++) {
      const cell = cells[r][c];
      if (!cell) { grid.appendChild(el('div','rdot rdot-empty')); continue; }
      const d = el('div', `rdot rdot-${cell.result}`);
      if (cell.ties > 0) d.title = `+${cell.ties} tie(s)`;
      grid.appendChild(d);
    }
  }
}

function renderCompact(gridId, road) {
  const grid = $(gridId);
  grid.innerHTML = '';
  const maxCols = 16, maxRows = 3;
  const slice = road.slice(-(maxCols * maxRows));
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < maxCols; c++) {
      const item = slice[r * maxCols + c];
      if (!item) { grid.appendChild(el('div','rdot rdot-empty')); continue; }
      grid.appendChild(el('div', `rdot rdot-derived-${item}`));
    }
  }
}

function updateRoads() {
  renderBigRoad();
  renderCompact('big-eye-boy', g.bigEyeBoy);
  renderCompact('small-road', g.smallRoad);
  $('insight-text').textContent    = g.insight    || '';
  $('prediction-text').textContent = g.prediction || '';
  $('insight-box').style.display   = g.insight ? '' : 'none';
}

function setLessonLines(lines) {
  const div = $('lesson-dynamic');
  div.innerHTML = '';
  for (const { cls, text } of lines) {
    const p = el('p', cls, text);
    div.appendChild(p);
  }
}

function showPhase(name) {
  ['phase-bet','phase-deal','phase-result'].forEach(id => {
    $(id).classList.toggle('hidden', id !== name);
  });
}

function showResult(outcome) {
  const area = $('result-area');
  area.innerHTML = '';
  const badge = el('div', 'result-badge');
  if (outcome === 'WIN')  { badge.className += ' result-win';  badge.textContent = '🏆 WIN'; }
  if (outcome === 'LOSS') { badge.className += ' result-loss'; badge.textContent = '💸 LOSS'; }
  if (outcome === 'PUSH') { badge.className += ' result-push'; badge.textContent = '🤝 PUSH'; }
  area.appendChild(badge);
}

function clearTable() {
  $('player-cards').innerHTML = '';
  $('banker-cards').innerHTML = '';
  $('player-score').textContent = '';
  $('banker-score').textContent = '';
  $('result-area').innerHTML = '';
}

// ── Betting ───────────────────────────────────────────────────────────────────
function updateBetZones() {
  document.querySelectorAll('.bet-zone').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === g.betType);
  });
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const amount = +chip.dataset.amount;
    if (g.bet + amount > 500 || g.bet + amount > g.balance) return;
    g.bet += amount;
    updateBalance();
    if (g.betType) showPhase('phase-deal');
  });
});

document.querySelectorAll('.bet-zone').forEach(btn => {
  btn.addEventListener('click', () => {
    g.betType = btn.dataset.type;
    updateBetZones();
    if (g.bet > 0) showPhase('phase-deal');
  });
});

$('btn-clear-bet').addEventListener('click', () => {
  g.bet = 0;
  g.betType = null;
  updateBalance();
  updateBetZones();
  showPhase('phase-bet');
});

// ── Deal ──────────────────────────────────────────────────────────────────────
$('btn-deal').addEventListener('click', async () => {
  if (!g.bet || !g.betType) return;
  $('btn-deal').disabled = true;
  g.balance -= g.bet;
  updateBalance();
  clearTable();

  const pCards = $('player-cards');
  const bCards = $('banker-cards');
  const p1 = dealCard(), b1 = dealCard(), p2 = dealCard(), b2 = dealCard();

  g.player = [p1]; renderCard(p1, pCards, 0);   updateScores(); await sleep(250);
  g.banker = [b1]; renderCard(b1, bCards, 0);   updateScores(); await sleep(250);
  g.player = [p1,p2]; renderCard(p2, pCards, 0); updateScores(); await sleep(250);
  g.banker = [b1,b2]; renderCard(b2, bCards, 0); updateScores(); await sleep(300);

  const pt = handTot(g.player), bt = handTot(g.banker);
  const explain = [];

  if (pt >= 8 || bt >= 8) {
    const who = (pt>=8&&bt>=8) ? 'Both have' : pt>=8 ? 'Player has' : 'Banker has';
    explain.push({ cls: 'le-natural', text: `NATURAL ${Math.max(pt,bt)}! ${who} a Natural — no more cards.` });
    explain.push({ cls: '',           text: 'Natural 8 or 9: higher natural wins; equal naturals tie.' });
  } else {
    let playerDrew = false, p3card = null;
    if (pt <= 5) {
      p3card = dealCard();
      g.player = [...g.player, p3card];
      renderCard(p3card, pCards, 0); updateScores(); await sleep(280);
      playerDrew = true;
      explain.push({ cls: 'le-draw', text: `Player drew 3rd card (total ${pt} ≤ 5 → draw on 0–5).` });
    } else {
      explain.push({ cls: 'le-stand', text: `Player stands (total ${pt} — stand on 6–7).` });
    }
    const bt2 = handTot(g.banker);
    const p3v = p3card ? cardVal(p3card.rank) : null;
    const bd  = bankerDecision(bt2, playerDrew, p3v);
    explain.push({ cls: bd.draws ? 'le-draw' : 'le-stand', text: bd.why });
    if (bd.draws) {
      await sleep(200);
      const b3 = dealCard();
      g.banker = [...g.banker, b3];
      renderCard(b3, bCards, 0); updateScores(); await sleep(280);
    }
  }

  const fp = handTot(g.player), fb = handTot(g.banker);
  const winner = fp > fb ? 'player' : fb > fp ? 'banker' : 'tie';
  resolveResult(winner, explain);
  setLessonLines(explain);
  updateBalance();
  updateHistory();
  updateRoads();
  showResult(g.outcome);
  showPhase('phase-result');
});

// ── Next hand ─────────────────────────────────────────────────────────────────
$('btn-next').addEventListener('click', () => {
  g.bet = 0;
  g.betType = null;
  g.outcome = null;
  clearTable();
  updateBalance();
  updateBetZones();
  $('btn-deal').disabled = false;
  showPhase('phase-bet');
  if (g.balance < 10) {
    $('result-area').innerHTML = '<div class="result-badge result-loss">Game Over</div>';
    showPhase('phase-result');
    $('btn-next').textContent = 'Refresh to play again';
    $('btn-next').onclick = () => location.reload();
  }
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.ptab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.ptab-content').forEach(c => c.classList.add('hidden'));
    $(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

// ── Lessons toggle ────────────────────────────────────────────────────────────
$('btn-lessons-toggle').addEventListener('click', () => {
  const panel = $('side-panel');
  const btn   = $('btn-lessons-toggle');
  if (panel.style.display === 'none') {
    panel.style.display = '';
    btn.textContent = 'Lessons ✓';
    btn.classList.add('active');
  } else {
    panel.style.display = 'none';
    btn.textContent = 'Lessons';
    btn.classList.remove('active');
  }
});

// ── Stats modal ───────────────────────────────────────────────────────────────
$('btn-stats').addEventListener('click', () => {
  const s  = g.stats;
  const wr = s.rounds > 0 ? (s.wins/s.rounds*100).toFixed(1)+'%' : 'N/A';
  const pnl = (s.netPnL >= 0 ? '+$' : '-$') + Math.abs(s.netPnL).toFixed(2);
  const rows = [
    ['Rounds', s.rounds], ['Wins', s.wins], ['Losses', s.losses],
    ['Win rate', wr], ['Biggest win', '$'+s.bigWin.toFixed(2)],
    ['Biggest loss', '$'+s.bigLoss.toFixed(2)], ['Net P&L', pnl],
    ['Commission', '$'+g.commission.toFixed(2)], ['Balance', '$'+g.balance.toFixed(2)],
  ];
  $('stats-body').innerHTML = rows.map(([l,v]) =>
    `<div class="stats-row"><span>${l}</span><span>${v}</span></div>`).join('');
  $('modal-stats').classList.remove('hidden');
});

$('btn-rules').addEventListener('click', () => $('modal-rules').classList.remove('hidden'));

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => $(`${btn.dataset.close}`).classList.add('hidden'));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
});

// ── Init ──────────────────────────────────────────────────────────────────────
updateBalance();
updateHistory();
updateRoads();
showPhase('phase-bet');
$('insight-box').style.display = 'none';
