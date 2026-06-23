// ===== FOOTCAST: DATA LOADING + STATE + UTILS =====
// ===== DATA (loaded dynamically per-date) =====
let ALL_DATA = {};
let _loadedDates = new Set();
let _loadingDate = null;
window.FOOTCAST_DATA = window.FOOTCAST_DATA || {};

function loadDataAndRender(dataUrl) {
  const script = document.createElement('script');
  script.onload = function() {
    if (window.FOOTCAST_DATA) {
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
    // Copy loaded data from window.FOOTCAST_DATA to ALL_DATA
    if (window.FOOTCAST_DATA && window.FOOTCAST_DATA[dateKey]) {
      ALL_DATA[dateKey] = window.FOOTCAST_DATA[dateKey];
    }
    _loadedDates.add(dateKey);
    _loadingDate = null;
    currentDateKey = dateKey;
    render();
  };
  script.onerror = function() {
    _loadingDate = null;
    // Fallback: show empty
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
      // Ensure ALL_DATA has empty slots for all dates (but don't overwrite existing data)
      dateKeys.forEach(k => { if (!ALL_DATA[k]) ALL_DATA[k] = null; });
      currentDateKey = targetKey || dateKeys[dateKeys.length - 1];
      // If the target date is already loaded, just refresh the date selector and render
      if (_loadedDates.has(currentDateKey)) {
        render();
      } else {
        loadDateData(currentDateKey);
      }
    }
  };
  script.onerror = function() {
    // Fallback: load full football_data.js
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
function parseRisk(s) { const m0=s.match(/冷门压力测试:.*=(-?\d+)分/); if(m0) return parseInt(m0[1]); const m1=s.match(/冷门压力测试v?[\d.]*:?(-?\d+)分/); if(m1) return parseInt(m1[1]); const m2=s.match(/冷门分(-?\d+)/); if(m2) return parseInt(m2[1]); const m3=s.match(/^(-?\d+)[⚡✅🚨]/); if(m3) return parseInt(m3[1]); const m4=s.match(/^(-?\d+)\(/); if(m4) return parseInt(m4[1]); return 0; }
function riskLvl(s) { return s>=9?'danger':s>=6?'caution':'safe'; }
function decCls(d) { if(d.includes('弃盘')) return 'disc'; return 'default'; }
function hasResult(m) { return !!(m.actual_score || m.correct); }
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
  return t
    .replace(/⚠️/g,'<span class="hl-amber">⚠️</span>')
    .replace(/🚨/g,'<span class="hl-red">🚨</span>')
    .replace(/⭐/g,'<span class="hl-amber">⭐</span>')
    .replace(/★★★/g,'<span class="hl-red">★★★</span>')
    .replace(/★★/g,'<span class="hl-amber">★★</span>');
}

// ===== Decision parsing: split on " / " to get [normal, handicap] =====
function splitDecision(d) {
  if (!d) return {normal: '', handicap: ''};
  const idx = d.indexOf(' / ');
  if (idx >= 0) return {normal: d.substring(0, idx).trim(), handicap: d.substring(idx + 3).trim()};
  return {normal: d.trim(), handicap: ''};
}
