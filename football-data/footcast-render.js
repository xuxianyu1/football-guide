// ===== FOOTCAST: RENDER ENGINE =====
// ===== RENDER =====
function render() {
  const data = ALL_DATA[currentDateKey];
  const dIdx = dateKeys.indexOf(currentDateKey);

  // Update date select
  const sel = document.getElementById('dateSelect');
  if (sel.options.length !== dateKeys.length) {
    sel.innerHTML = dateKeys.map(k => {
      const d = ALL_DATA[k];
      const label = (d && d.date) ? d.date : k.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
      return `<option value="${k}">${label}</option>`;
    }).join('');
  }
  sel.value = currentDateKey;

  document.getElementById('prevBtn').disabled = dIdx <= 0;
  document.getElementById('nextBtn').disabled = dIdx >= dateKeys.length - 1;

  if (!data) {
    // Date exists in index but not loaded yet - trigger load
    if (currentDateKey && !_loadedDates.has(currentDateKey) && _loadingDate !== currentDateKey) {
      loadDateData(currentDateKey);
      document.getElementById('matchGrid').innerHTML = '<div class="empty-state"><div class="icon">⏳</div><div class="msg">加载中...</div></div>';
    } else {
      document.getElementById('matchGrid').innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="msg">当日暂无预测数据</div></div>';
    }
    // Clear stats
    document.getElementById('statsBar').innerHTML = '';
    document.getElementById('matchCount').textContent = '';
    return;
  }
  renderStats(data);
  renderMatches(data);
}

function renderStats(data) {
  const ms = data.matches;
  const total = ms.length;
  const discarded = ms.filter(m=>m.decision.includes('弃盘')).length;
  const normal = total - discarded;
  const reviewed = ms.filter(m=>hasResult(m)).length;
  const correctCount = ms.reduce((cnt,m)=>{
    if(!m.correct) return cnt;
    const c = parseCorrect(m.correct);
    if(c.normal==='对') cnt++;
    if(c.handicap==='对') cnt++;
    return cnt;
  }, 0);
  const totalCount = ms.reduce((cnt,m)=>{
    if(!m.correct) return cnt;
    const c = parseCorrect(m.correct);
    if(c.normal!=null) cnt++;
    if(c.handicap!=null) cnt++;
    return cnt;
  }, 0);
  let posEvMatches = 0;
  ms.forEach(m => {
    let hasPos = false;
    ['normal','handicap'].forEach(k => {
      const d = m[k];
      if(d.ev_win!=null && (d.ev_win>0||d.ev_draw>0||d.ev_lose>0)) hasPos = true;
    });
    if(hasPos) posEvMatches++;
  });
  const avgRisk = ms.reduce((s,m)=>s+Math.abs(parseRisk(m.risk_signal)),0)/total;
  const accuracyPct = totalCount>0 ? Math.round((correctCount/totalCount)*100) : null;

  let html = `
    <div class="stat-card"><div class="label">预测场次</div><div class="value green">${total}</div></div>
    <div class="stat-card"><div class="label">正常盘</div><div class="value cyan">${normal}</div></div>
    <div class="stat-card"><div class="label">弃盘</div><div class="value ${discarded?'red':''}">${discarded}</div></div>
    <div class="stat-card"><div class="label">正EV场次</div><div class="value amber">${posEvMatches}</div></div>
    <div class="stat-card"><div class="label">平均冷门分</div><div class="value">${avgRisk.toFixed(1)}</div></div>`;
  if(totalCount>0) {
    html += `<div class="stat-card"><div class="label">已复盘 / 命中率</div><div class="value ${accuracyPct>=50?'green':'red'}">${correctCount}/${totalCount} = ${accuracyPct}%</div></div>`;
  }
  document.getElementById('statsBar').innerHTML = html;
}

function renderMatches(data) {
  let ms = data.matches;
  document.getElementById('matchCount').textContent = `共 ${ms.length} / ${data.matches.length} 场`;

  if(ms.length===0) {
    document.getElementById('matchGrid').innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="msg">当日暂无预测数据</div></div>';
    return;
  }

  const grid = document.getElementById('matchGrid');
  grid.innerHTML = ms.map((m,i)=>renderCard(m,i)).join('');
  setTimeout(()=>{
    document.querySelectorAll('.prob-bar[data-w]').forEach(b=>{b.style.width=b.dataset.w;});
  },80);
}

function renderCard(m, idx) {
  const rs = parseRisk(m.risk_signal);
  const rl = riskLvl(rs);
  const dc = decCls(m.decision);
  const isDisc = m.decision.includes('弃盘');
  const isReviewed = hasResult(m);
  const hasN = m.normal.type && !m.normal.type.includes('未开售') && m.normal.win_pct!=null;
  const hasH = m.handicap.type && m.handicap.win_pct!=null;
  const correctInfo = parseCorrect(m.correct);

  let reviewCls = '';
  if(isReviewed) {
    const nOk = correctInfo.normal==='对', nErr = correctInfo.normal==='错';
    const hOk = correctInfo.handicap==='对', hErr = correctInfo.handicap==='错';
    const nHas = correctInfo.normal!=null, hHas = correctInfo.handicap!=null;
    const allCorrect = (nHas?nOk:true) && (hHas?hOk:true);
    const anyWrong = (nHas&&nErr) || (hHas&&hErr);
    reviewCls = allCorrect ? 'reviewed reviewed-allcorrect' : anyWrong ? 'reviewed reviewed-anywrong' : 'reviewed';
  }

  let cls = 'match-card';
  if(isDisc) cls += ' discarded';
  else if(rl==='danger') cls += ' risk-danger';
  else if(rl==='caution') cls += ' risk-warn';
  cls += reviewCls ? ' ' + reviewCls : '';

  let resultTag = '';
  if(isReviewed) {
    const nOk = correctInfo.normal==='对', nErr = correctInfo.normal==='错';
    const hOk = correctInfo.handicap==='对', hErr = correctInfo.handicap==='错';
    const nHas = correctInfo.normal!=null, hHas = correctInfo.handicap!=null;
    if(nHas && hHas) {
      if(nOk && hOk) resultTag = '<span class="tag result-correct">✅ 全对</span>';
      else if(nErr && hErr) resultTag = '<span class="tag result-wrong">❌ 全错</span>';
      else resultTag = '<span class="tag result-partial">⚡ 部分对</span>';
    } else if(hHas) {
      resultTag = hOk ? '<span class="tag result-correct">✅ 让球盘对</span>' : '<span class="tag result-wrong">❌ 让球盘错</span>';
    } else if(nHas) {
      resultTag = nOk ? '<span class="tag result-correct">✅ 普通盘对</span>' : '<span class="tag result-wrong">❌ 普通盘错</span>';
    }
  }

  let scoreLine = '';
  if(isReviewed) {
    scoreLine = `预测 <span class="pred dim">${m.score_predict}</span><span class="sep">|</span>实际 <span class="actual">${m.actual_score}</span>`;
  } else {
    scoreLine = `比分 <span class="pred">${m.score_predict}</span>`;
  }

  return `
  <div class="${cls}" id="mc-${idx}">
    <div class="match-header" onclick="toggle(${idx})">
      <div class="match-seq">${String(m.seq).padStart(2,'0')}</div>
      <div class="match-info">
        <div class="match-league">
          ${m.league}
          ${m.normal.type&&m.normal.type.includes('未开售')?'<span class="tag">普通盘未开售</span>':''}
          ${m.handicap.type?'<span class="tag handicap-tag">'+m.handicap.type+'</span>':''}
          ${resultTag}
        </div>
        <div class="match-teams"><span>${m.home}</span><span class="vs">VS</span><span>${m.away}</span></div>
        <div class="match-time-row"><span>📅 ${m.date} ${m.time}</span></div>
      </div>
      <div class="match-meta">
        <div class="match-decision-badge ${dc}">${isReviewed ? renderBadgeDecision(m, correctInfo) : m.decision}</div>
        <div class="match-score-line">${scoreLine}</div>
      </div>
    </div>
    <div class="expand-hint"><span class="arrow">▼</span> 点击展开详细分析</div>
    <div class="match-details">
      <div class="details-inner">
        ${renderDecision(m)}
        ${isReviewed ? renderReview(m, correctInfo) : ''}
        ${renderRisk(m, rs, rl)}
        <div class="prob-section">
          <div class="prob-grid">
            ${hasN ? renderProb('普通盘', m.normal) : ''}
            ${hasH ? renderProb(m.handicap.type, m.handicap) : ''}
          </div>
        </div>
        ${(hasN||hasH) ? renderTable(m) : ''}
        <div class="analysis-grid">${renderAnalysis(m)}</div>
      </div>
    </div>
  </div>`;
}

function renderBadgeDecision(m, ci) {
  const sp = splitDecision(m.decision);
  const parts = [sp.normal, sp.handicap].filter(Boolean);
  return parts.map((p, i) => {
    const isOk = i === 0 ? ci.normal === '对' : ci.handicap === '对';
    const isErr = i === 0 ? ci.normal === '错' : ci.handicap === '错';
    const cls = isOk ? 'b-ok' : isErr ? 'b-err' : '';
    return `<span class="${cls}">${p}</span>`;
  }).join('<span class="b-sep"> / </span>');
}

function renderDecision(m) {
  const ci = parseCorrect(m.correct);
  const isReviewed = !!(m.actual_score || m.correct);
  const sp = splitDecision(m.decision);
  let choiceHtml = '';

  if (isReviewed) {
    const parts = [sp.normal, sp.handicap].filter(Boolean);
    const colored = parts.map((p, i) => {
      const isOk = i === 0 ? ci.normal === '对' : ci.handicap === '对';
      const isErr = i === 0 ? ci.normal === '错' : ci.handicap === '错';
      const cls = isOk ? 'dec-ok' : isErr ? 'dec-err' : '';
      return `<span class="${cls}">${p}</span>`;
    });
    choiceHtml = colored.join(' <span style="color:var(--text3)">/</span> ');
  } else {
    choiceHtml = m.decision;
  }
  return `
  <div class="decision-box${isReviewed ? ' reviewed' : ''}">
    <div class="decision-main">
      <div class="label">最终决策</div>
      <div class="choice">${choiceHtml}</div>
    </div>
    <div class="decision-score-box">
      <div class="label">比分预测</div>
      <div class="scores">${m.score_predict}</div>
    </div>
  </div>`;
}

function renderReview(m, ci) {
  return `
  <div class="review-section">
    <div class="review-title">🏅 赛后复盘</div>
    <div class="review-grid">
      <div class="review-item">
        <div class="review-label">实际比分</div>
        <div class="review-value score-value">${m.actual_score||'—'}</div>
      </div>
      <div class="review-item">
        <div class="review-label">盘口结果</div>
        <div class="review-value">${m.handicap_result||'—'}</div>
      </div>
      <div class="review-item">
        <div class="review-label">普通盘</div>
        <div class="review-value ${ci.normal==='对'?'correct':ci.normal==='错'?'wrong':'neutral'}">
          ${ci.normal==='对'?'✅ 对':ci.normal==='错'?'❌ 错':ci.normal==null?'— 未开售 —':'—'}
        </div>
      </div>
      <div class="review-item">
        <div class="review-label">让球盘</div>
        <div class="review-value ${ci.handicap==='对'?'correct':ci.handicap==='错'?'wrong':'neutral'}">
          ${ci.handicap==='对'?'✅ 对':ci.handicap==='错'?'❌ 错':ci.handicap==null?'— 未开售 —':'—'}
        </div>
      </div>
    </div>
    ${m.attribution ? `<div class="review-attribution"><span class="attr-label">归因分析</span><span class="attr-text">${m.attribution}</span></div>` : ''}
  </div>`;
}

function renderRisk(m, score, level) {
  const s = m.risk_signal || '';
  const tags = [];
  let detail = '';
  let isCompact = false;
  if (s.includes(' | ')) {
    const parts = s.split(' | ');
    parts.forEach(p => {
      const kv = p.split('=');
      if(kv.length===2 && kv[0]!=='各项得分明细') {
        const c = kv[1].includes('强')?'green':kv[1].includes('无欲')?'amber':'cyan';
        tags.push({text:kv[0]+': '+kv[1], c});
      }
    });
    const dm = s.match(/各项得分明细=(.*)/);
    detail = dm?dm[1]:'';
  } else {
    isCompact = true;
    const compactMatch = s.match(/^(-?\d+)[⚡✅🚨]?(.*)/);
    if (compactMatch) {
      detail = compactMatch[2] || '';
      const items = detail.match(/[A-Z]\d+[a-z]*\([^)]*\)/g);
      if (items) {
        items.forEach(item => {
          const c = item.includes('-')?'red':item.includes('+')?'green':'cyan';
          tags.push({text:item, c});
        });
      }
    }
  }
  const levelText = score>=9?'🚨强制弃盘':score>=6?'⚠️建议弃盘':score>=3?'⚡冷门警惕':'✅正常';

  return `
  <div class="risk-section">
    <div class="risk-card">
      <div class="risk-top">
        <div class="risk-gauge ${level}">${score}</div>
        <div class="risk-info">
          <div class="risk-level ${level}">${levelText}</div>
          <div class="risk-desc">冷门压力测试</div>
        </div>
      </div>
      ${tags.length?`<div class="risk-tags">${tags.map(t=>`<span class="risk-tag ${t.c}">${t.text}</span>`).join('')}</div>`:''}
      ${!isCompact && detail?`<div class="risk-detail-line">各项得分明细: ${detail}</div>`:''}
    </div>
  </div>`;
}

function renderProb(title, d) {
  const items = [
    {l:'胜',pct:d.win_pct,cls:'win-bar',odds:d.win_odds,c:'green'},
    {l:'平',pct:d.draw_pct,cls:'draw-bar',odds:d.draw_odds,c:'amber'},
    {l:'负',pct:d.lose_pct,cls:'lose-bar',odds:d.lose_odds,c:'red'},
  ];
  return `
  <div class="prob-card">
    <div class="prob-card-title">${title} <span class="badge">概率分布</span></div>
    ${items.map(it=>`
      <div class="prob-row">
        <div class="prob-label">${it.l}</div>
        <div class="prob-bar-track">
          <div class="prob-bar ${it.cls}" style="width:0" data-w="${it.pct||0}%"><span class="odds-text">${fodds(it.odds)}</span></div>
        </div>
        <div class="prob-pct ${it.c}">${fpct(it.pct)}</div>
      </div>`).join('')}
  </div>`;
}

function renderTable(m) {
  const hasN = m.normal.win_pct!=null && m.normal.type!=='普通盘未开售';
  const hasH = m.handicap.win_pct!=null;
  const rows = [];
  if(hasN) rows.push({label:'普通盘',d:m.normal});
  if(hasH) rows.push({label:m.handicap.type,d:m.handicap});

  return `
  <div class="data-table-wrap">
    <table class="data-table">
      <thead><tr>
        <th class="left">盘口</th><th>胜赔</th><th>平赔</th><th>负赔</th>
        <th>EV胜</th><th>EV平</th><th>EV负</th><th>凯利胜</th><th>凯利平</th><th>凯利负</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>{
          const evs=[r.d.ev_win,r.d.ev_draw,r.d.ev_lose].map(v=>v==null?-999:v);
          const kls=[r.d.kelly_win,r.d.kelly_draw,r.d.kelly_lose].map(v=>v==null?-999:v);
          const maxEvI=evs.indexOf(Math.max(...evs));
          const maxKlI=kls.indexOf(Math.max(...kls));
          const odds=[r.d.win_odds,r.d.draw_odds,r.d.lose_odds];
          const evVals=[r.d.ev_win,r.d.ev_draw,r.d.ev_lose];
          const klVals=[r.d.kelly_win,r.d.kelly_draw,r.d.kelly_lose];
          return `<tr>
            <td class="left">${r.label}</td>
            ${odds.map(v=>`<td>${fodds(v)}</td>`).join('')}
            ${evVals.map((v,i)=>{let cls=evCls(v);if(i===maxEvI&&v>0)cls+=' best';return`<td class="${cls}">${f(v)}</td>`;}).join('')}
            ${klVals.map((v,i)=>{let cls=kellyCls(v);if(i===maxKlI&&v>0)cls+=' best-k';return`<td class="${cls}">${f(v)}</td>`;}).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderAnalysis(m) {
  const dims = [
    {key:'handicap',title:'盘口分析',icon:'📊'},
    {key:'bifad',title:'必发分析',icon:'💰'},
    {key:'injury',title:'伤停分析',icon:'🏥'},
    {key:'tactical',title:'战术克制',icon:'⚔️'},
    {key:'form',title:'状态战意',icon:'🔥'},
    {key:'uncertain',title:'不确定因素',icon:'❓'},
  ];
  return dims.map(d=>`
    <div class="analysis-item" onclick="this.classList.toggle('open')">
      <div class="analysis-header">
        <div class="title"><span class="icon">${d.icon}</span>${d.title}</div>
        <span class="chevron">▶</span>
      </div>
      <div class="analysis-body">
        <div class="analysis-content">${hlText(m.analysis[d.key])}</div>
      </div>
    </div>
  `).join('');
}

// ===== INTERACTIONS =====
function toggle(idx) { document.getElementById('mc-'+idx).classList.toggle('expanded'); }
function expandAll() { document.querySelectorAll('.match-card').forEach(c=>c.classList.add('expanded')); }
function collapseAll() { document.querySelectorAll('.match-card').forEach(c=>c.classList.remove('expanded')); }
function navDate(dir) {
  const i = dateKeys.indexOf(currentDateKey);
  const ni = i + dir;
  if(ni>=0 && ni<dateKeys.length) loadDateData(dateKeys[ni]);
}
function selectDate(key) {
  if (key) loadDateData(key);
}

