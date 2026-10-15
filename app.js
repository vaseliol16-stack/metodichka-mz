'use strict';

(() => {
  // Сайт нельзя встроить в чужую страницу (защита от подмены кликов).
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }

  const CONF = window.MZ_CONFIG || {};
  const CLIENT_ITERATIONS = 600000;               // PBKDF2 в браузере (рекомендация OWASP)
  const SALT_PREFIX = 'mz-metodichka:v2:';
  const NICK_RE = /^[A-Z][a-z]{1,23}_[A-Z][a-z]{1,23}$/;
  const ID_RE = /^[a-z0-9-]{1,40}$/;
  const RANK = { user: 1, senior: 2, leader: 3, admin: 4 };
  const ROLE_TITLE = { user: 'Пользователь', senior: 'Старший состав', leader: 'Лидер', admin: 'admin' };

  // ===================== Иконки (только константы) =====================
  const ICON = {
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 0 0 16c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.5 1.7-1.5H17a3 3 0 0 0 3-3c0-4-3.6-7.2-8-7.2z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.8" r="1"/><circle cx="15.2" cy="8.6" r="1"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4"/><path d="M14 8l4 4-4 4M18 12H9"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    caret: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    bars: '<svg viewBox="0 0 24 24"><path d="M6 20v-6M12 20V8M18 20V4"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3.5 22 20H2z" class="fill"/><path d="M12 10v4.5M12 17.2v.1" class="ink"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>'
  };
  const icon = (name, cls) => { const s = document.createElement('span'); s.className = 'ico' + (cls ? ' ' + cls : ''); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICON[name]; return s; };

  // ===================== Мелкие помощники =====================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Создаёт элемент. Текст всегда вставляется как текст, не как HTML. */
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k instanceof Node ? k : String(k));
    return n;
  }

  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  };
  const fmtDate = ms => {
    if (!ms) return '—';
    const d = new Date(Number(ms));
    return isNaN(d) ? '—' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const rank = role => RANK[role] || 0;
  const roleTitle = role => ROLE_TITLE[role] || role;
  const initials = nick => String(nick || '?').split('_').map(p => p[0] || '').join('').slice(0, 2);

  const store = {
    get(k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v, persist) { try { this.del(k); (persist ? localStorage : sessionStorage).setItem(k, v); } catch (_) { /* хранилище недоступно */ } },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (_) { /* ничего */ } },
    isPersistent(k) { try { return !!localStorage.getItem(k); } catch (_) { return false; } }
  };
  const prefs = {
    get(k, d) { try { const v = localStorage.getItem('mz:' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('mz:' + k, JSON.stringify(v)); } catch (_) { /* ничего */ } }
  };

  // ===================== Состояние =====================
  const S = {
    token: null, user: null,
    sections: [], byId: new Map(), site: { cities: [], tags: [] }, depts: [],
    studied: new Set(), fav: new Set(), news: [], pending: 0,
    vars: {}, tabs: new Map(), live: [], genderBtns: [],
    index: [], showDetails: false, pendingReveal: null,
    staff: null, staffTab: 'requests', staffOpen: null, staffFilter: { q: '', dept: '', role: '', status: '' }
  };
  const me = () => S.user || { role: 'user' };
  const can = role => rank(me().role) >= rank(role);

  // ===================== Связь с сервером =====================
  const apiConfigured = () => typeof CONF.API_URL === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(CONF.API_URL);

  async function api(action, payload = {}, auth = true) {
    if (!apiConfigured()) throw new Error('Сайт не подключён к серверу: укажите API_URL в config.js');
    const body = Object.assign({}, payload, { action });
    if (auth) body.token = S.token;
    let res;
    try {
      res = await fetch(CONF.API_URL, {
        method: 'POST',
        body: JSON.stringify(body),          // text/plain — без лишнего CORS-запроса
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        referrerPolicy: 'no-referrer'
      });
    } catch (_) {
      throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте снова.');
    }
    let data;
    try { data = await res.json(); } catch (_) { throw new Error('Сервер ответил не так, как ожидалось. Проверьте развёртывание Apps Script.'); }
    if (!data || data.ok !== true) {
      const msg = (data && typeof data.error === 'string') ? data.error : 'Неизвестная ошибка';
      if (data && data.code === 'AUTH' && auth) signOutLocal(msg);
      const err = new Error(msg); err.code = data && data.code; throw err;
    }
    return data.data;
  }

  /** PBKDF2-SHA256 в браузере: пароль никогда не уходит в сеть в открытом виде. */
  async function clientHash(nick, password) {
    if (!window.crypto || !crypto.subtle) throw new Error('Браузер не поддерживает шифрование. Откройте сайт по https.');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT_PREFIX + nick.toLowerCase()), iterations: CLIENT_ITERATIONS },
      key, 256);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  }

  function checkNewPassword(nick, p1, p2) {
    if (p1.length < 10) return 'Пароль должен быть не короче 10 символов';
    if (p1.length > 128) return 'Пароль слишком длинный';
    const parts = String(nick || '').toLowerCase().split('_').filter(x => x.length > 2);
    if (parts.some(p => p1.toLowerCase().includes(p))) return 'Пароль не должен содержать ваш ник';
    if (/^(.)\1+$/.test(p1) || /^(0123456789|1234567890|qwertyuiop|йцукенгшщз|password)/i.test(p1)) return 'Пароль слишком простой';
    if (p1 !== p2) return 'Пароли не совпадают';
    return '';
  }

  // ===================== Вход, регистрация, сброс =====================
  function formMsg(form, text, ok) {
    const m = $('.form__msg', form);
    m.textContent = text || '';
    m.classList.toggle('is-ok', !!ok);
  }
  function formBusy(form, busy, label) {
    const btn = $('button[type=submit]', form);
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.disabled = busy;
    $$('input,select,textarea', form).forEach(i => { i.disabled = busy; });
  }

  function switchTab(which) {
    const forms = { login: $('#loginForm'), reg: $('#regForm'), reset: $('#resetForm') };
    $('#tabLogin').setAttribute('aria-selected', String(which === 'login'));
    $('#tabReg').setAttribute('aria-selected', String(which === 'reg'));
    $('.seg').hidden = which === 'reset';
    for (const [k, f] of Object.entries(forms)) f.hidden = k !== which;
    $('input[name=nick]', forms[which]).focus();
  }

  async function onLogin(e) {
    e.preventDefault();
    const f = e.currentTarget, el = f.elements;
    const nick = el.nick.value.trim(), pass = el.password.value;
    if (!NICK_RE.test(nick)) return formMsg(f, 'Ник — в формате Имя_Фамилия латиницей, например Vasilii_Sokolov');
    if (!pass) return formMsg(f, 'Введите пароль');
    formMsg(f, '');
    formBusy(f, true, 'Шифруем пароль…');
    try {
      const ch = await clientHash(nick, pass);
      $('button[type=submit]', f).textContent = 'Входим…';
      const d = await api('login', { nick, clientHash: ch, remember: el.remember.checked }, false);
      el.password.value = '';
      S.token = d.token;
      store.set('mz:token', d.token, el.remember.checked);
      formBusy(f, false);
      await start();
    } catch (err) {
      formBusy(f, false);
      formMsg(f, err.message);
    }
  }

  async function onRegister(e) {
    e.preventDefault();
    const f = e.currentTarget, el = f.elements;
    const nick = el.nick.value.trim(), code = el.code.value.trim();
    if (!NICK_RE.test(nick)) return formMsg(f, 'Ник — в формате Имя_Фамилия латиницей, например Vasilii_Sokolov');
    if (!code) return formMsg(f, 'Введите код доступа');
    const problem = checkNewPassword(nick, el.password.value, el.password2.value);
    if (problem) return formMsg(f, problem);
    formMsg(f, '');
    formBusy(f, true, 'Шифруем пароль…');
    try {
      const ch = await clientHash(nick, el.password.value);
      $('button[type=submit]', f).textContent = 'Отправляем…';
      const d = await api('register', { nick, code, clientHash: ch }, false);
      formBusy(f, false);
      f.reset();
      formMsg(f, d.message, true);
      $('#loginForm').elements.nick.value = nick;
    } catch (err) {
      formBusy(f, false);
      formMsg(f, err.message);
    }
  }

  async function onReset(e) {
    e.preventDefault();
    const f = e.currentTarget, el = f.elements;
    const nick = el.nick.value.trim(), code = el.code.value.trim();
    if (!NICK_RE.test(nick)) return formMsg(f, 'Ник — в формате Имя_Фамилия латиницей, например Vasilii_Sokolov');
    if (!code) return formMsg(f, 'Введите код сброса');
    const problem = checkNewPassword(nick, el.password.value, el.password2.value);
    if (problem) return formMsg(f, problem);
    formMsg(f, '');
    formBusy(f, true, 'Шифруем пароль…');
    try {
      const ch = await clientHash(nick, el.password.value);
      $('button[type=submit]', f).textContent = 'Сохраняем…';
      const d = await api('resetPassword', { nick, code, clientHash: ch }, false);
      formBusy(f, false);
      f.reset();
      switchTab('login');
      $('#loginForm').elements.nick.value = nick;
      formMsg($('#loginForm'), d.message, true);
      $('#loginForm').elements.password.focus();
    } catch (err) {
      formBusy(f, false);
      formMsg(f, err.message);
    }
  }

  function showAuth(message) {
    $('#boot').hidden = true;
    $('#app').hidden = true;
    $('#auth').hidden = false;
    switchTab('login');
    if (!apiConfigured()) formMsg($('#loginForm'), 'Сайт ещё не подключён к серверу: укажите API_URL в config.js');
    else formMsg($('#loginForm'), message || '');
  }

  function signOutLocal(message) {
    Object.assign(S, { token: null, user: null, sections: [], news: [], pending: 0, index: [], live: [], staff: null, staffOpen: null });
    S.byId.clear(); S.studied.clear(); S.fav.clear(); S.tabs.clear(); S.vars = {};
    store.del('mz:token');
    $('#view').replaceChildren();
    $('#nav').replaceChildren();
    closePopover(); closeSearch();
    history.replaceState(null, '', location.pathname);
    showAuth(message);
  }

  async function signOut() {
    const token = S.token;
    signOutLocal('');
    if (token && apiConfigured()) {
      try { await fetch(CONF.API_URL, { method: 'POST', body: JSON.stringify({ action: 'logout', token }), credentials: 'omit' }); } catch (_) { /* не важно */ }
    }
  }

  // ===================== Запуск =====================
  async function start() {
    $('#auth').hidden = true;
    $('#boot').hidden = false;
    $('#bootText').textContent = 'Загружаем методичку…';
    let d;
    try { d = await api('bootstrap'); }
    catch (err) { if (err.code !== 'AUTH') signOutLocal(err.message); return; }
    S.user = d.user;
    S.news = Array.isArray(d.news) ? d.news : [];
    S.depts = Array.isArray(d.depts) ? d.depts : [];
    S.pending = Number(d.pending) || 0;
    S.site = { cities: (d.site && d.site.cities) || [], tags: (d.site && d.site.tags) || [] };
    S.sections = (d.sections || []).filter(s => s && ID_RE.test(s.id) && !['home', 'profile', 'staff'].includes(s.id));
    S.byId = new Map(S.sections.map(s => [s.id, s]));
    S.studied = new Set((d.user.studied || []).filter(id => S.byId.has(id)));
    S.fav = new Set((d.user.favorites || []).filter(id => S.byId.has(id)));
    buildIndex();
    renderShell();
    $('#boot').hidden = true;
    $('#app').hidden = false;
    render();
  }

  function renderShell() {
    const u = S.user;
    $('#siteTitle').textContent = CONF.SITE_TITLE || 'Методичка МЗ';
    document.title = CONF.SITE_TITLE || 'Методичка МЗ';
    $('#userNick').textContent = u.nick;
    const badge = $('#userBadge');
    badge.textContent = roleTitle(u.role) + (u.dept ? ' ' + u.dept : '');
    badge.className = 'badge badge--' + u.role;
    $('#avatar').textContent = initials(u.nick);
    renderNav();
    updateNewsDot();
  }

  function navLink(id, emoji, title, extra) {
    return h('a', { class: 'nav__link', href: '#' + id, 'data-route': id },
      h('span', { class: 'nav__emoji', 'aria-hidden': 'true', text: emoji }),
      h('span', { class: 'nav__text', text: title }),
      extra || null,
      icon('chevron', 'nav__chev'));
  }

  function renderNav() {
    const nav = $('#nav');
    nav.replaceChildren();
    const groups = new Map();
    for (const s of S.sections) { const g = s.group || 'Разделы'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); }
    let first = true;
    for (const [name, list] of groups) {
      nav.append(h('p', { class: 'nav__group', text: name }));
      if (first) { nav.append(navLink('home', '🏠', 'Главная')); first = false; }
      list.forEach(s => nav.append(navLink(s.id, s.icon || '📄', s.title,
        S.studied.has(s.id) ? h('span', { class: 'nav__done', title: 'Изучено' }, icon('check')) : null)));
    }
    if (first) nav.append(navLink('home', '🏠', 'Главная'));
    if (can('senior')) {
      nav.append(h('p', { class: 'nav__group', text: 'Руководство' }));
      nav.append(navLink('staff', '🛡️', 'Управление',
        S.pending ? h('span', { class: 'nav__count', title: 'Новые заявки', text: String(S.pending) }) : null));
    }
    markActiveNav();
  }

  function markActiveNav() {
    const r = route();
    $$('.nav__link').forEach(a => {
      const on = a.dataset.route === r;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ===================== Маршруты =====================
  function route() {
    let r = '';
    try { r = decodeURIComponent(location.hash.slice(1)); } catch (_) { r = ''; }
    if (r === 'profile') return r;
    if (r === 'staff' && can('senior')) return r;
    if (S.byId.has(r)) return r;
    return 'home';
  }

  function render() {
    if (!S.user) return;
    closePopover();
    closeMenu();
    S.live = []; S.genderBtns = [];
    const r = route();
    markActiveNav();
    let page;
    if (r === 'home') page = pageHome();
    else if (r === 'profile') page = pageProfile();
    else if (r === 'staff') page = pageStaff();
    else { page = pageSection(S.byId.get(r)); rememberVisit(r); }
    $('#view').replaceChildren(page);
    if (S.pendingReveal) { const key = S.pendingReveal; S.pendingReveal = null; requestAnimationFrame(() => reveal(key)); }
    else window.scrollTo(0, 0);
  }

  function pageFrame(title, actions, ...body) {
    return h('article', { class: 'page' },
      h('header', { class: 'page__head' },
        h('h1', { class: 'page__title', text: title }),
        actions ? h('div', { class: 'page__actions' }, actions) : null),
      ...body);
  }

  // ===================== Главная =====================
  function pageHome() {
    const total = S.sections.length;
    const done = S.sections.filter(s => S.studied.has(s.id)).length;
    const left = total - done;

    const hero = h('div', { class: 'hero' },
      h('p', { class: 'hero__title', text: 'Министерство Здравоохранения' }),
      h('p', { class: 'hero__sub', text: 'Методическое пособие' }),
      h('p', { class: 'hero__cap', text: 'Справочно-информационный портал для сотрудников' + (CONF.SERVER_NAME ? ' ' + CONF.SERVER_NAME : '') }));

    const warn = h('section', { class: 'alert', 'aria-labelledby': 'alertTitle' },
      icon('warn', 'alert__ico'),
      h('div', null,
        h('h2', { class: 'alert__title', id: 'alertTitle', text: 'Важное уточнение' }),
        h('ul', { class: 'alert__list' },
          h('li', { text: 'Данная методичка может содержать неточности или устаревшую информацию' }),
          h('li', { text: 'Материалы служат основой для изучения, но не являются окончательным источником' }),
          h('li', { text: 'При возникновении спорных вопросов обращайтесь к актуальным регламентам' }),
          h('li', { text: 'Администрация не несёт ответственности за возможные ошибки в содержании' }))));

    // Продолжить чтение и избранное
    const last = prefs.get(histKey(), []).map(id => S.byId.get(id)).filter(Boolean)[0];
    const favs = Array.from(S.fav).map(id => S.byId.get(id)).filter(Boolean);
    const quick = (last || favs.length) ? h('div', { class: 'quick' },
      last ? h('a', { class: 'quick__card quick__card--resume', href: '#' + last.id },
        h('span', { class: 'quick__label' }, icon('play'), 'Продолжить чтение'),
        h('span', { class: 'quick__title' }, h('span', { 'aria-hidden': 'true', text: last.icon || '📄' }), last.title)) : null,
      favs.length ? h('div', { class: 'quick__card' },
        h('span', { class: 'quick__label' }, icon('bookmark'), 'Избранное'),
        h('ul', { class: 'quick__list' }, favs.slice(0, 5).map(s => h('li', null,
          h('a', { href: '#' + s.id }, h('span', { 'aria-hidden': 'true', text: s.icon || '📄' }), s.title))))) : null) : null;

    const detailsBtn = h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': String(S.showDetails) },
      S.showDetails ? 'Скрыть' : 'Подробнее', icon('bars'));
    detailsBtn.addEventListener('click', () => { S.showDetails = !S.showDetails; render(); });

    const pct = total ? Math.round(done / total * 100) : 0;
    const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': 'Изучено разделов' },
      h('span', { class: 'bar__fill' }));
    bar.firstChild.style.width = pct + '%';

    const tip = left > 0
      ? h('p', { class: 'progress__tip' }, 'Осталось ' + plural(left, 'раздел', 'раздела', 'разделов') + ': ', h('strong', { text: String(left) }),
          '. Отмечай разделы кнопкой «', icon('check', 'ico--inline'), h('strong', { text: 'Отметить' }), '» вверху страницы.')
      : h('p', { class: 'progress__tip is-done' }, total ? 'Все разделы изучены. Отличная работа!' : 'Разделов пока нет.');

    const progress = h('section', { class: 'progress', 'aria-labelledby': 'progTitle' },
      h('div', { class: 'progress__head' },
        icon('target', 'progress__ico'),
        h('div', null,
          h('h2', { class: 'progress__title', id: 'progTitle', text: 'Прогресс обучения' }),
          h('p', { class: 'progress__sub', text: 'Отслеживайте свой прогресс' })),
        detailsBtn),
      tip,
      h('div', { class: 'progress__count' },
        h('span', { text: 'Изучено разделов' }),
        h('span', { class: 'progress__num' }, h('strong', { text: String(done) }), ' / ' + total)),
      bar,
      h('p', { class: 'progress__pct', text: pct + '% завершено' }),
      S.showDetails ? h('ul', { class: 'progress__list' },
        S.sections.map(s => h('li', { class: S.studied.has(s.id) ? 'is-done' : '' },
          h('a', { href: '#' + s.id },
            h('span', { 'aria-hidden': 'true', text: s.icon || '📄' }),
            h('span', { text: s.title }),
            h('span', { class: 'progress__state', text: S.studied.has(s.id) ? 'Изучено' : 'Не изучено' }))))) : null);

    return pageFrame('Главная', null, hero, warn, quick, progress);
  }

  // ===================== Раздел =====================
  function pageSection(sec) {
    const studied = S.studied.has(sec.id), fav = S.fav.has(sec.id);
    const bStudied = h('button', { class: 'chip chip--ok' + (studied ? ' is-on' : ''), type: 'button', 'aria-pressed': String(studied) },
      h('span', { class: 'chip__box', 'aria-hidden': 'true' }, icon('check')), studied ? 'Изучено' : 'Отметить');
    bStudied.addEventListener('click', () => {
      const on = !S.studied.has(sec.id);
      if (on) S.studied.add(sec.id); else S.studied.delete(sec.id);
      saveProgress(); renderNav();
      bStudied.classList.toggle('is-on', on); bStudied.setAttribute('aria-pressed', String(on));
      bStudied.lastChild.textContent = on ? 'Изучено' : 'Отметить';
      if (on) toast('Раздел «' + sec.title + '» отмечен как изученный');
    });
    const bFav = h('button', { class: 'chip' + (fav ? ' is-on' : ''), type: 'button', 'aria-pressed': String(fav) },
      icon('bookmark'), h('span', { text: fav ? 'В избранном' : 'В избранное' }));
    bFav.addEventListener('click', () => {
      const on = !S.fav.has(sec.id);
      if (on) S.fav.add(sec.id); else S.fav.delete(sec.id);
      saveProgress();
      bFav.classList.toggle('is-on', on); bFav.setAttribute('aria-pressed', String(on));
      bFav.lastChild.textContent = on ? 'В избранном' : 'В избранное';
    });

    const body = h('div', { class: 'doc' });
    if (Array.isArray(sec.blocks) && sec.blocks.length) body.append(renderBlocks(sec.blocks, sec.id + ':'));
    else body.append(stub());

    const i = S.sections.indexOf(sec);
    const prev = S.sections[i - 1], next = S.sections[i + 1];
    const pager = h('nav', { class: 'pager', 'aria-label': 'Соседние разделы' },
      prev ? h('a', { class: 'pager__link', href: '#' + prev.id }, h('small', { text: 'Предыдущий' }), (prev.icon || '') + ' ' + prev.title) : h('span'),
      next ? h('a', { class: 'pager__link pager__link--next', href: '#' + next.id }, h('small', { text: 'Следующий' }), (next.icon || '') + ' ' + next.title) : h('span'));

    return pageFrame(sec.title, [bStudied, bFav], body, pager);
  }

  const stub = () => h('p', { class: 'stub' }, 'Материал готовится и скоро появится.',
    can('admin') ? h('small', { text: 'Заполните этот блок в Content.gs.' }) : null);

  // ===================== Подстановки в биндах =====================
  const gender = who => prefs.get('gender:' + who, 'm') === 'f' ? 'f' : 'm';
  const cityOf = () => { const c = prefs.get('city', ''); return S.site.cities.includes(c) ? c : (S.site.cities[0] || ''); };
  const tagOf = () => { const t = prefs.get('tag', ''); return S.site.tags.some(x => x.tag === t) ? t : ((S.site.tags[0] || {}).tag || ''); };

  function varOf(k) {
    switch (k) {
      case 'tag': return tagOf();
      case 'city': return cityOf();
      case 'name': return S.user ? S.user.nick.replace('_', ' ') : '';
      case 'dept': return S.user ? S.user.dept : '';
      default: {
        if (!Object.prototype.hasOwnProperty.call(S.vars, k)) return null;
        const v = String(S.vars[k]).trim();
        return v || '___';
      }
    }
  }

  function fill(tpl) {
    return String(tpl == null ? '' : tpl)
      .replace(/\{([sp]):([^{}|]*)\|([^{}]*)\}/g, (_, who, m, f) => (gender(who) === 'f' ? f : m))
      .replace(/\{([a-z]{1,20})\}/g, (all, k) => { const v = varOf(k); return v == null ? all : v; });
  }
  const refreshLive = () => S.live.forEach(x => { x.el.textContent = fill(x.tpl); });

  // ===================== Отрисовка блоков содержимого =====================
  function renderBlocks(blocks, prefix) {
    const frag = document.createDocumentFragment();
    (blocks || []).forEach((b, i) => {
      if (!b || typeof b !== 'object') return;
      const el = renderBlock(b, prefix + i);
      if (el) frag.append(el);
    });
    return frag;
  }

  function renderBlock(b, key) {
    const r = BLOCKS[b.type];
    if (!r) return null;
    const el = r(b, key);
    if (el && el.nodeType === 1 && !el.dataset.key) el.dataset.key = key;
    return el;
  }

  function panelHead(iconText, title, extra) {
    return h('div', { class: 'panel__head' },
      h('h2', { class: 'panel__title' }, iconText ? h('span', { class: 'panel__icon', 'aria-hidden': 'true', text: iconText }) : null, title || ''),
      extra || null);
  }

  const BLOCKS = {
    panel(b, key) {
      const inputs = Array.isArray(b.inputs) && b.inputs.length ? renderInputs(b.inputs) : null;
      const box = h('section', { class: 'panel' }, panelHead(b.icon, b.title, inputs));
      if (b.text) box.append(h('p', { class: 'panel__text', text: b.text }));
      if (Array.isArray(b.blocks)) box.append(renderBlocks(b.blocks, key + '.'));
      return box;
    },

    text: b => h('p', { class: 'doc__text', text: b.text || '' }),

    list: b => h(b.ordered ? 'ol' : 'ul', { class: 'doc__list' }, (b.items || []).map(t => h('li', { text: String(t) }))),

    note: b => h('div', { class: 'note' },
      h('span', { class: 'note__label' }, '📌 ' + (b.label || 'Примечание') + ':'), ' ', b.text || ''),

    gender(b) {
      const who = b.who === 'p' ? 'p' : 's';
      const box = h('section', { class: 'panel' },
        panelHead('👤', who === 'p' ? 'Пол пациента' : 'Пол сотрудника'),
        h('p', { class: 'panel__text', text: who === 'p' ? 'Выберите пол пациента для адаптации отыгровок' : 'Выберите пол сотрудника для адаптации отыгровок' }));
      const row = h('div', { class: 'gender', role: 'group', 'aria-label': who === 'p' ? 'Пол пациента' : 'Пол сотрудника' });
      [['m', '🧔', 'Мужчина'], ['f', '👩', 'Женщина']].forEach(([val, emo, label]) => {
        const btn = h('button', { class: 'gender__btn', type: 'button', 'aria-pressed': String(gender(who) === val) },
          h('span', { 'aria-hidden': 'true', text: emo }), label);
        btn.addEventListener('click', () => {
          prefs.set('gender:' + who, val);
          S.genderBtns.filter(x => x.who === who).forEach(x => x.btn.setAttribute('aria-pressed', String(x.val === val)));
          refreshLive();
        });
        S.genderBtns.push({ who, val, btn });
        row.append(btn);
      });
      box.append(row);
      return box;
    },

    settings() {
      const city = h('select', { class: 'input', 'aria-label': 'Город' }, S.site.cities.map(c => h('option', { value: c, text: c, selected: c === cityOf() })));
      const tag = h('select', { class: 'input', 'aria-label': 'Тег врача' }, S.site.tags.map(t => h('option', { value: t.tag, text: t.tag + ' (' + t.title + ')', selected: t.tag === tagOf() })));
      const hint = h('small', { class: 'field__hint' });
      const syncHint = () => { const t = S.site.tags.find(x => x.tag === tag.value); hint.textContent = t ? t.title : ''; };
      city.addEventListener('change', () => { prefs.set('city', city.value); refreshLive(); });
      tag.addEventListener('change', () => { prefs.set('tag', tag.value); syncHint(); refreshLive(); });
      syncHint();
      return h('div', { class: 'settings' },
        h('label', { class: 'field' }, h('span', { text: 'Город:' }), city),
        h('label', { class: 'field' }, h('span', { text: 'Тег врача:' }), tag, hint));
    },

    binds(b, key) {
      const wrap = h('div', { class: 'binds' });
      (b.items || []).forEach((it, i) => {
        const item = typeof it === 'string' ? { text: it } : (it || {});
        if (item.label) wrap.append(h('h3', { class: 'bind__label', text: item.label }));
        const text = h('code', { class: 'bind__text' });
        S.live.push({ el: text, tpl: item.text || '' });
        text.textContent = fill(item.text || '');
        const btn = h('button', { class: 'bind__copy', type: 'button' }, icon('copy'), h('span', { text: 'Копировать' }));
        const row = h('div', { class: 'bind', 'data-key': key + '.' + i }, text, btn);
        btn.addEventListener('click', () => copyText(fill(item.text || ''), btn, row));
        wrap.append(row);
      });
      return wrap;
    },

    tabs(b, key) {
      const tabs = (b.tabs || []).filter(t => t && typeof t === 'object');
      const bar = h('div', { class: 'ctabs', role: 'tablist' });
      const panes = h('div', { class: 'ctabs__panes' });
      const btns = [], boxes = [];
      const activate = i => {
        S.tabs.set(key, i);
        btns.forEach((x, j) => { x.setAttribute('aria-selected', String(i === j)); x.tabIndex = i === j ? 0 : -1; });
        boxes.forEach((x, j) => { x.hidden = i !== j; });
      };
      tabs.forEach((t, i) => {
        const id = 'tab-' + key.replace(/[^a-z0-9]/gi, '-') + '-' + i;
        const btn = h('button', { class: 'ctabs__btn', type: 'button', role: 'tab', id, 'aria-controls': id + '-p' },
          t.icon ? h('span', { 'aria-hidden': 'true', text: t.icon }) : null, t.title || '');
        btn.addEventListener('click', () => activate(i));
        btn.addEventListener('keydown', e => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
          activate(n); btns[n].focus();
        });
        const pane = h('div', { class: 'ctabs__pane', role: 'tabpanel', id: id + '-p', 'aria-labelledby': id, 'data-key': key + '.t' + i });
        if (Array.isArray(t.blocks) && t.blocks.length) pane.append(renderBlocks(t.blocks, key + '.t' + i + '.'));
        else pane.append(stub());
        pane._activate = () => activate(i);
        btns.push(btn); boxes.push(pane);
        bar.append(btn); panes.append(pane);
      });
      const start = Math.min(S.tabs.get(key) || 0, Math.max(0, tabs.length - 1));
      activate(start);
      return h('div', { class: 'tabsblock' }, bar, panes);
    },

    accordion(b, key) {
      return h('div', { class: 'acc' }, (b.items || []).map((it, i) => {
        const body = h('div', { class: 'acc__body' });
        if (Array.isArray(it.blocks) && it.blocks.length) body.append(renderBlocks(it.blocks, key + '.a' + i + '.'));
        else body.append(stub());
        return h('details', { class: 'acc__item', 'data-key': key + '.a' + i },
          h('summary', { class: 'acc__sum' },
            it.icon ? h('span', { 'aria-hidden': 'true', text: it.icon }) : null,
            h('span', { class: 'acc__title', text: it.title || '' }),
            icon('caret', 'acc__caret')),
          body);
      }));
    },

    positions(b, key) {
      const list = h('div', { class: 'pos-list' }, (b.items || []).map((p, i) => {
        const card = h('article', { class: 'pos', 'data-key': key + '.p' + i },
          h('h3', { class: 'pos__title', text: p.title || '' }),
          h('div', { class: 'pos__chips' },
            p.tag ? h('span', { class: 'pchip pchip--tag', text: '[' + p.tag + ']' }) : null,
            p.rank != null ? h('span', { class: 'pchip pchip--rank', text: p.rank + ' ранг' }) : null));
        if (Array.isArray(p.duties) && p.duties.length) {
          card.append(h('div', { class: 'pos__duties' },
            h('p', { class: 'pos__dlabel', text: '📋 Обязанности:' }),
            h('ol', null, p.duties.map(d => h('li', { text: String(d) })))));
        }
        return card;
      }));
      return h('section', { class: 'panel' }, panelHead(b.icon, b.title), list);
    },

    abbr: () => h('dl', { class: 'abbr' }, S.site.tags.map(t => [h('dt', null, h('span', { class: 'pchip pchip--tag', text: '[' + t.tag + ']' })), h('dd', { text: t.title })])),

    table: b => h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Таблица' },
      h('table', { class: 'dtable' },
        Array.isArray(b.head) ? h('thead', null, h('tr', null, b.head.map(c => h('th', { text: String(c) })))) : null,
        h('tbody', null, (b.rows || []).map(r => h('tr', null, (Array.isArray(r) ? r : []).map(c => h('td', { text: String(c) })))))))
  };

  function renderInputs(inputs) {
    return h('div', { class: 'pinputs' }, inputs.map(inp => {
      if (!inp || !/^[a-z]{1,20}$/.test(inp.key || '')) return null;
      if (!Object.prototype.hasOwnProperty.call(S.vars, inp.key)) S.vars[inp.key] = inp.value != null ? String(inp.value) : '';
      const field = h('input', {
        class: 'input input--sm', type: inp.type === 'number' ? 'number' : 'text', inputmode: inp.type === 'number' ? 'numeric' : null,
        min: inp.type === 'number' ? '0' : null, placeholder: inp.placeholder || '', maxlength: '40', value: S.vars[inp.key]
      });
      field.addEventListener('input', () => { S.vars[inp.key] = field.value; refreshLive(); });
      return h('label', { class: 'pinputs__field' }, h('span', { text: (inp.label || inp.key) + ':' }), field);
    }));
  }

  async function copyText(text, btn, row) {
    const label = btn.lastChild;
    try { await navigator.clipboard.writeText(text); label.textContent = 'Скопировано'; if (row) row.classList.add('is-copied'); }
    catch (_) { label.textContent = 'Выделите вручную'; }
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { label.textContent = 'Копировать'; if (row) row.classList.remove('is-copied'); }, 1600);
  }

  // ===================== Поиск =====================
  function buildIndex() {
    const out = [];
    const add = (sec, key, crumbs, text, title, label) => { if (text) out.push({ sec, key, crumbs, text: String(text), title: !!title, label: label || '' }); };
    const walk = (sec, blocks, prefix, crumbs) => (blocks || []).forEach((b, i) => {
      if (!b || typeof b !== 'object') return;
      const key = prefix + i;
      switch (b.type) {
        case 'panel':
          add(sec, key, crumbs, [b.title, b.text].filter(Boolean).join('. '), true);
          walk(sec, b.blocks, key + '.', b.title ? crumbs.concat(b.title) : crumbs);
          break;
        case 'text': case 'note': add(sec, key, crumbs, b.text); break;
        case 'list': add(sec, key, crumbs, (b.items || []).join('; ')); break;
        case 'binds': (b.items || []).forEach((it, j) => {
          const item = typeof it === 'string' ? { text: it } : (it || {});
          add(sec, key + '.' + j, crumbs, item.text, false, item.label);
        }); break;
        case 'tabs': (b.tabs || []).forEach((t, j) => {
          add(sec, key + '.t' + j, crumbs, t.title, true);
          walk(sec, t.blocks, key + '.t' + j + '.', crumbs.concat(t.title || ''));
        }); break;
        case 'accordion': (b.items || []).forEach((it, j) => {
          add(sec, key + '.a' + j, crumbs, it.title, true);
          walk(sec, it.blocks, key + '.a' + j + '.', crumbs.concat(it.title || ''));
        }); break;
        case 'positions': (b.items || []).forEach((p, j) => {
          add(sec, key + '.p' + j, crumbs.concat(b.title || []), [p.title, p.tag ? '[' + p.tag + ']' : '', (p.duties || []).join('; ')].filter(Boolean).join('. '), true);
        }); break;
        case 'table': add(sec, key, crumbs, [].concat(b.head || [], ...(b.rows || [])).join('; ')); break;
        default: break;
      }
    });
    for (const sec of S.sections) {
      out.push({ sec, key: null, crumbs: [], text: sec.title, title: true });
      walk(sec, sec.blocks, sec.id + ':', [sec.title]);
    }
    S.index = out;
  }

  let searchSel = 0, searchHits = [];
  function openSearch() {
    if (!S.user) return;
    closePopover(); closeMenu();
    $('#search').hidden = false;
    document.body.classList.add('is-locked');
    const input = $('#searchInput');
    input.value = '';
    runSearch('');
    input.focus();
  }
  function closeSearch() {
    const box = $('#search');
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('is-locked');
  }

  function runSearch(q) {
    const list = $('#searchResults');
    list.replaceChildren();
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) {
      const recent = prefs.get(histKey(), []).map(id => S.byId.get(id)).filter(Boolean).slice(0, 6);
      searchHits = recent.map(sec => ({ sec, key: null, crumbs: [], text: sec.title, title: true }));
      if (!searchHits.length) { list.append(h('li', { class: 'search__empty', text: 'Введите слово из бинда, должности или названия раздела' })); return; }
      list.append(h('li', { class: 'search__group', text: 'Недавно открытые' }));
    } else {
      const scored = [];
      for (const e of S.index) {
        const text = e.key && e.label ? e.label + ': ' + fill(e.text) : fill(e.text);
        const hay = norm(text + ' ' + e.crumbs.join(' '));
        if (!words.every(w => hay.includes(w))) continue;
        const inText = words.every(w => norm(text).includes(w));
        scored.push({ e, text, score: (e.title ? 3 : 0) + (inText ? 2 : 0) + (e.key ? 0 : 4) });
      }
      scored.sort((a, b) => b.score - a.score);
      searchHits = scored.slice(0, 40).map(x => Object.assign({}, x.e, { shown: x.text }));
      if (!searchHits.length) { list.append(h('li', { class: 'search__empty', text: 'Ничего не нашлось. Попробуйте другое слово.' })); return; }
    }
    searchHits.forEach((hit, i) => {
      const crumbs = hit.key ? hit.crumbs.filter(Boolean).join(' › ') : 'Раздел';
      const btn = h('button', { class: 'search__hit', type: 'button', role: 'option', id: 'hit-' + i, 'aria-selected': 'false' },
        h('span', { class: 'search__icon', 'aria-hidden': 'true', text: hit.sec.icon || '📄' }),
        h('span', { class: 'search__main' },
          h('span', { class: 'search__crumbs', text: crumbs }),
          h('span', { class: 'search__text' }, highlight(hit.shown || hit.text, words))));
      btn.addEventListener('click', () => goToHit(hit));
      btn.addEventListener('mousemove', () => selectHit(i));
      list.append(h('li', null, btn));
    });
    selectHit(0);
  }

  /** Подсвечивает найденные слова, собирая текст из узлов (без HTML). */
  function highlight(text, words) {
    const s = String(text);
    const frag = document.createDocumentFragment();
    if (!words.length) { frag.append(s.length > 160 ? s.slice(0, 160) + '…' : s); return frag; }
    const low = norm(s);
    const first = Math.min(...words.map(w => { const i = low.indexOf(w); return i < 0 ? Infinity : i; }));
    let from = isFinite(first) && first > 60 ? first - 40 : 0;
    const to = Math.min(s.length, from + 180);
    if (from > 0) frag.append('…');
    let i = from;
    while (i < to) {
      let best = -1, len = 0;
      for (const w of words) { const j = low.indexOf(w, i); if (j >= 0 && j < to && (best < 0 || j < best)) { best = j; len = w.length; } }
      if (best < 0) { frag.append(s.slice(i, to)); break; }
      if (best > i) frag.append(s.slice(i, best));
      frag.append(h('mark', { text: s.slice(best, best + len) }));
      i = best + len;
    }
    if (to < s.length) frag.append('…');
    return frag;
  }

  function selectHit(i) {
    const btns = $$('.search__hit');
    if (!btns.length) return;
    searchSel = (i + btns.length) % btns.length;
    btns.forEach((b, j) => b.setAttribute('aria-selected', String(j === searchSel)));
    $('#searchInput').setAttribute('aria-activedescendant', 'hit-' + searchSel);
    btns[searchSel].scrollIntoView({ block: 'nearest' });
  }

  function goToHit(hit) {
    closeSearch();
    S.pendingReveal = hit.key;
    if (route() === hit.sec.id) render();
    else location.hash = '#' + hit.sec.id;
  }

  /** Открывает вкладки и пункты, в которых лежит найденное, и подсвечивает его. */
  function reveal(key) {
    if (!key) { window.scrollTo(0, 0); return; }
    const el = $('#view').querySelector('[data-key="' + CSS.escape(key) + '"]');
    if (!el) return;
    for (let n = el; n && n.id !== 'view'; n = n.parentElement) {
      if (typeof n._activate === 'function') n._activate();
      if (n.tagName === 'DETAILS') n.open = true;
    }
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove('is-found'); void el.offsetWidth; el.classList.add('is-found');
    setTimeout(() => el.classList.remove('is-found'), 2200);
  }

  // ===================== Профиль =====================
  function pageProfile() {
    const u = S.user;
    const form = h('form', { class: 'form form--narrow', novalidate: true },
      h('h2', { class: 'block__title', text: 'Смена пароля' }),
      h('label', { class: 'field' }, h('span', { text: 'Текущий пароль' }), h('input', { name: 'old', type: 'password', autocomplete: 'current-password', maxlength: '128', required: true })),
      h('label', { class: 'field' }, h('span', { text: 'Новый пароль' }), h('input', { name: 'p1', type: 'password', autocomplete: 'new-password', maxlength: '128', required: true })),
      h('label', { class: 'field' }, h('span', { text: 'Повторите новый пароль' }), h('input', { name: 'p2', type: 'password', autocomplete: 'new-password', maxlength: '128', required: true })),
      h('p', { class: 'form__msg', role: 'alert' }),
      h('button', { class: 'btn btn--primary', type: 'submit', text: 'Сменить пароль' }),
      h('p', { class: 'form__hint', text: 'После смены пароля вы выйдете на всех остальных устройствах.' }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const el = form.elements;
      if (!el.old.value) return formMsg(form, 'Введите текущий пароль');
      const problem = checkNewPassword(u.nick, el.p1.value, el.p2.value);
      if (problem) return formMsg(form, problem);
      if (el.old.value === el.p1.value) return formMsg(form, 'Новый пароль совпадает со старым');
      formBusy(form, true, 'Шифруем…');
      try {
        const oldHash = await clientHash(u.nick, el.old.value);
        const newHash = await clientHash(u.nick, el.p1.value);
        const d = await api('changePassword', { oldHash, newHash });
        const keep = store.isPersistent('mz:token');
        S.token = d.token;
        store.set('mz:token', d.token, keep);
        formBusy(form, false); form.reset();
        formMsg(form, 'Пароль изменён', true);
      } catch (err) { formBusy(form, false); formMsg(form, err.message); }
    });

    const done = S.sections.filter(s => S.studied.has(s.id)).length;
    const info = h('dl', { class: 'facts' },
      h('dt', { text: 'Ник' }), h('dd', { text: u.nick }),
      h('dt', { text: 'Подразделение' }), h('dd', { text: u.dept || 'Все подразделения' }),
      h('dt', { text: 'Роль' }), h('dd', null, h('span', { class: 'badge badge--' + u.role, text: roleTitle(u.role) })),
      h('dt', { text: 'Изучено' }), h('dd', { text: done + ' из ' + S.sections.length }));

    const allOut = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Выйти на всех устройствах' });
    allOut.addEventListener('click', async () => {
      if (!confirm('Выйти на всех устройствах, включая это?')) return;
      allOut.disabled = true;
      try { await api('logoutAll'); signOutLocal('Вы вышли на всех устройствах'); }
      catch (err) { allOut.disabled = false; toast(err.message, 'bad'); }
    });
    const sessions = h('section', { class: 'block' },
      h('h2', { class: 'block__title', text: 'Устройства' }),
      h('p', { class: 'muted', text: 'Если входили с чужого компьютера и забыли выйти — завершите все сеансы.' }),
      allOut);

    return pageFrame('Профиль', null, info, form, sessions);
  }

  // ===================== Управление =====================
  function pageStaff() {
    const tabsDef = [
      ['requests', 'Заявки'],
      ['people', 'Сотрудники'],
      ['news', 'Объявления'],
      can('leader') ? ['codes', 'Коды доступа'] : null
    ].filter(Boolean);
    if (!tabsDef.some(t => t[0] === S.staffTab)) S.staffTab = 'requests';

    const bar = h('div', { class: 'ctabs ctabs--staff', role: 'tablist' });
    const pane = h('div', { class: 'staff' });
    const draw = () => {
      $$('.ctabs__btn', bar).forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.staffTab)));
      pane.replaceChildren();
      if (S.staffTab === 'news') return pane.append(staffNews());
      if (S.staffTab === 'codes') return pane.append(staffCodes());
      if (!S.staff) { pane.append(h('p', { class: 'muted', text: 'Загружаем список…' })); return; }
      pane.append(S.staffTab === 'requests' ? staffRequests(reload) : staffPeople(reload));
    };
    const reload = async () => {
      try {
        S.staff = await api('staffList');
        S.pending = S.staff.users.filter(u => u.status === 'pending').length;
        renderNav();
        updateCounts();
        draw();
      } catch (err) { pane.replaceChildren(h('p', { class: 'muted', text: err.message })); }
    };
    const updateCounts = () => {
      const c = $('[data-tab="requests"] .ctabs__count', bar);
      if (c) { c.textContent = S.pending ? String(S.pending) : ''; c.hidden = !S.pending; }
    };
    tabsDef.forEach(([id, title]) => {
      const b = h('button', { class: 'ctabs__btn', type: 'button', role: 'tab', 'data-tab': id }, title,
        id === 'requests' ? h('span', { class: 'ctabs__count', hidden: !S.pending, text: S.pending ? String(S.pending) : '' }) : null);
      b.addEventListener('click', () => { S.staffTab = id; draw(); });
      bar.append(b);
    });
    draw();
    reload();
    const scope = can('admin') ? 'Все подразделения' : (S.user.dept || '');
    return pageFrame('Управление', h('span', { class: 'scope', text: scope }), bar, pane);
  }

  function personHead(u, extra) {
    return h('span', { class: 'person' },
      h('span', { class: 'avatar avatar--sm', 'aria-hidden': 'true', text: initials(u.nick) }),
      h('span', { class: 'person__main' },
        h('span', { class: 'person__nick' }, h('strong', { text: u.nick }), h('span', { class: 'badge badge--' + u.role, text: roleTitle(u.role) })),
        h('span', { class: 'person__meta', text: [u.dept || 'Все подразделения', extra].filter(Boolean).join(', ') })));
  }

  function staffRequests(reload) {
    const list = S.staff.users.filter(u => u.status === 'pending').sort((a, b) => (a.created || 0) - (b.created || 0));
    if (!list.length) return h('p', { class: 'empty', text: 'Новых заявок нет. Когда кто-то зарегистрируется по коду доступа, заявка появится здесь.' });
    return h('ul', { class: 'rows' }, list.map(u => {
      const ok = h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Принять' });
      const no = h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Отклонить' });
      const act = async approve => {
        if (!approve && !confirm('Отклонить заявку ' + u.nick + '? Запись будет удалена.')) return;
        ok.disabled = no.disabled = true;
        try { await api('staffDecide', { nick: u.nick, approve }); toast(approve ? 'Принят: ' + u.nick : 'Заявка отклонена: ' + u.nick); await reload(); }
        catch (err) { toast(err.message, 'bad'); ok.disabled = no.disabled = false; }
      };
      ok.addEventListener('click', () => act(true));
      no.addEventListener('click', () => act(false));
      return h('li', { class: 'row' }, personHead(u, 'заявка от ' + fmtDate(u.created)),
        u.can.decide ? h('div', { class: 'row__actions' }, ok, no) : null);
    }));
  }

  function staffPeople(reload) {
    const F = S.staffFilter;
    const all = S.staff.users.filter(u => u.status !== 'pending');
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Поиск по нику', 'aria-label': 'Поиск по нику', value: F.q });
    const sel = (opts, val, label) => h('select', { class: 'input', 'aria-label': label }, opts.map(([v, t]) => h('option', { value: v, text: t, selected: v === val })));
    const fDept = can('admin') ? sel([['', 'Все подразделения']].concat(S.staff.depts.map(d => [d, d])), F.dept, 'Подразделение') : null;
    const fRole = sel([['', 'Все роли']].concat(Object.keys(RANK).map(r => [r, roleTitle(r)])), F.role, 'Роль');
    const fStat = sel([['', 'Все статусы'], ['active', 'Активные'], ['blocked', 'Заблокированные']], F.status, 'Статус');
    const list = h('ul', { class: 'rows' });
    const count = h('p', { class: 'muted rows__count' });

    const drawList = () => {
      const qq = norm(F.q);
      const shown = all.filter(u => (!qq || norm(u.nick).includes(qq)) && (!F.dept || u.dept === F.dept) && (!F.role || u.role === F.role) && (!F.status || u.status === F.status))
        .sort((a, b) => rank(b.role) - rank(a.role) || a.nick.localeCompare(b.nick));
      count.textContent = 'Показано ' + shown.length + ' из ' + all.length;
      list.replaceChildren();
      if (!shown.length) { list.append(h('li', { class: 'empty', text: all.length ? 'Никого не нашли. Сбросьте фильтры.' : 'В подразделении пока никого нет.' })); return; }
      shown.forEach(u => list.append(personRow(u, reload, drawList)));
    };
    q.addEventListener('input', () => { F.q = q.value; drawList(); });
    [[fDept, 'dept'], [fRole, 'role'], [fStat, 'status']].forEach(([s, k]) => s && s.addEventListener('change', () => { F[k] = s.value; drawList(); }));
    drawList();
    return h('div', null, h('div', { class: 'toolbar' }, q, fDept, fRole, fStat), count, list);
  }

  function personRow(u, reload, redraw) {
    const open = S.staffOpen === u.nick;
    const pct = u.total ? Math.round(u.studied.length / u.total * 100) : 0;
    const mini = h('span', { class: 'mini', title: 'Изучено ' + u.studied.length + ' из ' + u.total },
      h('span', { class: 'mini__bar' }, h('span', { class: 'mini__fill' })), h('span', { class: 'mini__num', text: u.studied.length + '/' + u.total }));
    mini.querySelector('.mini__fill').style.width = pct + '%';
    const toggle = h('button', { class: 'row__toggle', type: 'button', 'aria-expanded': String(open) },
      personHead(u, 'вход: ' + fmtDate(u.lastLogin)),
      u.status === 'blocked' ? h('span', { class: 'pill pill--bad', text: 'Заблокирован' }) : null,
      mini, icon('caret', 'row__caret'));
    toggle.addEventListener('click', () => { S.staffOpen = open ? null : u.nick; redraw(); });
    const li = h('li', { class: 'row row--person' + (open ? ' is-open' : '') + (u.status === 'blocked' ? ' is-blocked' : '') }, toggle);
    if (open) li.append(personDetails(u, reload));
    return li;
  }

  function personDetails(u, reload) {
    const box = h('div', { class: 'details' });
    box.append(h('p', { class: 'details__label', text: 'Изученные разделы' }),
      u.studied.length ? h('div', { class: 'tags' }, u.studied.map(s => h('span', { class: 'tag', text: s.title }))) : h('p', { class: 'muted', text: 'Пока ничего не отмечено.' }));
    const c = u.can;
    if (!c.edit) {
      box.append(h('p', { class: 'muted details__note', text: 'Менять роль и доступ этого сотрудника может только руководство выше по роли.' }));
      return box;
    }
    const role = h('select', { class: 'input', 'aria-label': 'Роль' }, c.roles.map(r => h('option', { value: r, text: roleTitle(r), selected: r === u.role })));
    const dept = c.dept ? h('select', { class: 'input', 'aria-label': 'Подразделение' }, S.staff.depts.map(d => h('option', { value: d, text: d, selected: d === u.dept }))) : null;
    const save = h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Сохранить' });
    const block = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: u.status === 'blocked' ? 'Разблокировать' : 'Заблокировать' });
    const reset = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Код сброса пароля' });
    const del = h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Удалить' });
    const out = h('div', { class: 'details__out' });

    const run = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (err) { toast(err.message, 'bad'); btn.disabled = false; } };
    save.addEventListener('click', () => run(save, async () => {
      const payload = { nick: u.nick, role: role.value };
      if (dept) payload.dept = dept.value;
      await api('staffUpdate', payload); toast('Сохранено: ' + u.nick); await reload();
    }));
    block.addEventListener('click', () => run(block, async () => {
      const next = u.status === 'blocked' ? 'active' : 'blocked';
      if (next === 'blocked' && !confirm('Заблокировать ' + u.nick + '? Он сразу выйдет со всех устройств.')) { block.disabled = false; return; }
      await api('staffUpdate', { nick: u.nick, status: next });
      toast((next === 'blocked' ? 'Заблокирован: ' : 'Разблокирован: ') + u.nick); await reload();
    }));
    reset.addEventListener('click', () => run(reset, async () => {
      if (!confirm('Выдать ' + u.nick + ' код сброса пароля? Старый пароль продолжит работать, пока код не использован.')) { reset.disabled = false; return; }
      const d = await api('staffResetCode', { nick: u.nick });
      const codeEl = h('code', { class: 'secret', text: d.code });
      const copy = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('copy'), h('span', { text: 'Копировать' }));
      copy.addEventListener('click', () => copyText(d.code, copy));
      out.replaceChildren(h('div', { class: 'codebox' },
        h('p', null, 'Код сброса для ', h('strong', { text: u.nick }), ' действует ' + d.hours + ' ' + plural(d.hours, 'час', 'часа', 'часов') + '. Передайте его лично — по нему можно задать новый пароль на странице входа.'),
        h('div', { class: 'row' }, codeEl, copy)));
      reset.disabled = false;
    }));
    del.addEventListener('click', () => run(del, async () => {
      if (!confirm('Удалить ' + u.nick + '? Аккаунт и прогресс пропадут, это нельзя отменить.')) { del.disabled = false; return; }
      await api('staffDelete', { nick: u.nick }); toast('Удалён: ' + u.nick); S.staffOpen = null; await reload();
    }));

    box.append(h('div', { class: 'details__grid' },
      h('label', { class: 'field' }, h('span', { text: 'Роль' }), role),
      dept ? h('label', { class: 'field' }, h('span', { text: 'Подразделение' }), dept) : null),
      h('div', { class: 'details__actions' }, save, block, reset, del), out);
    return box;
  }

  function staffNews() {
    const ta = h('textarea', { class: 'input', rows: '3', maxlength: '800', placeholder: 'Например: с понедельника обновлены доклады в рацию', 'aria-label': 'Текст объявления' });
    const counter = h('small', { class: 'muted', text: '0 / 800' });
    ta.addEventListener('input', () => { counter.textContent = ta.value.length + ' / 800'; });
    const target = can('admin')
      ? h('select', { class: 'input', 'aria-label': 'Кому' }, [h('option', { value: '', text: 'Всем подразделениям' })].concat(S.depts.map(d => h('option', { value: d, text: 'Только ' + d }))))
      : h('span', { class: 'muted', text: 'Увидят сотрудники ' + (S.user.dept || '') });
    const post = h('button', { class: 'btn btn--primary', type: 'button', text: 'Опубликовать' });
    const list = h('ul', { class: 'newslist' });
    const drawNews = () => {
      list.replaceChildren();
      if (!S.news.length) list.append(h('li', { class: 'empty', text: 'Объявлений пока нет.' }));
      for (const n of S.news) {
        const li = h('li', null,
          h('p', { class: 'newslist__text', text: n.text }),
          h('div', { class: 'newslist__meta' },
            h('span', { class: 'muted', text: fmtDate(n.date) + ', ' + n.author }),
            h('span', { class: 'tag', text: n.dept || 'Все' })));
        if (n.canDelete) {
          const del = h('button', { class: 'linkbtn linkbtn--danger', type: 'button', text: 'Удалить' });
          del.addEventListener('click', async () => {
            if (!confirm('Удалить объявление?')) return;
            try { const d = await api('newsDelete', { id: n.id }); S.news = d.news; drawNews(); updateNewsDot(); toast('Объявление удалено'); }
            catch (err) { toast(err.message, 'bad'); }
          });
          li.lastChild.append(del);
        }
        list.append(li);
      }
    };
    post.addEventListener('click', async () => {
      if (!ta.value.trim()) return toast('Введите текст объявления', 'bad');
      post.disabled = true;
      try {
        const d = await api('newsPost', { text: ta.value, dept: target.tagName === 'SELECT' ? target.value : '' });
        S.news = d.news; ta.value = ''; counter.textContent = '0 / 800';
        drawNews(); updateNewsDot(); toast('Объявление опубликовано');
      } catch (err) { toast(err.message, 'bad'); }
      post.disabled = false;
    });
    drawNews();
    return h('div', null,
      h('section', { class: 'block' }, h('h2', { class: 'block__title', text: 'Новое объявление' }), ta,
        h('div', { class: 'row row--between' }, target, h('div', { class: 'row' }, counter, post))),
      h('section', { class: 'block' }, h('h2', { class: 'block__title', text: 'Опубликованные' }), list));
  }

  function staffCodes() {
    const box = h('div', null,
      h('p', { class: 'muted', text: 'По коду новый сотрудник регистрируется сразу в нужное подразделение. Передавайте код только принятым на собеседовании. Если код утёк — выдайте новый, старый перестанет работать.' }));
    const list = h('ul', { class: 'rows' }, h('li', { class: 'muted', text: 'Загружаем коды…' }));
    box.append(list);
    api('codesList').then(d => {
      list.replaceChildren();
      d.codes.forEach(c => {
        const code = h('code', { class: 'secret', text: '••••-••••-••••' });
        let shown = false, value = c.code;
        const show = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Показать' });
        const copy = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('copy'), h('span', { text: 'Копировать' }));
        const regen = h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Новый код' });
        show.addEventListener('click', () => { shown = !shown; code.textContent = shown ? value : '••••-••••-••••'; show.textContent = shown ? 'Скрыть' : 'Показать'; });
        copy.addEventListener('click', () => copyText(value, copy));
        regen.addEventListener('click', async () => {
          if (!confirm('Выдать новый код для ' + c.dept + '? Старый перестанет работать.')) return;
          regen.disabled = true;
          try { const r = await api('codesRegenerate', { dept: c.dept }); value = r.code; shown = true; code.textContent = value; show.textContent = 'Скрыть'; toast('Новый код для ' + c.dept + ' выдан'); }
          catch (err) { toast(err.message, 'bad'); }
          regen.disabled = false;
        });
        list.append(h('li', { class: 'row' },
          h('strong', { class: 'codes__dept', text: c.dept }), code,
          h('div', { class: 'row__actions' }, show, copy, regen)));
      });
    }).catch(err => list.replaceChildren(h('li', { class: 'muted', text: err.message })));
    return box;
  }

  // ===================== Прогресс, история =====================
  let saveTimer = null;
  function saveProgress() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await api('saveProgress', { studied: Array.from(S.studied), favorites: Array.from(S.fav) }); }
      catch (err) { if (err.code !== 'AUTH') toast('Прогресс не сохранился: ' + err.message, 'bad'); }
    }, 700);
  }

  const histKey = () => 'history:' + (S.user ? S.user.nick.toLowerCase() : '');
  function rememberVisit(id) {
    const list = prefs.get(histKey(), []).filter(x => x !== id);
    list.unshift(id);
    prefs.set(histKey(), list.slice(0, 10));
  }

  // ===================== Всплывающие панели =====================
  let popAnchor = null;
  function openPopover(anchor, title, body) {
    const pop = $('#popover');
    if (popAnchor === anchor && !pop.hidden) { closePopover(); return; }
    closePopover();
    pop.replaceChildren(h('h2', { class: 'popover__title', text: title }), body);
    pop.setAttribute('aria-label', title);
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = (r.bottom + 10 + window.scrollY) + 'px';
    pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) + 'px';
    popAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
  }
  function closePopover() {
    const pop = $('#popover');
    if (!pop) return;
    pop.hidden = true;
    if (popAnchor) popAnchor.setAttribute('aria-expanded', 'false');
    popAnchor = null;
  }
  const sectionLinks = (ids, empty) => {
    const list = ids.map(id => S.byId.get(id)).filter(Boolean);
    if (!list.length) return h('p', { class: 'popover__empty', text: empty });
    return h('ul', { class: 'popover__list' }, list.map(s => h('li', null, h('a', { href: '#' + s.id }, h('span', { 'aria-hidden': 'true', text: s.icon || '📄' }), s.title))));
  };

  const seenKey = () => 'seenNews:' + (S.user ? S.user.nick.toLowerCase() : '');
  function updateNewsDot() {
    const newest = S.news[0] ? S.news[0].id : '';
    $('#newsBtn').classList.toggle('has-dot', !!newest && newest !== prefs.get(seenKey(), ''));
  }

  // ===================== Тема, меню, уведомления =====================
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const btn = $('#themeBtn');
    btn.replaceChildren(icon('palette'), icon(t === 'dark' ? 'moon' : 'sun'));
    btn.setAttribute('aria-label', t === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  }

  function openMenu() { $('#sidebar').classList.add('is-open'); $('#scrim').hidden = false; $('#menuBtn').setAttribute('aria-expanded', 'true'); }
  function closeMenu() { $('#sidebar').classList.remove('is-open'); $('#scrim').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); }

  function toast(text, kind) {
    const t = h('div', { class: 'toast' + (kind === 'bad' ? ' toast--bad' : ''), role: kind === 'bad' ? 'alert' : null, text });
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ===================== Привязка событий =====================
  function init() {
    applyTheme(prefs.get('theme', 'dark') === 'light' ? 'light' : 'dark');

    $('#tabLogin').addEventListener('click', () => switchTab('login'));
    $('#tabReg').addEventListener('click', () => switchTab('reg'));
    $('#forgotBtn').addEventListener('click', () => switchTab('reset'));
    $('#backToLogin').addEventListener('click', () => switchTab('login'));
    $('#loginForm').addEventListener('submit', onLogin);
    $('#regForm').addEventListener('submit', onRegister);
    $('#resetForm').addEventListener('submit', onReset);

    $('#menuBtn').append(icon('menu'));
    $('#newsBtn').append(icon('bell'));
    $('#favBtn').append(icon('bookmark'));
    $('#histBtn').append(icon('history'));
    $('#searchBtn').prepend(icon('search'));
    $('.search__ico').append(icon('search'));
    $('.shield').append(icon('shield'));
    $('.ico-logout').append(icon('logout'));

    $('#menuBtn').addEventListener('click', () => ($('#sidebar').classList.contains('is-open') ? closeMenu() : openMenu()));
    $('#scrim').addEventListener('click', closeMenu);
    $('#logoutBtn').addEventListener('click', signOut);
    $('#themeBtn').addEventListener('click', () => {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      prefs.set('theme', t); applyTheme(t);
    });

    $('#newsBtn').addEventListener('click', e => {
      e.stopPropagation();
      const body = S.news.length
        ? h('ul', { class: 'popover__news' }, S.news.map(n => h('li', null,
            h('p', { text: n.text }),
            h('small', { text: fmtDate(n.date) + ', ' + n.author + (n.dept ? ' — ' + n.dept : '') }))))
        : h('p', { class: 'popover__empty', text: 'Объявлений пока нет' });
      openPopover(e.currentTarget, 'Объявления', body);
      if (S.news[0]) prefs.set(seenKey(), S.news[0].id);
      updateNewsDot();
    });
    $('#favBtn').addEventListener('click', e => {
      e.stopPropagation();
      openPopover(e.currentTarget, 'Избранное', sectionLinks(Array.from(S.fav), 'Добавляйте разделы кнопкой «В избранное»'));
    });
    $('#histBtn').addEventListener('click', e => {
      e.stopPropagation();
      openPopover(e.currentTarget, 'Недавно открытые', sectionLinks(prefs.get(histKey(), []), 'Вы ещё не открывали разделы'));
    });

    // Поиск
    $('#searchBtn').addEventListener('click', openSearch);
    $('#search').addEventListener('click', e => { if (e.target.id === 'search') closeSearch(); });
    $('#searchInput').addEventListener('input', e => runSearch(e.target.value));
    $('#searchInput').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectHit(searchSel + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectHit(searchSel - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (searchHits[searchSel]) goToHit(searchHits[searchSel]); }
    });

    document.addEventListener('click', e => { if (!e.target.closest('#popover')) closePopover(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeSearch(); closePopover(); closeMenu(); return; }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
      if ((e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); }
      else if (e.key === '/' && !typing) { e.preventDefault(); openSearch(); }
    });
    window.addEventListener('hashchange', render);
    window.addEventListener('resize', closePopover);

    if (!window.isSecureContext) { showAuth('Откройте сайт по адресу https:// — иначе шифрование паролей не работает.'); return; }

    S.token = store.get('mz:token');
    if (S.token && /^[A-Za-z0-9_-]{43}$/.test(S.token) && apiConfigured()) start();
    else { store.del('mz:token'); showAuth(''); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
