#!/usr/bin/env node
'use strict';

const readline = require('readline');

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const go  = (r, c) => process.stdout.write(`\x1b[${r};${c}H`);
const out = s => process.stdout.write(s);
const clr = () => out('\x1b[2J\x1b[H');
const R   = '\x1b[0m';
const col = (code, s) => `\x1b[${code}m${s}${R}`;
const red   = s => col(31, s);
const grn   = s => col(32, s);
const yel   = s => col(33, s);
const blu   = s => col(34, s);
const cyn   = s => col(36, s);
const dim   = s => col(2,  s);
const bold  = s => col(1,  s);
const TW = () => process.stdout.columns || 120;
const TH = () => process.stdout.rows    || 40;
const LW = () => Math.floor(TW() * 0.6);
const SC = () => LW() + 1;          // separator col
const RS = () => SC() + 1;          // right panel start col
const RW = () => TW() - SC() - 1;   // right panel usable width
const stripA = s => s.replace(/\x1b\[[0-9;]*[mH]/g, '');
const visLen = s => stripA(s).length;

// ── Cards ─────────────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const cardVal  = r => r === 'A' ? 1 : ['10','J','Q','K'].includes(r) ? 0 : +r;
const handTot  = h => h.reduce((s, c) => s + cardVal(c.rank), 0) % 10;
const isRedS   = s => s === '♥' || s === '♦';

function cardArt(c, faceDown) {
  if (faceDown) return ['┌─────┐','│░░░░░│','│░░░░░│','│░░░░░│','└─────┘'];
  const cc  = isRedS(c.suit) ? '\x1b[31m' : '';
  const rL  = c.rank.length === 1 ? c.rank + ' ' : c.rank;
  const rR  = c.rank.length === 1 ? ' ' + c.rank : c.rank;
  return [
    '┌─────┐',
    `│${cc}${rL}   ${R}│`,
    `│  ${cc}${c.suit}  ${R}│`,
    `│   ${cc}${rR}${R}│`,
    '└─────┘',
  ];
}

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
  outcome: null,   // 'WIN'|'LOSS'|'PUSH'
  winner: null,    // 'player'|'banker'|'tie'
  history: [],     // last 10: 'P'|'B'|'T'
  lessons: true,
  bigRoad: [],     // array of columns; each column = [{result,ties}]
  bigEyeBoy: [],   // 'R'|'B'
  smallRoad: [],   // 'R'|'B'
  insight: '',
  prediction: '',
  lessonLines: [
    'Welcome! Place your first bet to start.',
    'Bet on Player, Banker, or Tie.',
    'Banker has the lowest house edge (~1.06%).',
    'Press ? for the full rule sheet.',
  ],
  stats: { rounds:0, wins:0, losses:0, ties:0, bigWin:0, bigLoss:0, netPnL:0 },
};

function dealCard() {
  if (g.shoe.length < 15) g.shoe = buildShoe();
  return g.shoe.pop();
}

// ── Third-card rules ──────────────────────────────────────────────────────────
function bankerDecision(bt, playerDrew, p3v) {
  if (bt <= 2) return { draws: true,  why: `Banker ${bt} (0–2): always draws.` };
  if (bt === 3) {
    if (!playerDrew) return { draws: true, why: 'Banker 3, Player stood: draws.' };
    return { draws: p3v !== 8,
      why: `Banker 3: ${p3v !== 8 ? 'draws' : 'stands'} (P3=${p3v}${p3v !== 8 ? ', ≠8' : '=8'}).` };
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
  return { draws: false, why: `Banker 7: stands.` };
}

// ── Payout & stats ────────────────────────────────────────────────────────────
function resolveResult(winner, explain) {
  const bet = g.bet, type = g.betType;
  let profit = 0;
  g.winner = winner;
  if (winner === 'tie') {
    if (type === 'tie') {
      profit = bet * 8;
      g.balance += bet + profit;
      g.outcome = 'WIN';
      explain.push(`Tie pays 8:1. Profit: +$${profit}.`);
    } else {
      g.balance += bet;
      g.outcome = 'PUSH';
      explain.push(`Tie — ${type} bet returned (push). No win, no loss.`);
    }
  } else if (winner === type) {
    if (type === 'banker') {
      const comm = Math.round(bet * 0.05 * 100) / 100;
      profit = bet - comm;
      g.commission += comm;
      g.balance += bet + profit;
      g.outcome = 'WIN';
      explain.push(`Banker pays 0.95:1. Profit: +$${profit.toFixed(2)} (comm $${comm.toFixed(2)} tracked).`);
    } else {
      profit = bet;
      g.balance += bet + profit;
      g.outcome = 'WIN';
      explain.push(`Player pays 1:1. Profit: +$${profit}.`);
    }
  } else {
    g.outcome = 'LOSS';
    explain.push(`${type[0].toUpperCase()+type.slice(1)} lost. Loss: -$${bet}.`);
  }
  const h = winner === 'player' ? 'P' : winner === 'banker' ? 'B' : 'T';
  g.history.push(h);
  if (g.history.length > 10) g.history.shift();
  const s = g.stats;
  s.rounds++;
  if (g.outcome === 'WIN')  { s.wins++;   s.bigWin  = Math.max(s.bigWin, profit); s.netPnL += profit; }
  if (g.outcome === 'LOSS') { s.losses++; s.bigLoss = Math.max(s.bigLoss, bet);   s.netPnL -= bet; }
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
  const result = [];
  const cols = g.bigRoad;
  for (let ci = 1; ci < cols.length; ci++) {
    for (let ri = 0; ri < cols[ci].length; ri++) {
      const refCi = ci - offset + 1;
      if (refCi < 0) continue;
      let isRed;
      if (ri === 0) {
        const prevLen   = cols[ci-1]   ? cols[ci-1].length   : 0;
        const refPLen   = refCi > 0 && cols[refCi-1] ? cols[refCi-1].length : 0;
        isRed = prevLen === refPLen;
      } else {
        isRed = ri < (cols[refCi] ? cols[refCi].length : 0);
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
  if (!nt.length) { g.insight = 'No data yet.'; g.prediction = ''; return; }
  let bStr = 0, pStr = 0;
  for (let i = nt.length-1; i >= 0 && nt[i]==='B'; i--) bStr++;
  for (let i = nt.length-1; i >= 0 && nt[i]==='P'; i--) pStr++;
  let alt = nt.length >= 4;
  for (let i = 1; i < Math.min(nt.length,6); i++)
    if (nt[nt.length-i] === nt[nt.length-i-1]) { alt = false; break; }
  let bebRed = 0;
  for (let i = g.bigEyeBoy.length-1; i >= 0 && g.bigEyeBoy[i]==='R'; i--) bebRed++;

  if (bStr >= 3) {
    g.insight    = `\x1b[31m●\x1b[0m Banker streak: ${bStr} — players often ride this`;
    g.prediction = `Roads lean: ${red('Banker')} — superstition, not math`;
  } else if (pStr >= 3) {
    g.insight    = `\x1b[34m●\x1b[0m Player streak: ${pStr} — notable Player run`;
    g.prediction = `Roads lean: ${blu('Player')} — superstition, not math`;
  } else if (alt) {
    const next = nt.at(-1) === 'B' ? blu('Player') : red('Banker');
    g.insight    = `\x1b[34m●\x1b[0m Chopping pattern — some bet the chop`;
    g.prediction = `Roads lean: ${next} — superstition, not math`;
  } else if (bebRed >= 4) {
    g.insight    = `Pattern repeating — Big Eye roads 'matching'`;
    g.prediction = `Roads lean: ${yel('Unclear')} — superstition, not math`;
  } else {
    g.insight    = `No strong pattern detected`;
    g.prediction = `Roads lean: ${yel('Unclear')} — superstition, not math`;
  }
}

// ── Drawing: left panel ───────────────────────────────────────────────────────
const TITLE = [
  ' ██████╗  █████╗  ██████╗ ██████╗  █████╗ ██████╗  █████╗ ████████╗',
  ' ██╔══██╗██╔══██╗██╔════╝██╔════╝ ██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝',
  ' ██████╔╝███████║██║     ██║      ███████║██████╔╝███████║   ██║   ',
  ' ██╔══██╗██╔══██║██║     ██║      ██╔══██║██╔══██╗██╔══██║   ██║   ',
  ' ██████╔╝██║  ██║╚██████╗╚██████╗ ██║  ██║██║  ██║██║  ██║   ██║   ',
  ' ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝  ',
];

function wAt(r, c, text) { go(r, c); out(text); }

function drawLeft() {
  const lw = LW();
  let r = 1;
  for (const line of TITLE)
    wAt(r++, 1, yel(bold(line.substring(0, lw))));
  r++;
  const commStr = g.commission > 0 ? red(`$${g.commission.toFixed(2)}`) : `$${g.commission.toFixed(2)}`;
  wAt(r++, 1, bold('Balance: ') + grn(`$${g.balance.toFixed(2)}`) + '   ' + bold('Commission: ') + commStr);
  if (g.bet > 0) {
    const tc = g.betType === 'banker' ? red : g.betType === 'player' ? blu : grn;
    wAt(r++, 1, bold('Bet: ') + yel(`$${g.bet}`) + ' on ' + tc(g.betType.toUpperCase()));
  } else {
    wAt(r++, 1, dim('Place your bet below'));
  }
  r++;

  // Cards
  if (g.player.length > 0 || g.banker.length > 0) {
    const pt = handTot(g.player), bt = handTot(g.banker);
    wAt(r++, 1, blu(bold(`── PLAYER (${pt}) ─────────────────────────`)) +
               '   ' + red(bold(`── BANKER (${bt}) ──────────────────────`)));
    const pA = g.player.map(c => cardArt(c));
    const bA = g.banker.map(c => cardArt(c));
    for (let li = 0; li < 5; li++) {
      let left = '';
      for (const ca of pA) left += ca[li] + ' ';
      const leftVis = visLen(left);
      if (leftVis < 24) left += ' '.repeat(24 - leftVis);
      let right = '';
      for (const ca of bA) right += ca[li] + ' ';
      wAt(r++, 1, left + '   ' + right);
    }
    r++;
    if (g.outcome) {
      const [top, mid, bot] = g.outcome === 'WIN'
        ? [grn(bold('  ╔══════════════╗')), grn(bold('  ║   🏆  WIN!   ║')), grn(bold('  ╚══════════════╝'))]
        : g.outcome === 'LOSS'
        ? [red(bold('  ╔══════════════╗')), red(bold('  ║   💸  LOSS   ║')), red(bold('  ╚══════════════╝'))]
        : [yel(bold('  ╔══════════════╗')), yel(bold('  ║   🤝  PUSH   ║')), yel(bold('  ╚══════════════╝'))];
      wAt(r++, 1, top); wAt(r++, 1, mid); wAt(r++, 1, bot);
    } else r += 3;
    r++;
  } else r += 13;

  // History
  const histStr = g.history.map(h =>
    h==='P' ? blu('●P') : h==='B' ? red('●B') : grn('—T')).join(' ');
  wAt(r++, 1, bold('Last 10: ') + (histStr || dim('—')));
  r++;
  wAt(r++, 1, dim('[L]essons  [S]tats  [R]oad guide  [?]rules  [Q]uit'));
}

// ── Drawing: right panel ──────────────────────────────────────────────────────
function drawRight() {
  const sc = RS(), rw = RW();
  let r = 1;

  if (!g.lessons) {
    wAt(r++, sc, dim('[ LESSONS: OFF — press L to show ]'));
    r++;
  } else {
    wAt(r++, sc, yel(bold('[ LESSON PANEL ]')));
    wAt(r++, sc, '─'.repeat(Math.min(rw, 36)));
    for (const line of g.lessonLines.slice(0, 5)) {
      if (r > 14) break;
      wAt(r++, sc, line.substring(0, rw + 10));
    }
    r++;
    wAt(r++, sc, bold('📖 Card values:'));
    wAt(r++, sc, 'A=1  2-9=face  10/J/Q/K=0');
    wAt(r++, sc, 'Total = (sum) mod 10');
    r++;
    wAt(r++, sc, bold('🃏 3rd Card:'));
    wAt(r++, sc, blu('Player') + ': 0-5 draw  6-7 stand');
    wAt(r++, sc, red('Banker') + ': 0-2 always draws');
    wAt(r++, sc, '  3: draw unless P3=8');
    wAt(r++, sc, '  4: draw if P3=2–7');
    wAt(r++, sc, '  5: draw if P3=4–7');
    wAt(r++, sc, '  6: draw if P3=6–7');
    wAt(r++, sc, '  7: stands  8-9: Natural');
    r++;
    wAt(r++, sc, bold('💰 Payouts:'));
    wAt(r++, sc, blu('Player') + '  1:1');
    wAt(r++, sc, red('Banker') + '  0.95:1 (5% comm)');
    wAt(r++, sc, grn('Tie') +    '     8:1');
    r++;
  }

  // Roads
  wAt(r++, sc, '─'.repeat(Math.min(rw, 36)));
  wAt(r++, sc, bold('BIG ROAD') + dim(' — same=down, new=right'));
  r = drawBigRoad(r, sc, rw);
  r++;
  wAt(r++, sc, bold('BIG EYE BOY') + dim(' — Red=repeating'));
  r = drawCompact(r, sc, rw, g.bigEyeBoy);
  r++;
  wAt(r++, sc, bold('SMALL ROAD') + dim(' — col further back'));
  r = drawCompact(r, sc, rw, g.smallRoad);
  r++;
  if (g.insight)    wAt(r++, sc, g.insight.substring(0, rw + 15));
  if (g.prediction) wAt(r++, sc, g.prediction.substring(0, rw + 20));
}

function drawBigRoad(startRow, sc, rw) {
  const maxCols = Math.min(20, Math.floor(rw / 3));
  const start   = Math.max(0, g.bigRoad.length - maxCols);
  let r = startRow;
  for (let row = 0; row < 6; row++) {
    let line = '';
    for (let ci = start; ci < Math.min(g.bigRoad.length, start + maxCols); ci++) {
      const col = g.bigRoad[ci];
      if (row < col.length) {
        const cell = col[row];
        const sym  = cell.ties > 0 ? '⊗' : '●';
        line += (cell.result === 'B' ? '\x1b[31m' : '\x1b[34m') + sym + R + ' ';
      } else line += '  ';
    }
    wAt(r++, sc, line);
  }
  return r;
}

function drawCompact(startRow, sc, rw, road) {
  const maxCols = Math.min(20, Math.floor(rw / 2));
  const slice   = road.slice(-maxCols * 3);
  let r = startRow;
  for (let row = 0; row < 3; row++) {
    let line = '';
    for (let col = 0; col < maxCols; col++) {
      const item = slice[row * maxCols + col];
      if (!item) line += '  ';
      else line += (item === 'R' ? '\x1b[31m' : '\x1b[34m') + '● ' + R;
    }
    wAt(r++, sc, line);
  }
  return r;
}

function drawSep() {
  const sc = SC();
  for (let r = 1; r <= TH(); r++) { go(r, sc); out(dim('│')); }
}

function draw() {
  clr();
  drawLeft();
  drawSep();
  drawRight();
  go(TH(), 1);
}

// ── Overlays ──────────────────────────────────────────────────────────────────
function showTutorial() {
  clr();
  const lines = [
    '',
    yel(bold('  ╔══════════════════════════════════════════════════╗')),
    yel(bold('  ║     WELCOME TO BACCARAT  (PUNTO BANCO)           ║')),
    yel(bold('  ╚══════════════════════════════════════════════════╝')),
    '',
    bold('  HOW TO PLAY'),
    '  Two hands are dealt: Player and Banker.',
    '  Bet on which gets closer to 9 — or bet on a Tie.',
    '',
    bold('  CARD VALUES'),
    '  Ace=1   2–9=face value   10/J/Q/K=0',
    '  Only the units digit counts: 8+7=15 → 5',
    '',
    bold('  THIRD CARDS'),
    '  Player draws a 3rd card on 0–5, stands on 6–7.',
    '  Banker follows a strict table (see the Lesson Panel).',
    '  If either starting hand is 8 or 9 (Natural) — no draw.',
    '',
    bold('  PAYOUTS'),
    `  ${blu('Player')} 1:1  |  ${red('Banker')} 0.95:1 (5% comm)  |  ${grn('Tie')} 8:1`,
    '',
    bold('  THE SHOE'),
    '  8 decks shuffled, reshuffled when < 15 cards remain.',
    '',
    bold('  ROADS (right panel)'),
    '  Tracks pattern history — fun, but baccarat is pure chance.',
    '  Banker bet has the lowest house edge (~1.06%).',
    '  Tie bet has the worst edge (~14.4%) — avoid it.',
    '',
    dim('  Press any key to start...'),
  ];
  lines.forEach((l, i) => { go(i+1,1); out(l); });
}

function showStats() {
  const s  = g.stats;
  const sc = Math.max(1, Math.floor(TW()/2) - 22);
  const sr = Math.max(1, Math.floor(TH()/2) - 8);
  const wr = s.rounds > 0 ? (s.wins/s.rounds*100).toFixed(1)+'%' : 'N/A';
  const pnl = (s.netPnL >= 0 ? '+$' : '-$') + Math.abs(s.netPnL).toFixed(2);
  const cell = (label, val) => {
    const inner = '  ' + label.padEnd(16) + String(val).padEnd(24);
    return cyn(bold('║')) + inner.padEnd(42) + cyn(bold('║'));
  };
  const box = [
    cyn(bold('╔══════════════════════════════════════════╗')),
    cyn(bold('║') + bold('          SESSION STATISTICS              ') + bold('║')),
    cyn(bold('╠══════════════════════════════════════════╣')),
    cell('Rounds:', s.rounds),
    cell('Wins:', s.wins),
    cell('Losses:', s.losses),
    cell('Win rate:', wr),
    cell('Biggest win:', '$'+s.bigWin.toFixed(2)),
    cell('Biggest loss:', '$'+s.bigLoss.toFixed(2)),
    cell('Net P&L:', pnl),
    cell('Commission:', '$'+g.commission.toFixed(2)),
    cell('Balance:', '$'+g.balance.toFixed(2)),
    cyn(bold('╠══════════════════════════════════════════╣')),
    cyn(bold('║') + dim('       Press any key to continue          ') + cyn(bold('║'))),
    cyn(bold('╚══════════════════════════════════════════╝')),
  ];
  box.forEach((l, i) => { go(sr+i, sc); out(l); });
}

function showRuleSheet() {
  clr();
  const lines = [
    yel(bold('  BACCARAT — FULL RULE SHEET')), '',
    bold('  OBJECTIVE')  + '  Closest to 9 wins.',
    bold('  CARD VALUES') + '  A=1  2-9=face  10/J/Q/K=0  (mod 10)',
    '',
    bold('  PLAYER 3RD CARD'),
    '  0–5: draws   6–7: stands   8–9: Natural (no draw)',
    '',
    bold('  BANKER 3RD CARD'),
    '  0–2: always draw',
    '  3:   draw unless Player 3rd card = 8',
    '  4:   draw if Player 3rd card = 2,3,4,5,6,7',
    '  5:   draw if Player 3rd card = 4,5,6,7',
    '  6:   draw if Player 3rd card = 6,7',
    '  7:   stand',
    '  8–9: Natural, no draw',
    '  (If Player stood: Banker draws on 0–5, stands on 6–7)',
    '',
    bold('  PAYOUTS'),
    `  ${blu('Player')}: 1:1`,
    `  ${red('Banker')}: 0.95:1  (5% commission on winnings)`,
    `  ${grn('Tie')}:    8:1  (worst expected value — ~14.4% house edge)`,
    '',
    bold('  SHOE')  + '  8 decks, reshuffled when < 15 remain.',
    '',
    dim('  Press any key...'),
  ];
  lines.forEach((l, i) => { go(i+1,1); out(l); });
}

function showRoadLegend() {
  clr();
  const lines = [
    yel(bold('  ROAD LEGEND')), '',
    bold('  BIG ROAD'),
    `  ${red('●')}=Banker  ${blu('●')}=Player  ${grn('—')}=Tie`,
    '  Same side wins → fill down the column.',
    '  Side changes → start a new column.',
    '  ⊗ = a Tie occurred on that result.',
    '',
    bold('  BIG EYE BOY'),
    `  ${red('●')} Red = pattern repeating (col mirrors col 2 back)`,
    `  ${blu('●')} Blue = pattern NOT repeating`,
    '',
    bold('  SMALL ROAD'),
    '  Same idea but compares 3 columns back.',
    '',
    '  ⚠️  These tools are casino tradition.',
    '  They do NOT predict outcomes — baccarat is pure chance.',
    '  Banker bet edge: ~1.06%   Tie bet edge: ~14.4%',
    '',
    dim('  Press any key...'),
  ];
  lines.forEach((l, i) => { go(i+1,1); out(l); });
}

function showSummary() {
  clr();
  const s   = g.stats;
  const wr  = s.rounds > 0 ? (s.wins/s.rounds*100).toFixed(1)+'%' : 'N/A';
  const pnl = (s.netPnL >= 0 ? '+$' : '-$') + Math.abs(s.netPnL).toFixed(2);
  const lines = [
    '',
    yel(bold('  ╔══════════════════════════════════════╗')),
    yel(bold('  ║          SESSION SUMMARY             ║')),
    yel(bold('  ╚══════════════════════════════════════╝')),
    '',
    `  Rounds played:  ${s.rounds}`,
    `  Wins / Losses:  ${s.wins} / ${s.losses}`,
    `  Win rate:       ${wr}`,
    `  Biggest win:    $${s.bigWin.toFixed(2)}`,
    `  Biggest loss:   $${s.bigLoss.toFixed(2)}`,
    `  Net P&L:        ${pnl}`,
    `  Commission:     $${g.commission.toFixed(2)}`,
    `  Final balance:  $${g.balance.toFixed(2)}`,
    '',
    dim('  Thanks for playing Baccarat!'),
    '',
  ];
  lines.forEach((l, i) => { go(i+1,1); out(l); });
  go(lines.length+2, 1);
}

// ── Input ─────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(res => setTimeout(res, ms));

function getKey() {
  return new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const handler = data => {
      process.stdin.removeListener('data', handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(data.toString());
    };
    process.stdin.on('data', handler);
  });
}

function getLine(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, ans => { rl.close(); resolve(ans.trim()); });
  });
}

// ── Command handler (returns 'quit'|'continue'|null) ──────────────────────────
async function handleCmd(key) {
  const k = key.toLowerCase();
  if (k === '\x03' || k === 'q') return 'quit';
  if (k === 'l') { g.lessons = !g.lessons; return 'continue'; }
  if (k === 's') { draw(); showStats(); await getKey(); return 'continue'; }
  if (k === 'r') { showRoadLegend(); await getKey(); return 'continue'; }
  if (k === '?') { showRuleSheet();  await getKey(); return 'continue'; }
  return null;
}

// ── Game round ────────────────────────────────────────────────────────────────
async function playRound() {
  // ─ Get bet amount ─
  let amount;
  while (true) {
    draw();
    go(TH()-2, 1); out('\x1b[2K');
    go(TH()-1, 1); out('\x1b[2K');
    go(TH()-2, 1); out(`Enter bet $10–$500 (balance $${g.balance.toFixed(2)}): `);
    const raw = await getLine('');
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 10 && n <= 500 && n <= g.balance) { amount = n; break; }
    go(TH()-1, 1); out(red('Invalid. Enter $10–$500 within your balance.'));
    await sleep(1200);
  }

  // ─ Get bet type ─
  let betType;
  while (true) {
    draw();
    go(TH()-2, 1); out('\x1b[2K');
    go(TH()-1, 1); out('\x1b[2K');
    go(TH()-2, 1); out('Bet: [P]layer  [B]anker  [T]ie   or [L/S/R/Q/?]: ');
    const key = await getKey();
    const k   = key.toLowerCase();
    if (k === 'p') { betType = 'player'; break; }
    if (k === 'b') { betType = 'banker'; break; }
    if (k === 't') { betType = 'tie';    break; }
    const cmd = await handleCmd(key);
    if (cmd === 'quit') return false;
  }

  // ─ Setup ─
  g.bet     = amount;
  g.betType = betType;
  g.balance -= amount;
  g.outcome  = null;
  g.winner   = null;
  g.player   = [];
  g.banker   = [];

  // ─ Deal 4 cards with animation ─
  const p1 = dealCard(), b1 = dealCard(), p2 = dealCard(), b2 = dealCard();
  g.player = [p1];       draw(); await sleep(220);
  g.banker = [b1];       draw(); await sleep(220);
  g.player = [p1, p2];   draw(); await sleep(220);
  g.banker = [b1, b2];   draw(); await sleep(220);
  await sleep(300);

  const pt = handTot(g.player);
  const bt = handTot(g.banker);
  const explain = [];

  // ─ Natural check ─
  if (pt >= 8 || bt >= 8) {
    const who = (pt>=8 && bt>=8) ? 'Both hands have' : pt>=8 ? 'Player has' : 'Banker has';
    explain.push(`NATURAL ${Math.max(pt,bt)}! ${who} a Natural.`);
    explain.push('Natural 8 or 9: no 3rd cards are drawn.');
    explain.push('The higher natural wins; equal naturals tie.');
  } else {
    // ─ Player 3rd card ─
    let playerDrew = false, p3card = null;
    if (pt <= 5) {
      p3card = dealCard();
      g.player = [...g.player, p3card];
      draw(); await sleep(280);
      playerDrew = true;
      explain.push(`Player drew 3rd card (total ${pt} ≤ 5 → draw on 0–5).`);
    } else {
      explain.push(`Player stands (total ${pt} — stand on 6–7).`);
    }
    // ─ Banker 3rd card ─
    const bt2 = handTot(g.banker);
    const p3v = p3card ? cardVal(p3card.rank) : null;
    const bd  = bankerDecision(bt2, playerDrew, p3v);
    explain.push(bd.why);
    if (bd.draws) {
      await sleep(200);
      const b3 = dealCard();
      g.banker = [...g.banker, b3];
      draw(); await sleep(280);
    }
  }

  // ─ Determine winner & resolve ─
  const fp = handTot(g.player), fb = handTot(g.banker);
  const winner = fp > fb ? 'player' : fb > fp ? 'banker' : 'tie';
  resolveResult(winner, explain);
  g.lessonLines = explain;

  draw();

  // ─ Wait for next action ─
  go(TH()-2, 1); out('\x1b[2K');
  go(TH()-2, 1); out(dim('[ENTER/SPACE] next round   [L/S/R/Q/?] commands'));

  while (true) {
    const key = await getKey();
    const k   = key.toLowerCase();
    if (k === '\r' || k === '\n' || k === ' ') break;
    const cmd = await handleCmd(key);
    if (cmd === 'quit') return false;
    draw();
    go(TH()-2, 1); out('\x1b[2K');
    go(TH()-2, 1); out(dim('[ENTER/SPACE] next round   [L/S/R/Q/?] commands'));
  }

  // Reset hands for next round
  g.player  = [];
  g.banker  = [];
  g.bet     = 0;
  g.betType = null;
  g.outcome = null;
  g.winner  = null;
  return g.balance >= 10;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Check TTY
  if (!process.stdin.isTTY) {
    console.error('Error: baccarat.js must be run in an interactive terminal.');
    process.exit(1);
  }

  showTutorial();
  await getKey();

  draw();

  while (true) {
    if (g.balance < 10) {
      go(TH()-1, 1);
      out(red(bold('Insufficient balance — game over!')));
      await sleep(2000);
      break;
    }
    const cont = await playRound();
    if (!cont) break;
  }

  showSummary();
  process.exit(0);
}

process.on('SIGINT', () => { showSummary(); process.exit(0); });
process.on('uncaughtException', err => {
  clr(); go(1,1);
  console.error('Fatal error:', err);
  process.exit(1);
});

main();
