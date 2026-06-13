let currentData = null;
let currentSentenceIndex = 0;
let isListening = false;
let recognition = null;

const topics = [
  '日常對話', '旅遊', '餐廳', '購物', '工作', '天氣',
  '興趣', '健康', '節日', '學校', '科技', '電影',
  '音樂', '運動', '家庭', '朋友', '愛情', '夢想',
];

function init() {
  renderTopicSelector();
  loadHistory();

  document.getElementById('generate-btn').addEventListener('click', generate);
  document.getElementById('play-btn').addEventListener('click', playSentence);
  document.getElementById('toggle-trans-btn').addEventListener('click', toggleTranslation);
  document.getElementById('speak-btn').addEventListener('click', startListening);
  document.getElementById('prev-sentence').addEventListener('click', () => navigateSentence(-1));
  document.getElementById('next-sentence').addEventListener('click', () => navigateSentence(1));
  document.getElementById('show-history-btn').addEventListener('click', toggleHistory);
  document.getElementById('settings-toggle').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.toggle('hidden');
  });
}

function renderTopicSelector() {
  const sel = document.getElementById('topic-select');
  sel.innerHTML = '';
  topics.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
  sel.value = '日常對話';
}

async function generate() {
  const topic = document.getElementById('topic-select').value;
  const customTopic = document.getElementById('custom-topic').value.trim();
  const finalTopic = customTopic || topic;
  const count = parseInt(document.getElementById('count-select').value);

  const genBtn = document.getElementById('generate-btn');
  genBtn.textContent = '⏳ 產生中...';
  genBtn.disabled = true;

  try {
    const res = await fetch(`/api/daily?topic=${encodeURIComponent(finalTopic)}&count=${count}`);
    currentData = await res.json();

    if (currentData.error) {
      document.getElementById('sentence').textContent = '⚠️ 產生失敗：' + currentData.error;
      return;
    }

    currentSentenceIndex = 0;
    renderDay();
    document.getElementById('settings-panel').classList.add('hidden');
    loadHistory();
  } catch (e) {
    document.getElementById('sentence').textContent = '⚠️ 無法連接伺服器';
  } finally {
    genBtn.textContent = '✨ 產生新內容';
    genBtn.disabled = false;
  }
}

function renderDay() {
  document.getElementById('result-area').classList.remove('hidden');
  document.getElementById('history-area').classList.add('hidden');

  if (!currentData || !currentData.sentences) return;

  const theme = document.getElementById('theme');
  theme.innerHTML = currentData.theme
    ? `主題：${currentData.theme}`
    : `主題：${document.getElementById('topic-select').value}`;

  renderSentence(currentSentenceIndex);
  renderNav();
  renderAllVocab();
  renderPracticeButtons();

  document.getElementById('day-badge').textContent =
    `${currentData.sentences.length} 句 | ${currentData.theme || ''}`;
}

function renderSentence(index) {
  const s = currentData.sentences[index];
  if (!s) return;
  document.getElementById('sentence').textContent = s.sentence;
  document.getElementById('translation').textContent = s.translation;
  document.getElementById('sentence-counter').textContent = `${index + 1} / ${currentData.sentences.length}`;
  document.getElementById('grammar-tip').textContent = s.grammar_tip || '';

  const result = getPracticeResult(currentData.dayId, index);
  const statusEl = document.getElementById('practice-status');
  if (result === 'done') {
    statusEl.innerHTML = '✅ 已完成';
    statusEl.style.color = '#16a34a';
  } else if (result === 'again') {
    statusEl.innerHTML = '🔄 待加強';
    statusEl.style.color = '#f39c12';
  } else {
    statusEl.innerHTML = '';
  }

  document.querySelectorAll('.sentence-dot').forEach((dot, i) => {
    const r = getPracticeResult(currentData.dayId, i);
    dot.classList.toggle('active', i === index);
    dot.classList.toggle('done', r === 'done');
    dot.classList.toggle('again', r === 'again');
  });
}

function renderNav() {
  const nav = document.getElementById('sentence-nav');
  nav.innerHTML = '';
  currentData.sentences.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'sentence-dot';
    dot.addEventListener('click', () => {
      currentSentenceIndex = i;
      renderSentence(i);
    });
    nav.appendChild(dot);
  });
}

function renderAllVocab() {
  const list = document.getElementById('vocab-list');
  list.innerHTML = '';
  currentData.sentences.forEach((s, si) => {
    const group = document.createElement('div');
    group.className = 'vocab-group';
    const label = document.createElement('p');
    label.className = 'vocab-group-label';
    label.textContent = `句 ${si + 1}`;
    group.appendChild(label);
    (s.vocabulary || []).forEach(v => {
      const card = document.createElement('div');
      card.className = 'vocab-card';
      card.innerHTML = `<span class="vocab-word">${v.word}</span><span class="vocab-meaning">${v.meaning}</span>`;
      card.addEventListener('click', () => {
        card.classList.toggle('flipped');
        const m = card.querySelector('.vocab-meaning');
        const w = card.querySelector('.vocab-word');
        if (card.classList.contains('flipped')) {
          m.textContent = v.word; w.textContent = v.meaning;
        } else {
          m.textContent = v.meaning; w.textContent = v.word;
        }
      });
      group.appendChild(card);
    });
    list.appendChild(group);
  });
}

function renderPracticeButtons() {
  const container = document.getElementById('practice-buttons');
  const s = currentData.sentences[currentSentenceIndex];
  if (!s) return;

  const result = getPracticeResult(currentData.dayId, currentSentenceIndex);
  container.innerHTML = '';

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn btn-small ' + (result === 'done' ? 'btn-success' : '');
  doneBtn.textContent = '✅ 已完成';
  doneBtn.addEventListener('click', () => {
    savePracticeResult(currentData.dayId, currentSentenceIndex, 'done');
    renderSentence(currentSentenceIndex);
    updateSentenceStats();
  });

  const againBtn = document.createElement('button');
  againBtn.className = 'btn btn-small ' + (result === 'again' ? 'btn-warning' : '');
  againBtn.textContent = '🔄 再練一次';
  againBtn.addEventListener('click', () => {
    savePracticeResult(currentData.dayId, currentSentenceIndex, 'again');
    renderSentence(currentSentenceIndex);
    updateSentenceStats();
  });

  container.appendChild(doneBtn);
  container.appendChild(againBtn);
  updateSentenceStats();
}

function updateSentenceStats() {
  const total = currentData.sentences.length;
  let done = 0, again = 0;
  currentData.sentences.forEach((_, i) => {
    const r = getPracticeResult(currentData.dayId, i);
    if (r === 'done') done++;
    else if (r === 'again') again++;
  });
  document.getElementById('stats').textContent = `✅ ${done}  |  🔄 ${again}  |  ⏳ ${total - done - again}`;
}

function navigateSentence(dir) {
  const idx = currentSentenceIndex + dir;
  if (idx >= 0 && idx < currentData.sentences.length) {
    currentSentenceIndex = idx;
    renderSentence(idx);
  }
}

function playSentence() {
  const text = document.getElementById('sentence').textContent;
  if (!text || text.startsWith('⚠️') || text.startsWith('載入中')) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.8;
  speechSynthesis.speak(utterance);
  utterance.onstart = () => document.getElementById('play-btn').textContent = '🔊 播放中...';
  utterance.onend = () => document.getElementById('play-btn').textContent = '▶ 播放句子';
}

function toggleTranslation() {
  const trans = document.getElementById('translation');
  trans.classList.toggle('hidden');
  document.getElementById('toggle-trans-btn').textContent =
    trans.classList.contains('hidden') ? '顯示中文' : '隱藏中文';
}

function startListening() {
  if (!recognition) {
    document.getElementById('speak-btn').textContent = '⚠️ 不支援語音';
    return;
  }
  if (isListening) { recognition.stop(); return; }
  recognition.start();
  isListening = true;
  document.getElementById('speak-btn').textContent = '⏹ 停止錄音';
  document.getElementById('speak-btn').className = 'btn btn-success';
  document.getElementById('recognition-result').classList.add('hidden');
}

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const sentence = wanakana.toHiragana(document.getElementById('sentence').textContent).replace(/[\s]/g, '');
    const userText = wanakana.toHiragana(transcript).replace(/[\s]/g, '');

    const resultBox = document.getElementById('recognition-result');
    resultBox.classList.remove('hidden');
    document.getElementById('user-speech').textContent = transcript;

    const match = document.getElementById('match-result');
    if (userText === sentence) {
      match.textContent = '✅ 完美！發音正確！';
      match.style.color = '#16a34a';
    } else {
      const sim = simScore(userText, sentence);
      if (sim > 0.6) {
        match.textContent = `👍 不錯！相似度 ${Math.round(sim * 100)}%，再試一次更好！`;
        match.style.color = '#f39c12';
      } else {
        match.textContent = `🔄 相似度 ${Math.round(sim * 100)}%，再聽一次再試試！`;
        match.style.color = '#e67e22';
      }
    }
    document.getElementById('speak-btn').textContent = '🎤 再試一次';
    document.getElementById('speak-btn').className = 'btn btn-warning';
    isListening = false;
  };

  recognition.onerror = () => {
    document.getElementById('speak-btn').textContent = '🎤 開始錄音';
    document.getElementById('speak-btn').className = 'btn btn-primary';
    isListening = false;
  };
}

function simScore(a, b) {
  const l = a.length > b.length ? a : b;
  const s = a.length > b.length ? b : a;
  if (l.length === 0) return 1;
  const d = levenshtein(l, s);
  return (l.length - d) / l.length;
}
function levenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[b.length][a.length];
}

function getPracticeResult(dayId, index) {
  const key = `practice-${dayId}-${index}`;
  return localStorage.getItem(key) || '';
}
function savePracticeResult(dayId, index, result) {
  const key = `practice-${dayId}-${index}`;
  localStorage.setItem(key, result);
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const days = await res.json();
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    const localKeys = Object.keys(localStorage).filter(k => k.startsWith('practice-'));
    const totalDone = localKeys.filter(k => localStorage.getItem(k) === 'done').length;
    document.getElementById('total-done').textContent = `總練習完成：${totalDone} 句`;

    if (days.length === 0) {
      list.innerHTML = '<p class="hint">尚無練習記錄</p>';
      return;
    }

    days.forEach(d => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const date = new Date(d.date);
      const dateStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;

      const localDone = localKeys.filter(k => k.startsWith(`practice-${d.dayId}-`) && localStorage.getItem(k) === 'done').length;
      const localAgain = localKeys.filter(k => k.startsWith(`practice-${d.dayId}-`) && localStorage.getItem(k) === 'again').length;

      item.innerHTML = `
        <span class="history-date">${dateStr}</span>
        <span class="history-topic">${d.topic}</span>
        <span class="history-count">${d.count} 句</span>
        <span class="history-result">✅${localDone} 🔄${localAgain}</span>
      `;
      item.addEventListener('click', () => {
        loadDayFromHistory(d.dayId);
      });
      list.appendChild(item);
    });
  } catch (e) {
    console.log('History load failed');
  }
}

async function loadDayFromHistory(dayId) {
  try {
    const res = await fetch(`/api/load/${dayId}`);
    currentData = await res.json();
    if (currentData.error) return;
    currentSentenceIndex = 0;
    renderDay();
    document.getElementById('history-area').classList.add('hidden');
    document.getElementById('result-area').classList.remove('hidden');
  } catch (e) {}
}

function toggleHistory() {
  const area = document.getElementById('history-area');
  area.classList.toggle('hidden');
  if (!area.classList.contains('hidden')) {
    loadHistory();
    document.getElementById('result-area').classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
