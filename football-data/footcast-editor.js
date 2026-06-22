// ===== FOOTCAST: EDITOR + GITHUB PUSH + INIT =====
// ===== GITHUB PUSH =====
const GH_REPO = 'xuxianyu1/football-guide';
const GH_API = 'https://api.github.com';
let _dirtyDates = new Set(); // Track dates modified in editor

function openSettingsModal() {
  const token = localStorage.getItem('gh_token') || '';
  const statusEl = document.getElementById('settingsStatus');
  if (token) {
    statusEl.className = 'settings-status connected';
    statusEl.innerHTML = '✅ 已配置Token';
    document.getElementById('ghTokenInput').value = token;
  } else {
    statusEl.className = 'settings-status disconnected';
    statusEl.innerHTML = '⚠️ 尚未配置Token，推送功能不可用';
  }
  document.getElementById('settingsOverlay').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settingsOverlay').classList.remove('active');
}

function saveGitHubSettings() {
  const token = document.getElementById('ghTokenInput').value.trim();
  if (!token) {
    localStorage.removeItem('gh_token');
  } else {
    localStorage.setItem('gh_token', token);
  }
  closeSettingsModal();
  const statusEl = document.getElementById('settingsStatus');
  if (token) {
    statusEl.className = 'settings-status connected';
    statusEl.innerHTML = '✅ Token已保存';
  }
}

function showPushToast(title, detail, type) {
  // Remove existing toasts
  document.querySelectorAll('.push-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'push-toast';
  toast.innerHTML = `
    <div class="toast-title ${type}">${title}</div>
    <div class="toast-detail">${detail}</div>
    <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
  `;
  document.body.appendChild(toast);
  if (type === 'success') setTimeout(() => toast.remove(), 5000);
  if (type === 'error') setTimeout(() => toast.remove(), 10000);
}

async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('请求超时，请检查网络连接');
    throw e;
  }
}

async function pushToGitHub() {
  const token = localStorage.getItem('gh_token');
  if (!token) {
    openSettingsModal();
    return;
  }

  // Collect keys to push: dirty dates (editor changes) + current date fallback
  const keysToPush = [..._dirtyDates];
  if (keysToPush.length === 0) {
    // No editor changes yet - push current date as fallback
    if (currentDateKey && ALL_DATA[currentDateKey]) keysToPush.push(currentDateKey);
    else { showPushToast('⚠️ 无数据', '没有需要推送的改动', 'error'); return; }
  }

  // Filter out keys with no data
  const validKeys = keysToPush.filter(k => ALL_DATA[k] && ALL_DATA[k].matches);
  if (validKeys.length === 0) { showPushToast('⚠️ 无数据', '选中的日期无数据可推送', 'error'); return; }

  const btn = document.getElementById('pushBtn');
  btn.classList.add('pushing');
  btn.textContent = '⏳';

  const today = new Date();
  const dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  const timeStr = String(today.getHours()).padStart(2,'0') + ':' + String(today.getMinutes()).padStart(2,'0');

  showPushToast('🔄 正在推送...', `共${validKeys.length}个日期待推送`, 'progress');

  try {
    let lastSha = '';
    const totalMatches = validKeys.reduce((s,k) => s + (ALL_DATA[k].matches ? ALL_DATA[k].matches.length : 0), 0);
    const commitMsg = `更新${validKeys.length}个日期数据 ${dateStr} ${timeStr} (${totalMatches}场)`;

    // 1. Push each dirty date file
    for (let i = 0; i < validKeys.length; i++) {
      const key = validKeys[i];
      const dateFileName = 'data_' + key + '.js';
      const dateFilePath = 'football-data/' + dateFileName;
      showPushToast('🔄 正在推送...', `[${i+1}/${validKeys.length}] ${dateFileName}`, 'progress');

      const dateContent = 'window.FOOTCAST_DATA["' + key + '"] = ' + JSON.stringify(ALL_DATA[key]) + ';\n';
      const dateEncoded = btoa(unescape(encodeURIComponent(dateContent)));

      let dateSha = null;
      const getDateResp = await fetchWithTimeout(`${GH_API}/repos/${GH_REPO}/contents/${dateFilePath}`, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      }, 15000);
      if (getDateResp.ok) dateSha = (await getDateResp.json()).sha;

      const pushDateBody = { message: commitMsg, content: dateEncoded, branch: 'main' };
      if (dateSha) pushDateBody.sha = dateSha;

      const pushDateResp = await fetchWithTimeout(`${GH_API}/repos/${GH_REPO}/contents/${dateFilePath}`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(pushDateBody)
      }, 30000);

      if (!pushDateResp.ok) {
        const errData = await pushDateResp.json().catch(() => ({}));
        if (pushDateResp.status === 409) throw new Error('SHA冲突，请刷新页面后重试');
        throw new Error(`推送${dateFileName}失败: ${errData.message || '未知错误'}`);
      }
      const result = await pushDateResp.json();
      lastSha = result.commit.sha.substring(0,7);
    }

    // 2. Update index file
    showPushToast('🔄 正在推送...', '正在更新索引文件...', 'progress');
    const allDateKeys = [...new Set([...dateKeys, ...validKeys])].sort();
    const indexContent = 'window.FOOTCAST_INDEX = ' + JSON.stringify(allDateKeys) + ';\n';
    const indexEncoded = btoa(unescape(encodeURIComponent(indexContent)));

    let indexSha = null;
    const getIdxResp = await fetchWithTimeout(`${GH_API}/repos/${GH_REPO}/contents/football-data/data_index.js`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    }, 15000);
    if (getIdxResp.ok) indexSha = (await getIdxResp.json()).sha;
    const pushIdxBody = { message: '更新索引 ' + dateStr, content: indexEncoded, branch: 'main' };
    if (indexSha) pushIdxBody.sha = indexSha;

    await fetchWithTimeout(`${GH_API}/repos/${GH_REPO}/contents/football-data/data_index.js`, {
      method: 'PUT',
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(pushIdxBody)
    }, 30000);

    // 3. Update full football_data.js
    showPushToast('🔄 正在推送...', '正在更新完整数据文件...', 'progress');
    const fullContent = 'window.FOOTCAST_DATA = ' + JSON.stringify(ALL_DATA) + ';\n';
    const fullEncoded = btoa(unescape(encodeURIComponent(fullContent)));

    const getFullResp = await fetchWithTimeout(`${GH_API}/repos/${GH_REPO}/contents/football-data/football_data.js`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    }, 15000);
    if (!getFullResp.ok) throw new Error('获取football_data.js信息失败');
    const fullSha = (await getFullResp.json()).sha;

    await fetchWithTimeout(`${GH_API}/repos/${GH_REPO}/contents/football-data/football_data.js`, {
      method: 'PUT',
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: commitMsg + ' [full]', content: fullEncoded, sha: fullSha, branch: 'main' })
    }, 60000);

    // Clear dirty set and localStorage cache
    _dirtyDates.clear();
    localStorage.removeItem('footcast_data');

    const dateList = validKeys.map(k => (ALL_DATA[k] && ALL_DATA[k].date) || k).join(', ');
    showPushToast(
      '✅ 推送成功！',
      `${validKeys.length}个日期: ${dateList}<br>${totalMatches}场 · Commit: ${lastSha}<br><a href="https://xuxianyu1.github.io/football-guide/dashboard.html" target="_blank" style="color:var(--green)">查看页面 →</a>`,
      'success'
    );

  } catch(err) {
    showPushToast('❌ 推送失败', err.message, 'error');
  } finally {
    btn.classList.remove('pushing');
    btn.textContent = '🚀';
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  // Try loading from localStorage first
  try {
    const saved = localStorage.getItem('footcast_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Object.keys(parsed).length > 0) {
        ALL_DATA = parsed;
        dateKeys = Object.keys(ALL_DATA).sort();
        dateKeys.forEach(k => _loadedDates.add(k));
        currentDateKey = dateKeys[dateKeys.length - 1];
        render();
        return;
      }
    }
  } catch(e) {}

  // Load index + latest date file (per-date mode)
  loadIndexAndDate();
});


// ===== EDITOR FUNCTIONS =====
function openEditorModal() {
  const select = document.getElementById('editorDateSelect');
  select.innerHTML = '';
  const keys = Object.keys(ALL_DATA).sort();
  keys.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    const d = ALL_DATA[k];
    const cnt = (d && d.matches) ? d.matches.length : 0;
    opt.textContent = ((d && d.date) || k.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')) + ' (' + cnt + '场)';
    select.appendChild(opt);
  });
  // Default to current date
  if (currentDateKey && keys.includes(currentDateKey)) select.value = currentDateKey;
  renderEditorForm();
  document.getElementById('editorOverlay').classList.add('active');
}

function closeEditorModal() {
  document.getElementById('editorOverlay').classList.remove('active');
}

function renderEditorForm() {
  const key = document.getElementById('editorDateSelect').value;
  const container = document.getElementById('editorMatchList');
  if (!key || !ALL_DATA[key] || !ALL_DATA[key].matches || ALL_DATA[key].matches.length === 0) {
    container.innerHTML = '<div class="editor-empty">该日期暂无比赛数据</div>';
    return;
  }
  const matches = ALL_DATA[key].matches;
  container.innerHTML = matches.map((m, idx) => {
    const normalCorrect = (m.correct || '—/—').split('/')[0] || '—';
    const hcCorrect = (m.correct || '—/—').split('/')[1] || '—';
    const hr = (m.handicap_result || '— / —');
    const hrParts = hr.includes(' / ') ? hr.split(' / ') : hr.split('/');
    const normalResult = hrParts[0] || '—';
    const hcResult = hrParts[1] || '—';
    return `
    <div class="editor-match-card">
      <div class="match-header">
        <span>${m.seq || idx+1}.</span>
        <span>${m.home || ''}</span>
        <span class="vs">vs</span>
        <span>${m.away || ''}</span>
        <span class="league">${m.league || ''}</span>
      </div>
      <div class="editor-fields">
        <div class="editor-field">
          <label>比赛时间</label>
          <input type="text" data-idx="${idx}" data-field="time" value="${m.time || ''}">
        </div>
        <div class="editor-field">
          <label>实际比分</label>
          <input type="text" data-idx="${idx}" data-field="actual_score" value="${m.actual_score || ''}" placeholder="如 2-1">
        </div>
        <div class="editor-field">
          <label>决策方向</label>
          <input type="text" data-idx="${idx}" data-field="decision" value="${m.decision || ''}">
        </div>
        <div class="editor-field">
          <label>比分预测</label>
          <input type="text" data-idx="${idx}" data-field="score_predict" value="${m.score_predict || ''}">
        </div>
        <div class="editor-field">
          <label>普通盘结果</label>
          <select data-idx="${idx}" data-field="normal_result">
            <option value="主胜" ${normalResult==='主胜'?'selected':''}>主胜</option>
            <option value="客胜" ${normalResult==='客胜'?'selected':''}>客胜</option>
            <option value="平局" ${normalResult==='平局'?'selected':''}>平局</option>
            <option value="—" ${normalResult==='—' || !normalResult?'selected':''}>—</option>
          </select>
        </div>
        <div class="editor-field">
          <label>普通盘对错</label>
          <select data-idx="${idx}" data-field="normal_correct">
            <option value="对" ${normalCorrect==='对'?'selected':''}>对</option>
            <option value="错" ${normalCorrect==='错'?'selected':''}>错</option>
            <option value="—" ${normalCorrect==='—'?'selected':''}>—</option>
          </select>
        </div>
        <div class="editor-field">
          <label>让球盘结果</label>
          <select data-idx="${idx}" data-field="hc_result">
            <option value="让胜" ${hcResult==='让胜'?'selected':''}>让胜</option>
            <option value="让平" ${hcResult==='让平'?'selected':''}>让平</option>
            <option value="让负" ${hcResult==='让负'?'selected':''}>让负</option>
            <option value="—" ${hcResult==='—' || !hcResult?'selected':''}>—</option>
          </select>
        </div>
        <div class="editor-field">
          <label>让球盘对错</label>
          <select data-idx="${idx}" data-field="hc_correct">
            <option value="对" ${hcCorrect==='对'?'selected':''}>对</option>
            <option value="错" ${hcCorrect==='错'?'selected':''}>错</option>
            <option value="—" ${hcCorrect==='—'?'selected':''}>—</option>
          </select>
        </div>
        <div class="editor-field full">
          <label>归因分析</label>
          <input type="text" data-idx="${idx}" data-field="attribution" value="${(m.attribution || '').replace(/"/g, '&quot;')}">
        </div>
      </div>
    </div>`;
  }).join('');
}

function collectEditorData() {
  const key = document.getElementById('editorDateSelect').value;
  if (!key || !ALL_DATA[key]) return null;
  const matches = ALL_DATA[key].matches;
  const inputs = document.querySelectorAll('#editorMatchList [data-idx]');
  inputs.forEach(el => {
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    const val = el.value;
    if (idx >= matches.length) return;
    if (field === 'time') matches[idx].time = val;
    else if (field === 'actual_score') matches[idx].actual_score = val;
    else if (field === 'decision') matches[idx].decision = val;
    else if (field === 'score_predict') matches[idx].score_predict = val;
    else if (field === 'normal_result' || field === 'hc_result') {
      // Reconstruct handicap_result (handle both ' / ' and '/' separators)
      const hr = matches[idx].handicap_result || '— / —';
      const oldParts = hr.includes(' / ') ? hr.split(' / ') : hr.split('/');
      if (field === 'normal_result') oldParts[0] = val;
      else oldParts[1] = val;
      matches[idx].handicap_result = oldParts.join(' / ');
    } else if (field === 'normal_correct' || field === 'hc_correct') {
      const oldParts = (matches[idx].correct || '—/—').split('/');
      if (field === 'normal_correct') oldParts[0] = val;
      else oldParts[1] = val;
      matches[idx].correct = oldParts.join('/');
    } else if (field === 'attribution') matches[idx].attribution = val;
  });
  ALL_DATA[key].matches = matches;
  return key;
}

function saveEditorData() {
  const key = collectEditorData();
  if (!key) return false;
  _dirtyDates.add(key);
  localStorage.setItem('footcast_data', JSON.stringify(ALL_DATA));
  dateKeys = Object.keys(ALL_DATA).sort();
  const sel = document.getElementById('dateSelect');
  if (sel) {
    sel.innerHTML = dateKeys.map(k => {
      const d = ALL_DATA[k];
      return '<option value="'+k+'">'+((d&&d.date)||k.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'))+'</option>';
    }).join('');
    sel.value = currentDateKey;
  }
  render();
  const dirtyInfo = _dirtyDates.size > 1 ? `（共${_dirtyDates.size}个日期待推送）` : '';
  showPushToast('✅ 保存成功', key + ' 数据已更新到本地 ' + dirtyInfo, 'success');
  return true;
}

async function saveAndPush() {
  if (!saveEditorData()) return;
  await pushToGitHub();
}
