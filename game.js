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
  lastHand: null,   // context saved for quiz generation
  quizAnswered: false,
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

// ── Coach: pre-bet guidance ───────────────────────────────────────────────────
function getCoachTip() {
  const nt = g.history.filter(x => x !== 'T');
  const total = g.history.length;

  if (total === 0) {
    return {
      headline: '👋 Welcome — let\'s learn Baccarat',
      lines: [
        'Pick a side to bet on: Player, Banker, or Tie.',
        'The goal is simple: guess which hand gets closer to 9.',
        '💡 Start tip: Banker has the lowest house edge (~1.06%).',
        'That means you lose less over time betting Banker.',
      ],
      question: null,
    };
  }

  if (total === 1) {
    return {
      headline: '📖 How scoring works',
      lines: [
        'Cards 2–9 = face value. Aces = 1. 10/J/Q/K = 0.',
        'Only the last digit of the total counts.',
        'Example: 7 + 8 = 15 → score is 5.',
        'Example: 6 + 4 = 10 → score is 0.',
      ],
      question: {
        text: 'Quick check: what does a King + 6 score?',
        choices: [
          { text: '16', correct: false, fb: 'Not quite — King = 0, so 0+6 = 6.' },
          { text: '6',  correct: true,  fb: '✅ Correct! King = 0, so the score is 6.' },
          { text: '0',  correct: false, fb: 'Almost — King = 0, but the 6 still counts.' },
        ],
      },
    };
  }

  if (total === 2) {
    return {
      headline: '🃏 The 3rd card rules',
      lines: [
        'Player draws a 3rd card if their total is 0–5.',
        'Player stands (no draw) if total is 6 or 7.',
        '8 or 9 = Natural — no more cards for either side.',
        'Banker\'s rule is more complex — explained after the hand.',
      ],
      question: {
        text: 'Player has a total of 4. What happens?',
        choices: [
          { text: 'Player draws a 3rd card',   correct: true,  fb: '✅ Right! 4 is ≤ 5, so Player always draws.' },
          { text: 'Player stands',              correct: false, fb: 'Nope — Player stands on 6–7 only. 4 means draw.' },
          { text: 'It depends on Banker\'s total', correct: false, fb: 'Player\'s draw rule is fixed — 0–5 draws, 6–7 stands. Banker\'s total doesn\'t affect it.' },
        ],
      },
    };
  }

  if (total === 3) {
    return {
      headline: '🏦 Why Banker pays less (5% commission)',
      lines: [
        'Banker wins slightly more often than Player (~50.7% vs ~49.3%).',
        'To keep the casino profitable, Banker pays 0.95:1, not 1:1.',
        'That 5% commission is tracked and collected at the table.',
        'Even with commission, Banker is still the best math bet.',
      ],
      question: {
        text: 'You bet $100 on Banker and win. How much profit do you get?',
        choices: [
          { text: '$100', correct: false, fb: 'That would be 1:1. Banker pays 0.95:1 due to the 5% commission.' },
          { text: '$95',  correct: true,  fb: '✅ Correct! 5% commission = $5, so profit = $95.' },
          { text: '$80',  correct: false, fb: 'Not quite — commission is 5%, not 20%. Profit = $95 on a $100 bet.' },
        ],
      },
    };
  }

  // Pattern-based coaching after 4+ hands
  let bStr = 0, pStr = 0;
  for (let i = nt.length-1; i >= 0 && nt[i]==='B'; i--) bStr++;
  for (let i = nt.length-1; i >= 0 && nt[i]==='P'; i--) pStr++;
  let isChopping = nt.length >= 4;
  for (let i = 1; i < Math.min(nt.length,6); i++)
    if (nt[nt.length-i] === nt[nt.length-i-1]) { isChopping = false; break; }

  if (bStr >= 4) {
    return {
      headline: `🔴 Banker streak: ${bStr} in a row`,
      lines: [
        `Banker has won ${bStr} hands straight — that's a notable streak.`,
        'Casino players call this "riding the shoe" and keep betting Banker.',
        'The roads (right panel) are filling up with red dots.',
        '⚠️ Math reality: each hand is independent. The streak doesn\'t predict the next result.',
      ],
      question: {
        text: `Banker has won ${bStr} in a row. What does the math say about the next hand?`,
        choices: [
          { text: 'Banker is likely to win again',  correct: false, fb: 'This feels right but isn\'t — each hand is independent. Streaks don\'t predict future hands.' },
          { text: 'Player is "due" to win soon',    correct: false, fb: 'This is the Gambler\'s Fallacy. Past results don\'t change future probabilities.' },
          { text: 'Each hand has the same odds, streak or not', correct: true, fb: '✅ Exactly right. Banker still wins ~50.7% of non-tie hands, regardless of what came before.' },
        ],
      },
    };
  }

  if (pStr >= 4) {
    return {
      headline: `🔵 Player streak: ${pStr} in a row`,
      lines: [
        `Player has won ${pStr} straight — casino players notice this.`,
        'Some players chase the streak; others bet against it.',
        '⚠️ Math reality: Player has ~49.3% win rate on non-tie hands. Odds don\'t change.',
        'Banker still has better odds than Player even during a Player streak.',
      ],
      question: {
        text: 'During a Player streak, what\'s the smartest bet?',
        choices: [
          { text: 'Tie — it\'s overdue',    correct: false, fb: 'Tie has a ~14.4% house edge. It\'s the worst bet at the table, streak or not.' },
          { text: 'Player — ride the streak', correct: false, fb: 'Mathematically, Banker is still slightly better. Streaks don\'t change the house edge.' },
          { text: 'Banker — best house edge', correct: true,  fb: '✅ Correct. Banker has ~1.06% house edge vs Player\'s ~1.24%. Best bet regardless of streaks.' },
        ],
      },
    };
  }

  if (isChopping) {
    return {
      headline: '🔀 Chopping pattern detected',
      lines: [
        'The results are alternating: P-B-P-B or B-P-B-P.',
        'Casino players call this "chopping" and bet the switch.',
        'On a chop, you\'d bet the opposite of last result.',
        '⚠️ Math reality: it\'s still random. Chops break without warning.',
      ],
      question: {
        text: 'What do casino players call an alternating P-B-P-B pattern?',
        choices: [
          { text: 'A dragon tail',   correct: false, fb: 'Dragon tail is a long single-side streak. This alternating pattern is called "chopping."' },
          { text: 'Chopping',        correct: true,  fb: '✅ Right! Alternating results are called "chopping the shoe" — a classic baccarat pattern.' },
          { text: 'A natural run',   correct: false, fb: 'Natural refers to 8 or 9 starting totals. Alternating results are called "chopping."' },
        ],
      },
    };
  }

  // Road explanation coaching
  if (total === 5) {
    return {
      headline: '📊 Reading the Big Road',
      lines: [
        'The Big Road (right panel) tracks streaks visually.',
        'Same side winning → dots go DOWN in the same column.',
        'Side switches → new column starts.',
        'Red dots = Banker wins. Blue dots = Player wins.',
      ],
      question: {
        text: 'In the Big Road, a new column starts when:',
        choices: [
          { text: 'A Tie happens',            correct: false, fb: 'Ties don\'t start a new column — they\'re marked with a line on the current dot.' },
          { text: 'The other side wins',      correct: true,  fb: '✅ Correct! Same side = go down. Different side = new column to the right.' },
          { text: 'More than 3 in a row',     correct: false, fb: 'A new column happens on ANY switch, even after just 1 win.' },
        ],
      },
    };
  }

  if (total === 8) {
    return {
      headline: '👁 Big Eye Boy & Small Road',
      lines: [
        'These two smaller roads compare current column to older ones.',
        'Red dot = pattern is REPEATING (same structure as before).',
        'Blue dot = pattern is BREAKING (structure changed).',
        'Casinos show these to make patterns feel predictable — they\'re not.',
      ],
      question: {
        text: 'A red dot in Big Eye Boy means:',
        choices: [
          { text: 'Banker won the last hand',              correct: false, fb: 'Red in Big Eye Boy isn\'t about who won — it\'s about whether the column structure is repeating.' },
          { text: 'The column pattern is repeating',       correct: true,  fb: '✅ Right! Red = repeating structure. Blue = new/different structure. It compares 2 columns back.' },
          { text: 'A streak of 3 or more is happening',   correct: false, fb: 'Big Eye Boy isn\'t a streak counter — it compares column lengths to detect repetition.' },
        ],
      },
    };
  }

  // Default tip for later hands
  const lastFive = nt.slice(-5).join('');
  const bCount = (lastFive.match(/B/g)||[]).length;
  const pCount = (lastFive.match(/P/g)||[]).length;
  return {
    headline: '🧮 Last 5 non-tie hands',
    lines: [
      `Banker: ${bCount} wins   Player: ${pCount} wins`,
      `Full history (last 10): ${g.history.join(' ')}`,
      'No pattern guarantees anything — but knowing what to look for helps.',
      '💡 Reminder: Banker has the lowest house edge. Best long-term bet.',
    ],
    question: {
      text: 'Which bet has the lowest house edge in Baccarat?',
      choices: [
        { text: 'Tie (~14.4% edge)',     correct: false, fb: 'Tie is the worst bet at the table. The 8:1 payout isn\'t worth the terrible odds.' },
        { text: 'Player (~1.24% edge)',  correct: false, fb: 'Player is decent but Banker is slightly better due to the win rate, even with the commission.' },
        { text: 'Banker (~1.06% edge)',  correct: true,  fb: '✅ Correct. Banker is always the best mathematical bet. Bet it every time if you want to minimize losses.' },
      ],
    },
  };
}

// ── Quiz generation: post-hand ────────────────────────────────────────────────
function generateHandQuiz(ctx) {
  // ctx = { wasNatural, playerDrew, playerTotal, bankerTotal, bankerDrew, p3val, bankerDecisionWhy, winner }

  if (ctx.wasNatural) {
    const who = ctx.playerTotal >= 8 && ctx.bankerTotal >= 8 ? 'Both hands had'
      : ctx.playerTotal >= 8 ? 'Player had' : 'Banker had';
    const score = Math.max(ctx.playerTotal, ctx.bankerTotal);
    return {
      text: `No 3rd cards were dealt this hand. Why?`,
      choices: [
        { text: `${who} a Natural (${score}) — game ends immediately`,
          correct: true,
          fb: `✅ Right! An 8 or 9 on the first two cards is a Natural. No more cards are drawn — higher Natural wins, equal = Tie.` },
        { text: 'Banker chose to stand to protect the lead',
          correct: false,
          fb: `Baccarat has no choices — everything is automatic. A Natural (8 or 9) ends the hand with no draws.` },
        { text: 'The shoe ran out of cards',
          correct: false,
          fb: `The shoe has 8 decks (~416 cards) and reshuffles at 15. ${who} a Natural (${score}) — that's why no 3rd card.` },
      ],
    };
  }

  if (ctx.playerDrew) {
    return {
      text: `Player drew a 3rd card with a starting total of ${ctx.playerTotal}. Why?`,
      choices: [
        { text: `${ctx.playerTotal} is 0–5 — Player always draws on 0–5`,
          correct: true,
          fb: `✅ Correct! Player's rule is simple: total 0–5 → draw, 6–7 → stand, 8–9 → Natural (no draw).` },
        { text: `Player drew because Banker had a low score`,
          correct: false,
          fb: `Player's draw rule is independent of Banker's score. Total 0–5 = always draw. Total 6–7 = always stand.` },
        { text: `${ctx.playerTotal} is above 5 — high totals draw`,
          correct: false,
          fb: `It's actually the opposite — low totals draw. 0–5 draws, 6–7 stands. ${ctx.playerTotal} is low, so Player drew.` },
      ],
    };
  }

  if (!ctx.playerDrew && !ctx.wasNatural) {
    return {
      text: `Player stood (no 3rd card) with a total of ${ctx.playerTotal}. Why?`,
      choices: [
        { text: `${ctx.playerTotal} is 6 or 7 — Player stands on 6–7`,
          correct: true,
          fb: `✅ Right! Player stands on 6 or 7. Only draws on 0–5. 8–9 is a Natural (different rule).` },
        { text: `Player chose to protect a strong hand`,
          correct: false,
          fb: `There are no choices in Baccarat — it's all automatic. ${ctx.playerTotal} falls in the 6–7 stand range.` },
        { text: `Banker's total was too high to risk a draw`,
          correct: false,
          fb: `Player's rule doesn't involve Banker's total. ${ctx.playerTotal} = 6 or 7 → Player stands, period.` },
      ],
    };
  }

  // Banker draw question (fallback)
  if (ctx.bankerDrew) {
    return {
      text: `Banker drew a 3rd card. Banker's total was ${ctx.bankerTotal}. What triggered the draw?`,
      choices: [
        { text: `Banker totals 0–2 always draw`,
          correct: ctx.bankerTotal <= 2,
          fb: ctx.bankerTotal <= 2
            ? `✅ Yes! Banker 0–2 always draws, regardless of Player's card.`
            : `Banker 0–2 always draw — but here Banker had ${ctx.bankerTotal}. The draw was based on Player's 3rd card value.` },
        { text: `Banker had ${ctx.bankerTotal} and Player's 3rd card (${ctx.p3val}) triggered a draw`,
          correct: ctx.bankerTotal >= 3,
          fb: ctx.bankerTotal >= 3
            ? `✅ Correct! At ${ctx.bankerTotal}, Banker's draw depends on Player's 3rd card value. ${ctx.bankerDecisionWhy}`
            : `Not quite — at 0–2 Banker always draws without looking at Player's card.` },
        { text: `Banker always draws when Player draws`,
          correct: false,
          fb: `Not true — Banker's draw depends on Banker's own total and sometimes Player's 3rd card. It's a full table of rules.` },
      ],
    };
  }

  return null;
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

// ── Lesson / Coach rendering ──────────────────────────────────────────────────
function renderCoachTip() {
  const tip = getCoachTip();
  const div = $('lesson-dynamic');
  div.innerHTML = '';

  const headline = el('p', 'coach-headline', tip.headline);
  div.appendChild(headline);

  for (const line of tip.lines) {
    div.appendChild(el('p', 'coach-line', line));
  }

  if (tip.question) {
    renderQuiz(tip.question, div);
  }
}

function renderPostHandLesson(explain, quiz) {
  const div = $('lesson-dynamic');
  div.innerHTML = '';

  // What happened summary
  const title = el('p', 'coach-headline', '📋 What just happened');
  div.appendChild(title);
  for (const { cls, text } of explain) {
    div.appendChild(el('p', cls || 'coach-line', text));
  }

  if (quiz) {
    const sep = el('hr', 'quiz-sep');
    div.appendChild(sep);
    renderQuiz(quiz, div);
  }
}

function renderQuiz(quiz, container) {
  g.quizAnswered = false;
  const wrap = el('div', 'quiz-wrap');
  const q = el('p', 'quiz-question', '🧠 ' + quiz.text);
  wrap.appendChild(q);

  const choices = el('div', 'quiz-choices');
  for (const choice of quiz.choices) {
    const btn = el('button', 'quiz-btn', choice.text);
    btn.addEventListener('click', () => {
      if (g.quizAnswered) return;
      g.quizAnswered = true;
      // Disable all
      choices.querySelectorAll('.quiz-btn').forEach(b => b.disabled = true);
      btn.classList.add(choice.correct ? 'quiz-correct' : 'quiz-wrong');
      // Find correct and mark it
      quiz.choices.forEach((c, i) => {
        if (c.correct) choices.querySelectorAll('.quiz-btn')[i].classList.add('quiz-correct');
      });
      // Show feedback
      const fb = el('p', 'quiz-feedback ' + (choice.correct ? 'fb-correct' : 'fb-wrong'), choice.fb);
      wrap.appendChild(fb);
    });
    choices.appendChild(btn);
  }
  wrap.appendChild(choices);
  container.appendChild(wrap);
}

function switchToLessons() {
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="lessons"]').classList.add('active');
  document.querySelectorAll('.ptab-content').forEach(c => c.classList.add('hidden'));
  $('tab-lessons').classList.remove('hidden');
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

  // Context for quiz
  const ctx = {
    wasNatural: false,
    playerDrew: false,
    playerTotal: pt,
    bankerTotal: bt,
    bankerDrew: false,
    p3val: null,
    bankerDecisionWhy: '',
    winner: null,
  };

  if (pt >= 8 || bt >= 8) {
    ctx.wasNatural = true;
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
      ctx.playerDrew = true;
      ctx.p3val = cardVal(p3card.rank);
      explain.push({ cls: 'le-draw', text: `Player drew 3rd card (total ${pt} ≤ 5 → draw on 0–5).` });
    } else {
      explain.push({ cls: 'le-stand', text: `Player stands (total ${pt} — stand on 6–7).` });
    }
    const bt2 = handTot(g.banker);
    const p3v = p3card ? cardVal(p3card.rank) : null;
    const bd  = bankerDecision(bt2, playerDrew, p3v);
    ctx.bankerDecisionWhy = bd.why;
    explain.push({ cls: bd.draws ? 'le-draw' : 'le-stand', text: bd.why });
    if (bd.draws) {
      ctx.bankerDrew = true;
      await sleep(200);
      const b3 = dealCard();
      g.banker = [...g.banker, b3];
      renderCard(b3, bCards, 0); updateScores(); await sleep(280);
    }
  }

  const fp = handTot(g.player), fb = handTot(g.banker);
  const winner = fp > fb ? 'player' : fb > fp ? 'banker' : 'tie';
  ctx.winner = winner;
  resolveResult(winner, explain);
  updateBalance();
  updateHistory();
  updateRoads();
  showResult(g.outcome);

  // Generate quiz and show in Lessons
  const quiz = generateHandQuiz(ctx);
  renderPostHandLesson(explain, quiz);
  switchToLessons();

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

  // Show coach tip for next bet
  renderCoachTip();
  switchToLessons();

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
renderCoachTip();
switchToLessons();
