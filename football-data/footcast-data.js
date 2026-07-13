// ===== FOOTCAST: DATA LOADING + STATE + UTILS =====
// ===== DATA (loaded dynamically per-date) =====
let ALL_DATA = {};
let _loadedDates = new Set();
let _loadingDate = null;
window.FOOTCAST_DATA = window.FOOTCAST_DATA || {};

// ===== FORMAT NORMALIZER =====
// Converts V2/V3 data formats to V1 format so render engine works uniformly.
// V1 (≤7/2): normal/handicap nested, analysis.{bifad,...}, win_odds/ev_win/kelly_win, win_pct 0-100
// V2 (7/3-7/10): normal lacks type, betfair→bifad, odds_w/ev_w/kelly_w, win_pct 0-1
// V3 (7/11+): flat structure (no normal), analysis as top-level *_analysis fields, score_prediction→score_predict
function normalizeMatch(m) {
  if (!m) return m;
  let normal = null;
  let handicap = null;
  let analysis = null;
  let scorePredict = m.score_predict || m.score_prediction || '';
  let riskSignal = m.risk_signal || '';

  // === Detect V3: no normal object, has top-level odds_w ===
  if (!m.normal && m.odds_w != null) {
    normal = {
      type: m.type || '普通盘',
      win_pct: m.win_pct != null ? m.win_pct * 100 : null,
      draw_pct: m.draw_pct != null ? m.draw_pct * 100 : null,
      lose_pct: m.lose_pct != null ? m.lose_pct * 100 : null,
      win_odds: m.odds_w,
      draw_odds: m.odds_d,
      lose_odds: m.odds_l,
      ev_win: m.ev_w,
      ev_draw: m.ev_d,
      ev_lose: m.ev_l,
      kelly_win: m.kelly_w,
      kelly_draw: m.kelly_d,
      kelly_lose: m.kelly_l
    };
    analysis = {
      handicap: m.odds_analysis || '',
      bifad: m.betfair_analysis || '',
      injury: m.injury_analysis || '',
      tactical: m.tactics_analysis || '',
      form: m.form_analysis || '',
      uncertain: m.uncertainty || ''
    };
    if (m.handicap) {
      handicap = {
        type: m.handicap.type || '让球盘',
        win_pct: m.handicap.win_pct != null ? m.handicap.win_pct * 100 : null,
        draw_pct: m.handicap.draw_pct != null ? m.handicap.draw_pct * 100 : null,
        lose_pct: m.handicap.lose_pct != null ? m.handicap.lose_pct * 100 : null,
        win_odds: m.handicap.odds_w,
        draw_odds: m.handicap.odds_d,
        lose_odds: m.handicap.odds_l,
        ev_win: m.handicap.ev_w,
        ev_draw: m.handicap.ev_d,
        ev_lose: m.handicap.ev_l,
        kelly_win: m.handicap.kelly_w,
        kelly_draw: m.handicap.kelly_d,
        kelly_lose: m.handicap.kelly_l
      };
    } else {
      handicap = { type: '让球盘未开售', win_pct: null };
    }
  }
  // === Detect V2: normal exists but uses odds_w/ev_w/kelly_w naming ===
  else if (m.normal && (m.normal.odds_w != null || m.normal.betfair !== undefined)) {
    const pctScale = (m.normal.win_pct != null && m.normal.win_pct <= 1) ? 100 : 1;
    normal = {
      type: m.normal.type || '普通盘',
      win_pct: m.normal.win_pct != null ? m.normal.win_pct * pctScale : null,
      draw_pct: m.normal.draw_pct != null ? m.normal.draw_pct * pctScale : null,
      lose_pct: m.normal.lose_pct != null ? m.normal.lose_pct * pctScale : null,
      win_odds: m.normal.odds_w != null ? m.normal.odds_w : m.normal.win_odds,
      draw_odds: m.normal.odds_d != null ? m.normal.odds_d : m.normal.draw_odds,
      lose_odds: m.normal.odds_l != null ? m.normal.odds_l : m.normal.lose_odds,
      ev_win: m.normal.ev_w != null ? m.normal.ev_w : m.normal.ev_win,
      ev_draw: m.normal.ev_d != null ? m.normal.ev_d : m.normal.ev_draw,
      ev_lose: m.normal.ev_l != null ? m.normal.ev_l : m.normal.ev_lose,
      kelly_win: m.normal.kelly_w != null ? m.normal.kelly_w : m.normal.kelly_win,
      kelly_draw: m.normal.kelly_d != null ? m.normal.kelly_d : m.normal.kelly_draw,
      kelly_lose: m.normal.kelly_l != null ? m.normal.kelly_l : m.normal.kelly_lose
    };
    analysis = {};
    if (m.analysis) {
      analysis.handicap = m.analysis.handicap || '';
      analysis.bifad = m.analysis.betfair || m.analysis.bifad || '';
      analysis.injury = m.analysis.injury || '';
      analysis.tactical = m.analysis.tactical || '';
      analysis.form = m.analysis.form || '';
      analysis.uncertain = m.analysis.uncertain || '';
    }
    if (m.handicap) {
      const hScale = (m.handicap.win_pct != null && m.handicap.win_pct > 0 && m.handicap.win_pct <= 1) ? 100 : 1;
      handicap = {
        type: m.handicap.type || '让球盘',
        win_pct: m.handicap.win_pct != null ? m.handicap.win_pct * hScale : null,
        draw_pct: m.handicap.draw_pct != null ? m.handicap.draw_pct * hScale : null,
        lose_pct: m.handicap.lose_pct != null ? m.handicap.lose_pct * hScale : null,
        win_odds: m.handicap.odds_w != null ? m.handicap.odds_w : m.handicap.win_odds,
        draw_odds: m.handicap.odds_d != null ? m.handicap.odds_d : m.handicap.draw_odds,
        lose_odds: m.handicap.odds_l != null ? m.handicap.odds_l : m.handicap.lose_odds,
        ev_win: m.handicap.ev_w != null ? m.handicap.ev_w : m.handicap.ev_win,
        ev_draw: m.handicap.ev_d != null ? m.handicap.ev_d : m.handicap.ev_draw,
        ev_lose: m.handicap.ev_l != null ? m.handicap.ev_l : m.handicap.ev_lose,
        kelly_win: m.handicap.kelly_w != null ? m.handicap.kelly_w : m.handicap.kelly_win,
        kelly_draw: m.handicap.kelly_d != null ? m.handicap.kelly_d : m.handicap.kelly_draw,
        kelly_lose: m.handicap.kelly_l != null ? m.handicap.kelly_l : m.handicap.kelly_lose
      };
    } else {
      handicap = { type: '让球盘未开售', win_pct: null };
    }
  }
  // === V1: already correct format ===
  else {
    return m;
  }

  return {
    seq: m.seq,
    date: m.date || '',
    league: m.league,
    home: m.home,
    away: m.away,
    time: m.time,
    analysis: analysis,
    normal: normal,
    handicap: handicap,
    risk_signal: riskSignal,
    decision: m.decision,
    score_predict: scorePredict,
    actual_score: m.actual_score,
    handicap_result: m.handicap_result,
    correct: m.correct,
    attribution: m.attribution
  };
}

function normalizeDayData(dayData) {
  if (!dayData || !dayData.matches) return dayData;
  // Fix day-level date format: "20260711" → "2026-07-11"
  let dayDate = dayData.date || '';
  if (/^\d{8}$/.test(dayDate)) {
    dayDate = dayDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  }
  return {
    date: dayDate,
    matches: dayData.matches.map(normalizeMatch)
  };
}

function loadDataAndRender(dataUrl) {
  const script = document.createElement('script');
  script.onload = function() {
    if (window.FOOTCAST_DATA) {
      Object.keys(window.FOOTCAST_DATA).forEach(k => {
        window.FOOTCAST_DATA[k] = normalizeDayData(window.FOOTCAST_DATA[k]);
      });
      ALL_DATA = window.FOOTCAST_DATA;
      dateKeys = Object.keys(ALL_DATA).sort();
      currentDateKey = dateKeys[dateKeys.length - 1];
      dateKeys.forEach(k => _loadedDates.add(k));
      render();
    }
  };
  script.onerror = function() {
    document.getElementById('matchGrid').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div class="msg">数据加载失败，请刷新重试</div></div>';
  };
  script.src = dataUrl;
  document.head.appendChild(script);
}

// Load a single date file, then render
function loadDateData(dateKey) {
  if (_loadedDates.has(dateKey) || _loadingDate === dateKey) {
    currentDateKey = dateKey;
    render();
    return;
  }
  _loadingDate = dateKey;
  const script = document.createElement('script');
  script.onload = function() {
    if (window.FOOTCAST_DATA && window.FOOTCAST_DATA[dateKey]) {
      ALL_DATA[dateKey] = normalizeDayData(window.FOOTCAST_DATA[dateKey]);
    }
    _loadedDates.add(dateKey);
    _loadingDate = null;
    currentDateKey = dateKey;
    render();
  };
  script.onerror = function() {
    _loadingDate = null;
    currentDateKey = dateKey;
    render();
  };
  script.src = 'football-data/data_' + dateKey + '.js?v=' + Date.now();
  document.head.appendChild(script);
}

// Load index file then load the target date
function loadIndexAndDate(targetKey) {
  const script = document.createElement('script');
  script.onload = function() {
    if (window.FOOTCAST_INDEX) {
      dateKeys = window.FOOTCAST_INDEX;
      dateKeys.forEach(k => { if (!ALL_DATA[k]) ALL_DATA[k] = null; });
      currentDateKey = targetKey || dateKeys[dateKeys.length - 1];
      if (_loadedDates.has(currentDateKey)) {
        render();
      } else {
        loadDateData(currentDateKey);
      }
    }
  };
  script.onerror = function() {
    loadDataAndRender('football-data/football_data.js?v=' + Date.now());
  };
  script.src = 'football-data/data_index.js?v=' + Date.now();
  document.head.appendChild(script);
}

// ===== STATE =====
let currentDateKey = "";
let dateKeys = [];

// ===== UTILS =====
const f = (v, d=4) => (v==null) ? '—' : Number(v).toFixed(d);
const fpct = v => (v==null) ? '—' : Math.round(v) + '%';
const fodds = v => (v==null) ? '—' : Number(v).toFixed(2);
function evCls(v) { if(v==null) return ''; return v>0.01?'ev-pos':v>-0.01?'ev-zero':'ev-neg'; }
function kellyCls(v) { if(v==null) return ''; return v>0?'kelly-pos':'kelly-neg'; }
function parseRisk(s) { if(!s) return 0; const m0=s.match(/冷门压力测试:.*=(-?\d+)分/); if(m0) return parseInt(m0[1]); const m1=s.match(/冷门压力测试v?[\d.]*:?(-?\d+)分/); if(m1) return parseInt(m1[1]); const m2=s.match(/冷门分(-?\d+)/); if(m2) return parseInt(m2[1]); const m3=s.match(/^(-?\d+)[⚡✅🚨]/); if(m3) return parseInt(m3[1]); const m4=s.match(/^(-?\d+)\(/); if(m4) return parseInt(m4[1]); return 0; }
function riskLvl(s) { return s>=9?'danger':s>=6?'caution':'safe'; }
function decCls(d) { if(d.includes('弃盘')) return 'disc'; return 'default'; }
function hasResult(m) { return !!(m.actual_score || m.correct); }
function normalizeHR(hr) {
  if (!hr) return '';
  return hr
    .replace(/平局/g, '平')
    .replace(/未开售/g, '——')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/-\s*\/\s*/g, '—— / ')
    .replace(/\s\/\s*-/g, ' / ——')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function parseCorrect(c) {
  if(!c) return {normal:null, handicap:null};
  let nv=null, hv=null;
  const stripLabel = s => s.replace(/^(普通盘|让球盘)\s*[:：]\s*/,'').trim();
  const toResult = s => {
    if(!s || s==='-' || s==='—' || s==='弃盘') return null;
    if(s==='✅' || s==='对') return '对';
    if(s==='❌' || s==='错') return '错';
    return s;
  };
  if(c.includes('|')) {
    const p = c.split('|');
    if(p.length>=2) { nv=toResult(stripLabel(p[0])); hv=toResult(stripLabel(p[1])); }
    else { nv=toResult(stripLabel(p[0])); }
  } else if(c.includes('/')) {
    const p = c.split('/');
    if(p.length>=2) {
      nv=toResult(stripLabel(p[0].trim())); hv=toResult(stripLabel(p[1].trim()));
    } else { nv=toResult(stripLabel(p[0].trim())); }
  } else {
    nv=toResult(c.trim());
  }
  return {normal:nv, handicap:hv};
}
function hlText(t) {
  if (!t) return '';
  return t
    .replace(/⚠️/g,'<span class="hl-amber">⚠️</span>')
    .replace(/🚨/g,'<span class="hl-red">🚨</span>')
    .replace(/⭐/g,'<span class="hl-amber">⭐</span>')
    .replace(/★★★/g,'<span class="hl-red">★★★</span>')
    .replace(/★★/g,'<span class="hl-amber">★★</span>');
}
function splitDecision(d) {
  if (!d) return {normal: '', handicap: ''};
  const idx = d.indexOf(' / ');
  if (idx >= 0) return {normal: d.substring(0, idx).trim(), handicap: d.substring(idx + 3).trim()};
  const idx2 = d.indexOf('/');
  if (idx2 >= 0) return {normal: d.substring(0, idx2).trim(), handicap: d.substring(idx2 + 1).trim()};
  return {normal: d.trim(), handicap: ''};
}
