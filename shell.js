/* =====================================================================
   shell.js • Central de Marcação
   Monta o topo, o menu lateral, o rodapé e oferece utilitários comuns.
   Para incluir uma página nova no menu, basta acrescentar uma linha em PAGES.
   ===================================================================== */
(function () {
  'use strict';

  var PAGES = [
    { id: 'index',            href: 'index.html',            label: 'Início',            ico: '🏠' },
    { id: 'oncologia',        href: 'oncologia.html',        label: 'Oncologia Clínica', ico: '♋' },
    { id: 'quimioterapia',    href: 'quimioterapia.html',    label: 'Quimioterapia',     ico: '💉' },
    { id: 'radioterapia',     href: 'radioterapia.html',     label: 'Radioterapia',      ico: '☢️' },          
    { id: 'ultrassonografia', href: 'ultrassonografia.html', label: 'Ultrassonografia',  ico: '📺' },
    { id: 'triagem',          href: 'triagem.html',          label: 'Triagem',           ico: '🩺' },
    { id: 'anotacoes',        href: 'anotacoes.html',        label: 'Anotações',         ico: '📋' },
    { id: 'telefonia',        href: 'telefonia.html',        label: 'Telefonia',         ico: '☎️' },
    { id: 'painel',           href: 'painel.html',           label: 'Painel de Controle', ico: '⚙️' }
  ];

  var LOGO = 'https://ligacontraocancer.com.br/wp-content/themes/v01/assets/img/build/liga-contra-o-cancer-footer-red.f7f3067c.png';
  var FAVICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAOVBMVEVHcEzfbFPaW1TZW1DbYk7aXVDYVlDWTVLXVFDYVlDaYUzaXlDdaE7idVjhclbgb1Tgb1Xic1fkeFyJbEO4AAAAEnRSTlMAHDlOZ4bL/+f//6f/0+7/sseHLxJ+AAAA70lEQVR4AWXPR4IEIQwEQakb7+H/j91CMFqXcAss/Yqf17wPk6Zgnb8F85tMiNFHr/z8oPhJWdWlmISCQ+HoIU4JKJwJ2bM9CwaYuGIUJpQBYpgHYXsYIi6pKF+U9rm2qF408iq8jqgWBFc8ZewlakX1P/bSD28df3d2ZM3pJcW0cW7k9+DD5uZSCkRWEEv26YOLvjwOIlaEZqA+3RBRXUDC4No3qjLwWWtNNLB9HERyJZqr79EF5XTJCDK2QtvFcrTRyWwFVsEdXL88BAnxtT5Iq1srXlXX0aaE2rr1JcwquvdTU9N7tUH/4svzoU9ff84W2I/rlSEAAAAASUVORK5CYII=';
  var current = document.body.getAttribute('data-page') || '';

  /* ---------- favicon ---------- */
  if (!document.querySelector('link[rel~="icon"]')) {
    var ic = document.createElement('link');
    ic.rel = 'icon'; ic.type = 'image/png'; ic.href = FAVICON;
    document.head.appendChild(ic);
  }

  /* ---------- topo + menu + rodapé ---------- */
  var links = PAGES.map(function (p) {
    return '<a href="' + p.href + '"' + (p.id === current ? ' class="current" aria-current="page"' : '') + '>' +
           '<span class="ico">' + p.ico + '</span>' + p.label + '</a>';
  }).join('');

  document.body.insertAdjacentHTML('afterbegin',
    '<a class="skip" href="#conteudo">Ir para o conteúdo</a>' +
    '<header class="topbar">' +
      '<a href="index.html" title="Início"><img src="' + LOGO + '" alt="Liga Contra o Câncer"></a>' +
      '<div class="brand-title">Central de Marcação</div>' +
      '<button class="tema-btn" id="temaBtn" type="button" aria-label="Alternar tema claro/escuro"></button>' +
      '<a class="user-btn" id="userBtn" href="painel.html" title="Painel de Controle">⚙️ <span>Painel</span></a>' +
      '<button class="menu-btn" id="menuBtn" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="sideMenu">☰ Menu</button>' +
    '</header>' +
    '<nav class="side-menu" id="sideMenu" aria-label="Menu principal">' + links + '</nav>' +
    '<div class="overlay" id="overlay"></div>');

  document.body.insertAdjacentHTML('beforeend',
    '<footer class="footer">Liga Contra o Câncer • Central de Marcação • <a href="painel.html">Painel de Controle</a></footer>' +
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>');

  var menu = document.getElementById('sideMenu');
  var overlay = document.getElementById('overlay');
  var menuBtn = document.getElementById('menuBtn');

  function toggleMenu(open) {
    menu.classList.toggle('open', open);
    overlay.classList.toggle('show', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  menuBtn.addEventListener('click', function () { toggleMenu(!menu.classList.contains('open')); });
  overlay.addEventListener('click', function () { toggleMenu(false); });

  /* ---------- utilitários globais (window.UI) ---------- */
  var UI = window.UI = {};

  UI.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* minúsculas e sem acento: usado em todas as buscas */
  UI.norm = function (s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  };

  UI.titleCase = function (s) {
    var small = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
    return String(s).toLowerCase().split(/\s+/).map(function (w, i) {
      return (i > 0 && small[w]) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  };

  UI.initial = function (s) { return String(s).trim().charAt(0).toUpperCase(); };

  UI.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 120); };
  };

  UI.greeting = function () {
    var h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  };

  /* ---------- tema claro / escuro (vale para todas as páginas e fica salvo neste navegador) ---------- */
  UI.tema = {
    onChange: null,
    get: function () { return document.documentElement.getAttribute('data-tema') === 'dark' ? 'dark' : 'light'; },
    set: function (t, silent) {
      var dark = t === 'dark';
      if (dark) document.documentElement.setAttribute('data-tema', 'dark'); else document.documentElement.removeAttribute('data-tema');
      try { localStorage.setItem('an_tema', dark ? 'dark' : 'light'); } catch (e) {}
      var b = document.getElementById('temaBtn');
      if (b) { b.textContent = dark ? '☀️' : '🌙'; b.title = dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'; }
      if (!silent && typeof UI.tema.onChange === 'function') UI.tema.onChange(dark ? 'dark' : 'light');
    },
    toggle: function () { UI.tema.set(UI.tema.get() === 'dark' ? 'light' : 'dark'); }
  };
  document.getElementById('temaBtn').addEventListener('click', UI.tema.toggle);
  UI.tema.set(UI.tema.get(), true);

  UI.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- aviso rápido ---------- */
  var toastEl = document.getElementById('toast'), toastTimer;
  UI.toast = function (msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  };

  /* ---------- copiar para a área de transferência ---------- */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }
  UI.copy = function (text, okMsg) {
    function done(ok) { UI.toast(ok ? (okMsg || 'Texto copiado!') : 'Não foi possível copiar', ok ? '' : 'err'); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  };

  /* ---------- janela (modal) ---------- */
  var modalEl, modalHead, modalBody, modalFoot, modalBox, lastFocus;
  function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal';
    modalEl.innerHTML =
      '<div class="modal-box" role="dialog" aria-modal="true">' +
        '<button class="modal-x" type="button" aria-label="Fechar">×</button>' +
        '<div class="modal-head"></div><div class="modal-body"></div><div class="modal-foot"></div>' +
      '</div>';
    document.body.appendChild(modalEl);
    modalBox = modalEl.firstChild;
    modalHead = modalBox.querySelector('.modal-head');
    modalBody = modalBox.querySelector('.modal-body');
    modalFoot = modalBox.querySelector('.modal-foot');
    modalBox.querySelector('.modal-x').addEventListener('click', UI.closeModal);
    modalEl.addEventListener('click', function (e) { if (e.target === modalEl) { if (modalStack.length) UI.backModal(); else UI.closeModal(); } });
  }

  /* pilha de telas do modal: permite abrir uma tela por cima (visualizador) e voltar para a anterior */
  var modalStack = [];
  function moveNodes(from) { var f = document.createDocumentFragment(); while (from.firstChild) f.appendChild(from.firstChild); return f; }

  /* opções: { title, sub, html, foot, size:'wide', bare:true }  (title/sub são escapados; html/foot não) */
  UI.openModal = function (o) {
    ensureModal();
    if (o.stack && modalEl.classList.contains('show')) {
      modalStack.push({ cls: modalBox.className, head: moveNodes(modalHead), headDisp: modalHead.style.display,
        body: moveNodes(modalBody), scroll: modalBody.scrollTop, foot: moveNodes(modalFoot), footDisp: modalFoot.style.display, focus: lastFocus });
      modalHead.innerHTML = ''; modalBody.innerHTML = ''; modalFoot.innerHTML = ''; modalFoot.onclick = null;
    } else if (!modalEl.classList.contains('show')) modalStack = [];
    modalBox.className = 'modal-box' + (o.size === 'wide' ? ' wide' : '') + (o.bare ? ' bare' : '');
    modalHead.innerHTML = o.title ? '<h2>' + UI.esc(o.title) + '</h2>' + (o.sub ? '<small>' + UI.esc(o.sub) + '</small>' : '') : '';
    modalHead.style.display = o.title ? '' : 'none';
    modalBody.innerHTML = o.html || '';
    modalFoot.innerHTML = o.foot || '';
    modalFoot.style.display = o.foot ? '' : 'none';
    modalBody.scrollTop = 0;
    lastFocus = document.activeElement;
    modalEl.classList.add('show');
    modalBox.querySelector('.modal-x').focus();
    return { body: modalBody, foot: modalFoot };
  };
  /* volta para a tela anterior do modal (se houver); retorna true se voltou */
  UI.backModal = function () {
    var p = modalStack.pop(); if (!p) return false;
    modalBox.className = p.cls;
    modalHead.innerHTML = ''; modalHead.appendChild(p.head); modalHead.style.display = p.headDisp;
    modalBody.innerHTML = ''; modalBody.appendChild(p.body); modalBody.scrollTop = p.scroll;
    modalBody.onclick = null; modalFoot.innerHTML = ''; modalFoot.onclick = null; modalFoot.appendChild(p.foot); modalFoot.style.display = p.footDisp;
    lastFocus = p.focus;
    return true;
  };
  UI.closeModal = function () {
    if (!modalEl || !modalEl.classList.contains('show')) return;
    modalStack = [];
    modalEl.classList.remove('show');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  /* ---------- avisos da gestão em todas as páginas ----------
     As páginas Anotações e Painel carregam o core.js sozinhas. Nas demais, ele só é carregado
     se a pessoa entrou na conta neste navegador (para receber avisos e mostrar o nome no topo). */
  if (current !== 'anotacoes' && current !== 'painel' && UI.store.get('an_logado', false)) {
    var cs = document.createElement('script');
    cs.src = 'core.js';
    cs.onload = function () { if (window.Core) window.Core.init({ allowCreate: false }); };
    document.head.appendChild(cs);
  }

  /* ---------- atalhos de teclado ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { UI.closeModal(); toggleMenu(false); return; }
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) {
      var s = document.querySelector('.search input');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    }
  });
})();
