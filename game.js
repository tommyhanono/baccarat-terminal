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

// ── Pattern analysis (shared by insight + coach) ─────────────────────────────
function analyzePatterns() {
  const nt = g.history.filter(x => x !== 'T');
  const cols = g.bigRoad;

  // Current streak
  let bStr = 0, pStr = 0;
  for (let i = nt.length-1; i >= 0 && nt[i]==='B'; i--) bStr++;
  for (let i = nt.length-1; i >= 0 && nt[i]==='P'; i--) pStr++;
  const streak = bStr >= 2 ? { side:'B', len:bStr } : pStr >= 2 ? { side:'P', len:pStr } : null;

  // Chopping: strict alternation last 4+
  let isChopping = nt.length >= 4;
  for (let i = 1; i < Math.min(nt.length,6); i++)
    if (nt[nt.length-i] === nt[nt.length-i-1]) { isChopping = false; break; }

  // Double road: pairs switching (BB-PP-BB or PP-BB-PP)
  let isDouble = false;
  if (cols.length >= 3) {
    const last3 = cols.slice(-3).map(c => c.length);
    isDouble = last3.every(l => l === 2);
  }

  // Big Eye Boy consensus (last 3 dots)
  const beb = g.bigEyeBoy;
  let bebRed = 0, bebBlue = 0;
  for (let i = beb.length-1; i >= Math.max(0, beb.length-4); i--) {
    if (beb[i] === 'R') bebRed++; else bebBlue++;
  }
  const bebSignal = bebRed >= 3 ? 'repeating' : bebBlue >= 3 ? 'breaking' : 'mixed';

  // Small Road consensus (last 3 dots)
  const sr = g.smallRoad;
  let srRed = 0, srBlue = 0;
  for (let i = sr.length-1; i >= Math.max(0, sr.length-4); i--) {
    if (sr[i] === 'R') srRed++; else srBlue++;
  }
  const srSignal = srRed >= 3 ? 'repeating' : srBlue >= 3 ? 'breaking' : 'mixed';

  // Column structure: are columns roughly equal length (regularity)?
  const colLens = cols.slice(-6).map(c => c.length);
  const avgLen = colLens.reduce((a,b) => a+b, 0) / (colLens.length || 1);
  const isRegular = colLens.length >= 4 && colLens.every(l => Math.abs(l - avgLen) <= 1);

  // Pattern name
  let patternName = null;
  if (streak && streak.len >= 5) patternName = 'dragon';
  else if (streak && streak.len >= 3) patternName = 'streak';
  else if (isChopping) patternName = 'ping-pong';
  else if (isDouble) patternName = 'double-road';
  else if (isRegular && colLens.length >= 4) patternName = 'regular';

  // Road consensus: what do derived roads suggest for NEXT bet?
  // If pattern is repeating → bet to continue current side
  // If pattern is breaking → bet for switch
  let roadsBet = null;
  const currentSide = nt.at(-1); // last non-tie result
  if (bebSignal === 'repeating' && srSignal === 'repeating') {
    roadsBet = { bet: currentSide, strength: 'strong', reason: 'Big Eye Boy + Small Road both show RED — pattern repeating' };
  } else if (bebSignal === 'breaking' && srSignal === 'breaking') {
    roadsBet = { bet: currentSide === 'B' ? 'P' : 'B', strength: 'strong', reason: 'Big Eye Boy + Small Road both show BLUE — pattern breaking' };
  } else if (bebSignal === 'repeating') {
    roadsBet = { bet: currentSide, strength: 'moderate', reason: 'Big Eye Boy shows RED (repeating), Small Road is mixed' };
  } else if (bebSignal === 'breaking') {
    roadsBet = { bet: currentSide === 'B' ? 'P' : 'B', strength: 'moderate', reason: 'Big Eye Boy shows BLUE (breaking), Small Road is mixed' };
  } else if (srSignal === 'repeating') {
    roadsBet = { bet: currentSide, strength: 'moderate', reason: 'Small Road shows RED (repeating), Big Eye Boy is mixed' };
  } else if (srSignal === 'breaking') {
    roadsBet = { bet: currentSide === 'B' ? 'P' : 'B', strength: 'moderate', reason: 'Small Road shows BLUE (breaking), Big Eye Boy is mixed' };
  }

  return { streak, isChopping, isDouble, isRegular, patternName, bebSignal, srSignal, roadsBet, currentSide, nt, cols, bebRed, bebBlue, srRed, srBlue };
}

function updateInsight() {
  const nt = g.history.filter(x => x !== 'T');
  if (!nt.length) { g.insight = ''; g.prediction = ''; return; }
  const p = analyzePatterns();

  if (p.streak && p.streak.len >= 5) {
    g.insight = `🐉 Dragon tail — ${p.streak.side==='B'?'Banker':'Player'} ${p.streak.len} in a row`;
    g.prediction = `Roads lean ${p.streak.side==='B'?'Banker':'Player'} — superstition, not math`;
  } else if (p.streak && p.streak.len >= 3) {
    g.insight = `${p.streak.side==='B'?'🔴':'🔵'} ${p.streak.side==='B'?'Banker':'Player'} streak: ${p.streak.len} in a row`;
    g.prediction = `Roads lean ${p.streak.side==='B'?'Banker':'Player'} — superstition, not math`;
  } else if (p.isChopping) {
    g.insight = `🔀 Ping-pong — alternating P/B pattern`;
    g.prediction = `Roads lean ${p.currentSide==='B'?'Player':'Banker'} — superstition, not math`;
  } else if (p.isDouble) {
    g.insight = `✌️ Double road — pairs switching sides`;
    g.prediction = `Roads lean ${p.currentSide} continues — superstition, not math`;
  } else if (p.roadsBet) {
    g.insight = `${p.roadsBet.strength === 'strong' ? '📊' : '〰️'} Roads signal: ${p.roadsBet.reason}`;
    g.prediction = `Roads lean ${p.roadsBet.bet==='B'?'Banker':'Player'} — superstition, not math`;
  } else {
    g.insight = `No strong pattern detected`;
    g.prediction = `Roads lean Unclear — superstition, not math`;
  }
}

// ── Coach: pre-bet guidance ───────────────────────────────────────────────────
function getCoachTip() {
  const total = g.history.length;

  // ── First 3 hands: learn the basics ──────────────────────────────────────
  if (total === 0) {
    return {
      headline: '👋 Welcome — let\'s learn Baccarat',
      lines: [
        'Pick a side to bet on: Player, Banker, or Tie.',
        'The goal: guess which hand gets closer to 9.',
        '💡 Banker has the lowest house edge (~1.06%). Best bet mathematically.',
      ],
      question: null,
    };
  }
  if (total === 1) {
    return {
      headline: '📖 Scoring: only the last digit counts',
      lines: [
        'Cards 2–9 = face value. Aces = 1. 10/J/Q/K = 0.',
        '7 + 8 = 15 → score is 5.   6 + 4 = 10 → score is 0.',
      ],
      question: {
        text: 'King + 6 = ?',
        choices: [
          { text: '16', correct: false, fb: 'King = 0, not 10. So 0 + 6 = 6.' },
          { text: '6',  correct: true,  fb: '✅ King = 0, so the score is 6.' },
          { text: '0',  correct: false, fb: 'King = 0, but the 6 still counts. Score = 6.' },
        ],
      },
    };
  }
  if (total === 2) {
    return {
      headline: '🏦 Why Banker pays 0.95:1 (5% commission)',
      lines: [
        'Banker wins ~50.7% of non-tie hands vs Player ~49.3%.',
        'To compensate, Banker pays 0.95:1 — $5 commission per $100 won.',
        'Even with commission, Banker is still the best math bet.',
      ],
      question: {
        text: 'You bet $100 on Banker and win. Profit = ?',
        choices: [
          { text: '$100', correct: false, fb: 'That\'s 1:1. Banker pays 0.95:1 — 5% commission applies.' },
          { text: '$95',  correct: true,  fb: '✅ $100 × 0.95 = $95 profit. Commission = $5, tracked separately.' },
          { text: '$80',  correct: false, fb: 'Commission is 5%, not 20%. $100 bet → $95 profit.' },
        ],
      },
    };
  }
  if (total === 3) {
    return {
      headline: '📊 Reading the Big Road — the main scoreboard',
      lines: [
        'Big Road (top right) tracks WHO wins each hand visually.',
        '🔴 Red dot = Banker win.  🔵 Blue dot = Player win.',
        'Same side wins again → dot goes DOWN in same column.',
        'Other side wins → new column starts to the RIGHT.',
        'Example: B-B-B-P = 3 red dots in column 1, then blue dot in column 2.',
      ],
      question: {
        text: 'Big Road: Banker wins 3 in a row, then Player wins. How does that look?',
        choices: [
          { text: '3 red dots in one column, then blue dot starts new column', correct: true,  fb: '✅ Exactly. Streak = go down. Switch = new column to the right.' },
          { text: '3 red dots, then a blue dot added to the same column',      correct: false, fb: 'No — when the side changes, a new column starts. Same side = same column.' },
          { text: 'Each win gets its own column',                               correct: false, fb: 'Only the first win in a streak starts a new column. Continuing wins stack downward.' },
        ],
      },
    };
  }
  if (total === 4) {
    return {
      headline: '🐉 Pattern: The Dragon Tail',
      lines: [
        'A Dragon Tail = one side winning 5+ hands in a row.',
        'In the Big Road it looks like a long column going straight down.',
        'Casino strategy: "ride the dragon" — keep betting the winning side.',
        'Reality check: each hand is still ~50/50. The streak doesn\'t guarantee continuation.',
        'But casino players bet with streaks because it feels like momentum.',
      ],
      question: {
        text: 'Banker has won 6 in a row — a Dragon Tail. What do most casino players do?',
        choices: [
          { text: 'Bet Player — it\'s "due" to win', correct: false, fb: 'This is the Gambler\'s Fallacy. Past results don\'t change future odds. Player isn\'t "due."' },
          { text: 'Bet Banker — ride the dragon',    correct: true,  fb: '✅ Casino players "ride the shoe." They bet the streak continues, knowing it\'s not guaranteed.' },
          { text: 'Bet Tie — the streak must end',   correct: false, fb: 'Tie has 14.4% house edge. Never the right bet, especially based on streak prediction.' },
        ],
      },
    };
  }
  if (total === 5) {
    return {
      headline: '🔀 Pattern: Ping-Pong (Chopping)',
      lines: [
        'Ping-Pong = results alternating: B-P-B-P-B-P.',
        'In the Big Road: each column is only 1 dot tall, switching every hand.',
        'Casino strategy: "bet the chop" — always bet opposite of last result.',
        'If last was Banker → bet Player. If last was Player → bet Banker.',
        'When a chop breaks (same side twice), chop bettors adjust.',
      ],
      question: {
        text: 'You\'re in a ping-pong pattern. Last hand was Banker. What do chop players bet?',
        choices: [
          { text: 'Banker again',                   correct: false, fb: 'Chop strategy bets the SWITCH. Last was Banker → bet Player to continue the alternation.' },
          { text: 'Player — bet the switch',        correct: true,  fb: '✅ Correct. Chop strategy always bets the opposite of the last result, expecting alternation to continue.' },
          { text: 'Tie — neither side has an edge', correct: false, fb: 'Tie has a 14.4% house edge — always the wrong bet. Chop players bet Player here.' },
        ],
      },
    };
  }
  if (total === 6) {
    return {
      headline: '✌️ Pattern: The Double Road',
      lines: [
        'Double Road = results come in pairs: BB-PP-BB-PP.',
        'Big Road looks like columns of exactly 2 dots, alternating red/blue.',
        'Casino strategy: within a pair, bet same side. After 2, bet switch.',
        'Example: saw BB → bet B (complete the pair). After BB → bet P for next pair.',
        'Double road is one of the most common patterns casino players look for.',
      ],
      question: {
        text: 'Double road pattern: you\'ve seen BB-PP-BB. What do double-road players bet next?',
        choices: [
          { text: 'Banker — start a new BB pair',   correct: false, fb: 'The last pair was BB, so the double road would predict a PP pair next. Bet Player.' },
          { text: 'Player — expect a PP pair next', correct: true,  fb: '✅ Right! BB-PP-BB pattern → next pair should be PP. Bet Player to start the new pair.' },
          { text: 'Banker — ride the last streak',  correct: false, fb: 'The double road looks at pairs, not streaks. BB ended → expect PP → bet Player.' },
        ],
      },
    };
  }
  if (total === 7) {
    return {
      headline: '👁 Big Eye Boy — is the pattern repeating?',
      lines: [
        'Big Eye Boy (middle right) doesn\'t track WHO wins.',
        'It asks: is the BIG ROAD column structure repeating?',
        '🔴 Red dot = yes, structure matches 2 columns ago → pattern continuing.',
        '🔵 Blue dot = no, structure changed → pattern breaking.',
        'If Big Eye Boy is mostly red → bet to CONTINUE current pattern.',
        'If Big Eye Boy turns blue → expect the pattern to BREAK.',
      ],
      question: {
        text: 'Big Eye Boy just showed 4 red dots in a row. What does that mean?',
        choices: [
          { text: 'Banker won 4 times',                        correct: false, fb: 'Big Eye Boy isn\'t about who won — it compares column lengths. Red = structure repeating.' },
          { text: 'The road pattern is repeating — bet to continue', correct: true, fb: '✅ Right! 4 reds = strong repeating signal. Casino players bet to continue the current pattern.' },
          { text: 'The shoe is about to reshuffle',            correct: false, fb: 'Reshuffle happens at <15 cards, unrelated to road dots. Red = repeating column structure.' },
        ],
      },
    };
  }
  if (total === 8) {
    return {
      headline: '📉 Small Road — one column further back',
      lines: [
        'Small Road does the same as Big Eye Boy, but compares 3 columns back.',
        '🔴 Red = current structure matches 3 columns ago.',
        '🔵 Blue = structure doesn\'t match → different pattern than before.',
        'When Big Eye Boy AND Small Road are both red → strong repeating signal.',
        'When both are blue → strong break signal. Mixed → no clear read.',
      ],
      question: {
        text: 'Big Eye Boy is red, Small Road is also red. Combined signal?',
        choices: [
          { text: 'Unclear — they cancel each other out',             correct: false, fb: 'They don\'t cancel — they agree! Both red means the pattern is repeating strongly.' },
          { text: 'Strong repeating signal — bet to continue pattern', correct: true, fb: '✅ Both roads red = the strongest repeating signal in baccarat road reading.' },
          { text: 'Bet Tie — two reds means neither side dominates',   correct: false, fb: 'Red has nothing to do with ties. It means the column structure is repeating. Both red = continue.' },
        ],
      },
    };
  }

  // ── After 9+ hands: live pattern coaching ────────────────────────────────
  const p = analyzePatterns();
  const nt = p.nt;
  return buildLivePatternCoach(p, nt);
}

function buildLivePatternCoach(p, nt) {
  const sideName = s => s === 'B' ? 'Banker' : s === 'P' ? 'Player' : '?';
  const lines = [];
  let headline = '📊 Live road reading';
  let question = null;

  // ── Big Road summary ────────────────────────────────────────────────────
  const cols = p.cols;
  const currentCol = cols.at(-1) || [];
  const colDepth = currentCol.length;
  const numCols = cols.length;
  lines.push(`Big Road: ${numCols} column${numCols!==1?'s':''}, current column ${colDepth} deep (${sideName(p.currentSide)})`);

  // ── Named pattern ───────────────────────────────────────────────────────
  if (p.patternName === 'dragon') {
    headline = `🐉 Dragon Tail — ${sideName(p.streak.side)} ${p.streak.len} in a row`;
    lines.push(`One column is ${p.streak.len} dots deep — that's a dragon tail.`);
    lines.push(`Casino strategy: ride it. Keep betting ${sideName(p.streak.side)}.`);
    lines.push(`⚠️ Each hand is still ~50/50. Dragons end without warning.`);
  } else if (p.patternName === 'streak') {
    headline = `${p.streak.side==='B'?'🔴':'🔵'} Streak — ${sideName(p.streak.side)} ${p.streak.len} in a row`;
    lines.push(`Current column has ${p.streak.len} dots. Casino players ride streaks.`);
    lines.push(`Strategy: bet ${sideName(p.streak.side)} until it breaks.`);
  } else if (p.patternName === 'ping-pong') {
    headline = '🔀 Ping-Pong (Chopping)';
    lines.push('Results are alternating — columns are 1 dot wide.');
    lines.push(`Last result: ${sideName(p.currentSide)}. Chop strategy bets: ${sideName(p.currentSide==='B'?'P':'B')}.`);
  } else if (p.patternName === 'double-road') {
    headline = '✌️ Double Road — pairs switching';
    lines.push('Columns are 2 dots deep and alternating sides.');
    lines.push(`Current pair is ${sideName(p.currentSide)}. If it completes → next pair = ${sideName(p.currentSide==='B'?'P':'B')}.`);
  } else {
    lines.push('No dominant pattern yet — shoe is irregular.');
  }

  // ── Big Eye Boy reading ─────────────────────────────────────────────────
  if (g.bigEyeBoy.length >= 3) {
    const bebLast = g.bigEyeBoy.slice(-4);
    const bebDesc = bebLast.map(x => x==='R'?'🔴':'🔵').join(' ');
    if (p.bebSignal === 'repeating') {
      lines.push(`Big Eye Boy: ${bebDesc} → mostly RED = pattern repeating. Bet to continue.`);
    } else if (p.bebSignal === 'breaking') {
      lines.push(`Big Eye Boy: ${bebDesc} → mostly BLUE = pattern breaking. Bet the switch.`);
    } else {
      lines.push(`Big Eye Boy: ${bebDesc} → mixed signal, no clear read.`);
    }
  }

  // ── Small Road reading ──────────────────────────────────────────────────
  if (g.smallRoad.length >= 3) {
    const srLast = g.smallRoad.slice(-4);
    const srDesc = srLast.map(x => x==='R'?'🔴':'🔵').join(' ');
    if (p.srSignal === 'repeating') {
      lines.push(`Small Road: ${srDesc} → mostly RED = confirms continuation.`);
    } else if (p.srSignal === 'breaking') {
      lines.push(`Small Road: ${srDesc} → mostly BLUE = confirms break.`);
    } else {
      lines.push(`Small Road: ${srDesc} → mixed.`);
    }
  }

  // ── Roads consensus bet ─────────────────────────────────────────────────
  if (p.roadsBet) {
    const betName = sideName(p.roadsBet.bet);
    const strength = p.roadsBet.strength === 'strong' ? 'Strong' : 'Moderate';
    lines.push(`─`);
    lines.push(`${strength} roads signal → ${betName}`);
    lines.push(`⚠️ Roads are pattern-based, not math. Banker still has best odds.`);

    question = {
      text: `Roads signal ${betName}. What's the mathematically safest bet?`,
      choices: [
        { text: `${betName} — follow the roads`,     correct: p.roadsBet.bet === 'B', fb: p.roadsBet.bet === 'B' ? '✅ Roads AND math agree — Banker is best.' : `Roads say ${betName}, but math always says Banker (~1.06% edge). Roads are superstition.` },
        { text: `Banker — best edge regardless`,     correct: p.roadsBet.bet !== 'B', fb: p.roadsBet.bet !== 'B' ? '✅ Even when roads say Player, Banker has better odds mathematically.' : '✅ Roads and math agree here — Banker is best bet.' },
        { text: 'Tie — both roads are unreliable',  correct: false, fb: 'Tie has a 14.4% house edge. Never the right choice.' },
      ],
    };
  } else {
    // general quiz to keep engagement
    const lastFive = nt.slice(-5).join('-');
    lines.push(`─`);
    lines.push(`Last 5: ${lastFive || '—'}`);
    lines.push(`💡 Banker: ~1.06% edge  |  Player: ~1.24%  |  Tie: ~14.4%`);

    question = {
      text: 'No clear road signal. Which bet minimizes your losses long-term?',
      choices: [
        { text: 'Banker — lowest house edge',  correct: true,  fb: '✅ Always Banker when in doubt. ~1.06% is the best edge you can get in Baccarat.' },
        { text: 'Player — no commission',      correct: false, fb: 'Player\'s 1.24% edge is worse than Banker\'s 1.06%, even accounting for the commission.' },
        { text: 'Tie — 8:1 payout is worth it', correct: false, fb: 'Tie pays 8:1 but wins so rarely that the house edge is 14.4% — by far the worst bet.' },
      ],
    };
  }

  return { headline, lines, question };
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
  div.appendChild(el('p', 'coach-headline', '📋 What just happened'));
  for (const { cls, text } of explain) {
    div.appendChild(el('p', cls || 'coach-line', text));
  }

  // Road update (if enough history)
  if (g.history.length >= 2) {
    div.appendChild(el('hr', 'quiz-sep'));
    div.appendChild(el('p', 'coach-headline', '📊 Roads updated'));
    const p = analyzePatterns();
    const sideName = s => s === 'B' ? 'Banker' : 'Player';

    // Big Road
    const cols = p.cols;
    const colDepth = (cols.at(-1) || []).length;
    if (p.patternName === 'dragon') {
      div.appendChild(el('p', 'coach-line le-natural', `🐉 Dragon Tail! ${sideName(p.streak.side)} streak: ${p.streak.len} in a row. Big Road column is ${colDepth} deep.`));
    } else if (p.patternName === 'streak') {
      div.appendChild(el('p', 'coach-line le-draw', `Streak: ${sideName(p.streak.side)} ${p.streak.len} straight. Column depth: ${colDepth}.`));
    } else if (p.patternName === 'ping-pong') {
      div.appendChild(el('p', 'coach-line le-draw', `🔀 Ping-Pong pattern holding. Each column is 1 dot wide — sides alternating.`));
    } else if (p.patternName === 'double-road') {
      div.appendChild(el('p', 'coach-line le-draw', `✌️ Double Road forming — columns are 2 deep, alternating sides.`));
    } else {
      div.appendChild(el('p', 'coach-line le-stand', `Big Road: ${cols.length} columns. No dominant pattern yet.`));
    }

    // Big Eye Boy
    if (g.bigEyeBoy.length >= 2) {
      const last = g.bigEyeBoy.at(-1);
      const desc = last === 'R'
        ? '🔴 Red — column structure matches 2 back → pattern continuing'
        : '🔵 Blue — column structure changed → pattern breaking';
      div.appendChild(el('p', 'coach-line', `Big Eye Boy: ${desc}`));
    }

    // Small Road
    if (g.smallRoad.length >= 2) {
      const last = g.smallRoad.at(-1);
      const desc = last === 'R'
        ? '🔴 Red — matches 3 columns back → confirms continuation'
        : '🔵 Blue — differs from 3 back → confirms break';
      div.appendChild(el('p', 'coach-line', `Small Road: ${desc}`));
    }
  }

  if (quiz) {
    div.appendChild(el('hr', 'quiz-sep'));
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
