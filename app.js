'use strict';

/* ================= Хранилище ================= */
const STORE_KEY = 'memorizer:v1';
const store = (() => {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { data = {}; }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {} };
  return {
    quiz(id) { return (data[id] ||= { attempts: [], current: null }); },
    save,
  };
})();

/* ================= Утилиты ================= */
const $app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtTime = s => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return [h, m, x].map(n => String(n).padStart(2, '0')).join(':'); };
const fmtDur = s => s < 60 ? `${s} с` : s < 3600 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${Math.floor(s / 3600)} ч ${Math.floor(s / 60) % 60} мин`;
const fmtDate = ts => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const quizById = id => QUIZZES.find(q => q.id === id);

/* Разбор шаблона "оп[е]кун" → сегменты */
function segments(pattern) {
  const out = []; const re = /\[([^\]]+)\]/g; let last = 0, m;
  while ((m = re.exec(pattern))) {
    if (m.index > last) out.push({ text: pattern.slice(last, m.index) });
    out.push({ gap: m[1] });
    last = re.lastIndex;
  }
  if (last < pattern.length) out.push({ text: pattern.slice(last) });
  return out;
}
const PAIRS = { 'а': ['а', 'о'], 'о': ['а', 'о'], 'е': ['е', 'и'], 'и': ['е', 'и'], 'я': ['е', 'я'] };
const optionsFor = letter => PAIRS[letter] || [letter];
const pretty = pattern => esc(pattern).replace(/\[([^\]]+)\]/g, '<b>$1</b>');
// латинская раскладка → русская буква (если забыл переключить)
const LAT = { f: 'а', j: 'о', t: 'е', b: 'и', z: 'я' };

/* ================= Роутинг ================= */
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const [, page, id] = (location.hash.slice(1) || '/').split('/');
  window.scrollTo(0, 0);
  if (page === 'quiz' && quizById(id)) return renderDetail(quizById(id));
  if (page === 'play' && quizById(id)) return renderPlay(quizById(id));
  if (page === 'result' && quizById(id)) return renderResult(quizById(id));
  renderHome();
}
window.addEventListener('hashchange', route);
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

/* ================= Главная ================= */
function renderHome() {
  document.title = 'Memorizer';
  const cards = QUIZZES.map(q => {
    const s = store.quiz(q.id);
    const best = s.attempts.length ? Math.max(...s.attempts.map(a => a.score)) : null;
    const cur = s.current;
    const pct = cur ? Math.round(cur.done.length / q.items.length * 100) : best != null ? Math.round(best / q.items.length * 100) : 0;
    const status = cur ? `В процессе · ${pct}%` : best != null ? `Лучший: ${best} из ${q.items.length}` : 'Ещё не проходили';
    return `
      <button class="quiz-card" data-go="#/quiz/${q.id}">
        <span class="tag">Вставь букву</span>
        <h2>${esc(q.title)}</h2>
        <p class="sub">${esc(q.subtitle)}</p>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="meta"><span>${q.items.length} ${plural(q.items.length, 'слово', 'слова', 'слов')}</span><span>${status}</span></div>
      </button>`;
  }).join('');
  $app.innerHTML = `
    <div class="topbar"><h1>Memorizer</h1></div>
    <div class="grid">
      ${cards}
      <div class="quiz-card soon">
        <span class="tag">Скоро</span>
        <h2>Даты и факты</h2>
        <p class="sub">Вопрос и поле для ввода ответа</p>
      </div>
    </div>`;
}

/* ================= Страница квиза ================= */
function renderDetail(q) {
  document.title = `${q.title} — Memorizer`;
  const s = store.quiz(q.id);
  const n = q.items.length;
  const best = s.attempts.length ? Math.max(...s.attempts.map(a => a.score)) : null;
  const cur = s.current;
  const rows = s.attempts.slice().reverse().map(a => `
    <tr><td>${fmtDate(a.date)}</td><td class="score">${a.score} / ${a.total}</td><td>${fmtDur(a.seconds)}</td><td>${a.rounds}</td></tr>`).join('');

  $app.innerHTML = `
    <a class="back" href="#/">← Все квизы</a>
    <div class="topbar"><h1>Квиз «${esc(q.title)}»</h1></div>
    <div class="detail">
      <div class="card">
        <div class="stats">
          <div class="stat"><div class="k">Слов</div><div class="v">${n}</div></div>
          <div class="stat"><div class="k">Попыток</div><div class="v">${s.attempts.length}</div></div>
          <div class="stat"><div class="k">Лучший результат</div><div class="v">${best != null ? `${best} <small>из ${n}</small>` : '—'}</div></div>
          ${cur ? `<div class="stat"><div class="k">Текущая попытка</div><div class="v">${cur.done.length} <small>из ${n}</small></div></div>` : ''}
        </div>
        <div class="actions">
          ${cur
            ? `<button class="btn btn-primary" data-go="#/play/${q.id}">Продолжить</button>
               <button class="btn btn-soft" data-restart>Пройти заново</button>`
            : `<button class="btn btn-primary" data-restart>${s.attempts.length ? 'Пройти заново' : 'Начать'}</button>`}
        </div>
        <p class="empty" style="margin:22px 0 0">Неверные ответы возвращаются в конец в случайном порядке, пока не ответишь на все. В счёт идут только слова, отвеченные верно с первого раза.</p>
      </div>
      <div class="card">
        <h3 class="section-title">Прошлые попытки</h3>
        ${rows ? `<table class="attempts"><tr><th>Дата</th><th>Счёт</th><th>Время</th><th>Кругов</th></tr>${rows}</table>` : '<p class="empty">Пока нет завершённых попыток.</p>'}
      </div>
      <div class="card" style="grid-column:1/-1">
        <details>
          <summary>Список слов (${n})</summary>
          <ul class="words">${q.items.map(i => `<li>${pretty(i.pattern)}</li>`).join('')}</ul>
        </details>
      </div>
    </div>`;

  $app.querySelectorAll('[data-restart]').forEach(b => b.onclick = () => {
    if (s.current && s.current.done.length > 0 && !confirm('Начать заново? Текущий прогресс будет сброшен.')) return;
    s.current = newSession(q); store.save(); go(`#/play/${q.id}`);
  });
}

function newSession(q) {
  return { queue: shuffle(q.items.map(i => i.id)), retry: [], wrong: [], done: [], round: 1, seconds: 0, answered: 0 };
}

/* ================= Игра ================= */
function renderPlay(q) {
  const s = store.quiz(q.id);
  if (!s.current) { s.current = newSession(q); store.save(); }
  const st = s.current;
  const byId = Object.fromEntries(q.items.map(i => [i.id, i]));
  // если список слов изменился — выкинуть несуществующие id
  st.queue = st.queue.filter(id => byId[id]);
  st.retry = st.retry.filter(id => byId[id]);
  if (!st.queue.length && !st.retry.length) return finish();

  document.title = `${q.title} — Memorizer`;
  let item, segs, fills, active, checked, paused = false;

  $app.innerHTML = `
    <div class="topbar"><h1>Квиз «${esc(q.title)}»</h1><button class="link" data-exit>Завершить</button></div>
    <div class="play">
      <section class="card" id="task"></section>
      <aside class="card side">
        ${MASCOT}
        <div class="timer-row">
          ${STOPWATCH}
          <div><div class="t-k">Время</div><div class="t-v" id="time">${fmtTime(st.seconds)}</div></div>
          <span class="spacer"></span>
          <button class="icon-btn" id="pause" title="Пауза">${ICON_PAUSE}</button>
        </div>
        <div class="progress-row">
          <div><div class="k">Пройдено</div><div class="v" id="pct">0%</div></div>
          <div class="bar"><i id="bar"></i></div>
          <div style="text-align:right"><div class="k">Выполнено</div><div class="v"><span id="done">0</span> <small>из ${q.items.length}</small></div></div>
        </div>
        <div class="side-stats"><span>Круг <b id="round">1</b></span><span>Ошибок: <b id="errs">0</b></span><span>Осталось: <b id="left">0</b></span></div>
        <button class="btn btn-soft btn-wide next-btn" id="skip">Следующая задача</button>
      </aside>
    </div>`;

  const $task = document.getElementById('task');
  const updateSide = () => {
    const pct = Math.round(st.done.length / q.items.length * 100);
    document.getElementById('pct').textContent = pct + '%';
    document.getElementById('bar').style.width = pct + '%';
    document.getElementById('done').textContent = st.done.length;
    document.getElementById('round').textContent = st.round;
    document.getElementById('errs').textContent = st.wrong.length;
    document.getElementById('left').textContent = st.queue.length + st.retry.length;
  };

  function loadItem() {
    item = byId[st.queue[0]];
    segs = segments(item.pattern);
    fills = segs.map(() => null);
    active = segs.findIndex(x => x.gap);
    checked = null;
    drawTask();
    updateSide();
  }

  function drawTask() {
    const gapIdx = segs.map((x, i) => x.gap ? i : -1).filter(i => i >= 0);
    const word = segs.map((x, i) => {
      if (!x.gap) return esc(x.text);
      let cls = 'gap', inner = fills[i] || '_';
      if (checked) {
        const ok = fills[i] === x.gap;
        cls += ok ? ' ok' : ' bad';
        if (!ok) inner = `${esc(fills[i])}<span class="fix">${esc(x.gap)}</span>`;
      } else {
        if (!fills[i]) cls += ' empty';
        if (i === active) cls += ' active';
      }
      return `<span class="${cls}" data-gap="${i}">${inner}</span>`;
    }).join('');
    const opts = active >= 0 ? optionsFor(segs[active].gap) : [];
    const allFilled = gapIdx.every(i => fills[i]);
    const isRetry = st.round > 1;

    let bottom;
    if (checked) {
      const rel = item.related ? `<span class="rel">${esc(item.related)}</span>` : '';
      bottom = `
        <div class="feedback ${checked}">${checked === 'ok' ? 'Верно!' : `Неверно — правильно: ${esc(item.id)}`}${rel}</div>
        <button class="btn btn-primary" id="next">Следующая задача</button>`;
    } else {
      bottom = `<button class="btn btn-primary" id="answer" ${allFilled ? '' : 'disabled'}>Ответить</button>`;
    }

    $task.innerHTML = `
      <div class="task-head">
        <b>Задача #${st.answered + 1}</b>
        <span class="st">${gapIdx.length > 1 ? `${gapIdx.length} пропуска` : '1 пропуск'}</span>
        ${isRetry ? `<span class="round-pill">Повтор ошибок · круг ${st.round}</span>` : ''}
      </div>
      <p class="question">Вставьте пропущенную безударную гласную в корне.</p>
      <div class="word">${word}</div>
      ${checked ? '' : `<p class="choose">Выберите ответ:</p>
      <div class="options">${opts.map((o, k) => `
        <button class="opt ${fills[active] === o ? 'sel' : ''}" data-opt="${o}">${o}<span class="kbd">${k + 1}</span><span class="radio"></span></button>`).join('')}
      </div>`}
      <div class="answer-row">${bottom}</div>`;

    $task.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => choose(b.dataset.opt));
    $task.querySelectorAll('[data-gap]').forEach(g => g.onclick = () => { if (!checked) { active = +g.dataset.gap; drawTask(); } });
    const a = document.getElementById('answer'); if (a) a.onclick = check;
    const n = document.getElementById('next'); if (n) { n.onclick = next; n.focus({ preventScroll: true }); }
  }

  function choose(letter) {
    if (checked || active < 0 || paused) return;
    fills[active] = letter;
    // перейти к следующему незаполненному пропуску
    const order = segs.map((x, i) => x.gap ? i : -1).filter(i => i >= 0);
    const nextEmpty = order.find(i => i > active && !fills[i]) ?? order.find(i => !fills[i]);
    if (nextEmpty !== undefined) active = nextEmpty;
    drawTask();
  }

  function check() {
    if (checked || paused) return;
    const gaps = segs.map((x, i) => x.gap ? i : -1).filter(i => i >= 0);
    if (!gaps.every(i => fills[i])) return;
    const ok = gaps.every(i => fills[i] === segs[i].gap);
    checked = ok ? 'ok' : 'bad';
    const id = st.queue.shift();
    st.answered++;
    if (ok) st.done.push(id);
    else { st.retry.push(id); if (!st.wrong.includes(id)) st.wrong.push(id); }
    store.save();
    drawTask(); updateSide();
    if (ok) autoNext = setTimeout(next, 650);
  }

  let autoNext = null;
  function next() {
    clearTimeout(autoNext); autoNext = null;
    if (!checked) return;
    if (!st.queue.length) {
      if (!st.retry.length) return finish();
      st.queue = shuffle(st.retry); st.retry = []; st.round++;
      store.save();
    }
    loadItem();
  }

  function finish() {
    const attempt = { date: Date.now(), score: q.items.length - st.wrong.length, total: q.items.length, seconds: st.seconds, rounds: st.round, wrong: st.wrong.slice() };
    s.attempts.push(attempt);
    s.current = null; s.last = attempt;
    store.save();
    go(`#/result/${q.id}`);
  }

  // Таймер
  const tick = setInterval(() => {
    if (paused || document.hidden) return;
    st.seconds++;
    const t = document.getElementById('time'); if (t) t.textContent = fmtTime(st.seconds);
    if (st.seconds % 5 === 0) store.save();
  }, 1000);

  const pauseBtn = document.getElementById('pause');
  function setPaused(p) {
    paused = p;
    pauseBtn.innerHTML = p ? ICON_PLAY : ICON_PAUSE;
    const veil = document.querySelector('.paused-veil');
    if (p && !veil) {
      const v = document.createElement('div');
      v.className = 'paused-veil';
      v.innerHTML = `<div class="card"><h2>Пауза</h2><button class="btn btn-primary" id="resume">Продолжить</button></div>`;
      document.body.appendChild(v);
      v.querySelector('#resume').onclick = () => setPaused(false);
    } else if (!p && veil) veil.remove();
  }
  pauseBtn.onclick = () => setPaused(!paused);

  // «Следующая задача» в боковой панели: до ответа — пропустить слово (уходит в конец круга без штрафа)
  document.getElementById('skip').onclick = () => {
    if (checked) return next();
    if (paused) return;
    if (st.queue.length > 1) { st.queue.push(st.queue.shift()); store.save(); loadItem(); }
  };

  $app.querySelector('[data-exit]').onclick = () => { store.save(); go(`#/quiz/${q.id}`); };

  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (paused) { if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); setPaused(false); } return; }
    if (e.key === 'Enter') { e.preventDefault(); checked ? next() : check(); return; }
    if (checked) return;
    const opts = active >= 0 ? optionsFor(segs[active].gap) : [];
    let k = e.key.toLowerCase();
    if (/^[1-9]$/.test(k) && opts[+k - 1]) return choose(opts[+k - 1]);
    k = LAT[k] || k;
    if (opts.includes(k)) choose(k);
  };
  document.addEventListener('keydown', onKey);

  cleanup = () => { clearInterval(tick); clearTimeout(autoNext); document.removeEventListener('keydown', onKey); document.querySelector('.paused-veil')?.remove(); store.save(); };

  loadItem();
}

/* ================= Результат ================= */
function renderResult(q) {
  const s = store.quiz(q.id);
  const a = s.last;
  if (!a) return go(`#/quiz/${q.id}`);
  const byId = Object.fromEntries(q.items.map(i => [i.id, i]));
  const pct = Math.round(a.score / a.total * 100);
  const msg = pct === 100 ? 'Идеально — всё с первого раза!' : pct >= 85 ? 'Отлично!' : pct >= 60 ? 'Хорошо, но есть над чем поработать.' : 'Стоит повторить ещё раз.';
  $app.innerHTML = `
    <div class="topbar"><h1>Квиз «${esc(q.title)}»</h1><a class="link" href="#/">Все квизы</a></div>
    <div class="card result">
      <p style="margin:0">С первого раза</p>
      <div class="big">${a.score} <small>из ${a.total}</small></div>
      <p>${msg}<br>Время: ${fmtDur(a.seconds)} · Кругов: ${a.rounds}</p>
      ${a.wrong.length ? `<h3 class="section-title" style="margin-top:28px">Ошибки (${a.wrong.length})</h3>
        <div class="mistakes">${a.wrong.map(id => `<span>${byId[id] ? pretty(byId[id].pattern) : esc(id)}</span>`).join('')}</div>` : ''}
      <div class="actions">
        <button class="btn btn-primary" data-restart>Пройти заново</button>
        <button class="btn btn-soft" data-go="#/quiz/${q.id}">К квизу</button>
      </div>
    </div>`;
  $app.querySelector('[data-restart]').onclick = () => { s.current = newSession(q); store.save(); go(`#/play/${q.id}`); };
}

/* Делегирование для data-go */
$app.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if (t) go(t.dataset.go);
});

/* ================= Иконки ================= */
const ICON_PAUSE = `<svg width="20" height="22" viewBox="0 0 20 22"><rect x="3" y="1" width="4" height="20" rx="1" fill="#13161c"/><rect x="13" y="1" width="4" height="20" rx="1" fill="#13161c"/></svg>`;
const ICON_PLAY = `<svg width="20" height="22" viewBox="0 0 20 22"><path d="M4 2 L18 11 L4 20 Z" fill="#13161c"/></svg>`;
const STOPWATCH = `<svg class="stopwatch" width="42" height="46" viewBox="0 0 42 46">
  <rect x="17" y="1" width="8" height="5" rx="1.5" fill="#7cc4f0"/>
  <circle cx="21" cy="26" r="18" fill="#bfe3f8"/><circle cx="21" cy="26" r="13.5" fill="#fff"/>
  <path d="M21 26 L15 31" stroke="#0a97e6" stroke-width="3" stroke-linecap="round"/><circle cx="21" cy="26" r="2.4" fill="#0a97e6"/></svg>`;
const MASCOT = `<svg class="mascot" viewBox="0 0 230 190" aria-hidden="true">
  <defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5bb8f2"/><stop offset="1" stop-color="#1a5fc4"/></linearGradient></defs>
  <path d="M28 20 L200 6 L222 170 L14 182 Z" fill="url(#mg)"/>
  <path d="M40 160 L95 70 L120 110 L150 60 L205 160 Z" fill="#9fd4f6" opacity=".35"/>
  <g transform="translate(115 98)">
    <path d="M-48 46 Q0 64 48 46 L44 -10 Q0 -2 -44 -10 Z" fill="#e9f5fd"/>
    <path d="M0 -6 L0 52" stroke="#5aa9e6" stroke-width="2"/>
    <path d="M-40 4 Q-20 0 -6 6 M-40 18 Q-20 14 -6 20 M-40 32 Q-20 28 -6 34 M40 4 Q20 0 6 6 M40 18 Q20 14 6 20 M40 32 Q20 28 6 34" stroke="#a7cff0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="0" cy="-34" r="30" fill="#e9f5fd"/>
    <circle cx="-11" cy="-38" r="9" fill="#13325f"/><circle cx="11" cy="-38" r="9" fill="#13325f"/>
    <circle cx="-8" cy="-41" r="3" fill="#fff"/><circle cx="14" cy="-41" r="3" fill="#fff"/>
    <path d="M-10 -22 Q0 -14 10 -22" stroke="#13325f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M-26 -58 L-18 -74 L-10 -60 M26 -58 L18 -74 L10 -60" fill="#e9f5fd" stroke="#e9f5fd" stroke-width="4" stroke-linejoin="round"/>
  </g>
  <circle cx="44" cy="40" r="5" fill="#bfe3f8"/><circle cx="196" cy="34" r="7" fill="#bfe3f8"/><circle cx="190" cy="140" r="4" fill="#bfe3f8"/>
</svg>`;

route();
