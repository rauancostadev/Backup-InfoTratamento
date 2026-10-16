/* =====================================================================
   triagem.js • Central de Marcação
   Módulo de TRIAGEM: nova solicitação, consulta de protocolo e API usada
   pelo Painel de Controle (listar / alterar status).

   Use depois do shell.js:
     <script src="shell.js"></script>
     <script src="triagem.js"></script>

   O arquivo faz duas coisas:
     1) Expõe  window.Triagem  (API de leitura/escrita no Firestore, Firebase SDK v10 modular).
     2) Se a página tiver o formulário #triForm (triagem.html), liga a interface.
        No painel.html só a API é usada.

   COLEÇÕES NO FIRESTORE
     triagens/{LIGA-XXXXX}                 → dados PÚBLICOS da consulta
         { protocolo, nome, medico, status, criadoEm, atualizadoEm? }
     triagens/{LIGA-XXXXX}/privado/dados   → dados SENSÍVEIS (só a gestão lê)
         { cpf, nascimento, contato, anexos:[{nome,tamanho,tipo,caminho,url}], atualizadoPor? }
   (Os dados sensíveis ficam separados para que quem consulta um protocolo nunca receba CPF/telefone.)

   ARQUIVOS ANEXOS vão para o Firebase Storage em  triagens/{protocolo}/…
   ===================================================================== */
(function () {
  'use strict';

  /* =================================================================
     1) CONFIGURAÇÃO  (ajuste aqui)
     ================================================================= */

  /* Mesmos dados do core.js. Precisam ser IDÊNTICOS para os dois arquivos compartilharem o mesmo app Firebase. */
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyApmPmqMNcEw7rPCIfh_CBCjfGLZBdG11Q",
    authDomain: "infotratamento.firebaseapp.com",
    projectId: "infotratamento",
    appId: "1:972789860884:web:a89ec872539d2613173501"
  };

  /* Bucket do Firebase Storage (Console Firebase > Storage > aba "Arquivos", começo da lista: gs://...).
     Projetos novos usam "<projeto>.firebasestorage.app"; projetos antigos, "<projeto>.appspot.com". */
  const STORAGE_BUCKET = 'infotratamento.firebasestorage.app';

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';   /* mesma versão do core.js */
  const COLECAO = 'triagens';

  /* Status possíveis (o texto é exatamente o que fica salvo no Firestore) */
  const STATUS = { PENDENTE: 'Pendente', AUTORIZADO: 'Autorizado', NAO_AUTORIZADO: 'Não Autorizado' };
  const STATUS_LISTA = [STATUS.PENDENTE, STATUS.AUTORIZADO, STATUS.NAO_AUTORIZADO];
  const STATUS_INFO = {
    'Pendente':       { cls: 'pendente',   ico: '🟡', desc: 'Aguardando análise' },
    'Autorizado':     { cls: 'autorizado', ico: '🟢', desc: 'Solicitação liberada' },
    'Não Autorizado': { cls: 'recusado',   ico: '🔴', desc: 'Solicitação recusada' }
  };

  /* Regras dos anexos */
  const ANEXO = {
    exts: ['pdf', 'jpg', 'jpeg', 'png'],
    tipos: { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' },
    maxBytes: 10 * 1024 * 1024,    /* 10 MB por arquivo */
    maxQtd: 10
  };

  /* Alfabeto do protocolo: sem 0/O e 1/I (confundem na hora de ditar por telefone). 32 letras = sem viés no sorteio. */
  const PROTO_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PROTO_RE = /^LIGA-[A-HJ-NP-Z2-9]{5}$/;

  const esc = (window.UI && UI.esc) || function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* =================================================================
     2) UTILITÁRIOS (máscaras, validações, formatação) — sem dependência do Firebase
     ================================================================= */
  const so09 = v => String(v || '').replace(/\D/g, '');

  /* 00000000000 → 000.000.000-00 (formata enquanto digita) */
  function maskCPF(v) {
    v = so09(v).slice(0, 11);
    return v.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  /* (00) 00000-0000 (celular) ou (00) 0000-0000 (fixo): muda sozinho conforme a quantidade de dígitos */
  function maskTel(v) {
    v = so09(v).slice(0, 11);
    if (v.length > 10) return v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
    if (v.length > 6)  return v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
    if (v.length > 2)  return v.replace(/^(\d{2})(\d*)/, '($1) $2');
    return v.length ? '(' + v : '';
  }

  /* CPF: 11 dígitos, não pode ser sequência repetida e os dois dígitos verificadores precisam bater */
  function validarCPF(v) {
    v = so09(v);
    if (v.length !== 11 || /^(\d)\1{10}$/.test(v)) return false;
    for (let t = 9; t < 11; t++) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(v.charAt(i)) * (t + 1 - i);
      const dv = ((soma * 10) % 11) % 10;
      if (dv !== Number(v.charAt(t))) return false;
    }
    return true;
  }

  /* Telefone brasileiro: 10 dígitos (fixo) ou 11 (celular, começa com 9 depois do DDD); DDD de 11 a 99 */
  function validarTel(v) {
    v = so09(v);
    if (v.length !== 10 && v.length !== 11) return false;
    if (Number(v.slice(0, 2)) < 11) return false;
    return v.length === 10 || v.charAt(2) === '9';
  }

  /* Data no formato AAAA-MM-DD (valor do <input type="date">): precisa existir, não ser futura e ser após 1900 */
  function validarNascimento(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const p = v.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    if (d.getFullYear() !== p[0] || d.getMonth() !== p[1] - 1 || d.getDate() !== p[2]) return false;
    return p[0] >= 1900 && d.getTime() <= Date.now();
  }

  const fmtCPF = v => maskCPF(v);
  const fmtTel = v => maskTel(v);
  const fmtNasc = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('/') : (v || '—');   /* sem new Date: evita erro de fuso */
  const fmtData = d => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  function fmtTamanho(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1).replace('.', ',') + ' KB';
    return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  const extDe = nome => { const m = /\.([a-z0-9]+)$/i.exec(nome || ''); return m ? m[1].toLowerCase() : ''; };
  const nomeSeguro = nome => String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);

  /* Gera LIGA-XXXXX com sorteio criptográfico */
  function gerarProtocolo() {
    const buf = new Uint32Array(5);
    crypto.getRandomValues(buf);
    let s = '';
    for (let i = 0; i < 5; i++) s += PROTO_ALFABETO.charAt(buf[i] % PROTO_ALFABETO.length);
    return 'LIGA-' + s;
  }

  /* Aceita "liga-ab3de", "LIGAAB3DE" ou só "AB3DE"; devolve "LIGA-AB3DE" ou '' se o formato for inválido */
  function normalizarProtocolo(v) {
    let s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.length === 5) s = 'LIGA' + s;
    if (s.length !== 9 || s.slice(0, 4) !== 'LIGA') return '';
    s = 'LIGA-' + s.slice(4);
    return PROTO_RE.test(s) ? s : '';
  }

  /* HTML do selo colorido de status (usado aqui e no painel) */
  function badge(status, comDescricao) {
    const i = STATUS_INFO[status] || STATUS_INFO[STATUS.PENDENTE];
    return '<span class="tg-badge ' + i.cls + '"><i aria-hidden="true">' + i.ico + '</i>' + esc(status || STATUS.PENDENTE) +
      (comDescricao ? '<small>' + esc(i.desc) + '</small>' : '') + '</span>';
  }

  /* Traduz o erro técnico em texto que a pessoa entende */
  function erroMsg(e) {
    const c = e && e.code;
    if (c === 'app/anexo') return 'Não foi possível enviar os anexos. Verifique a conexão e se o Firebase Storage está ativado e com as regras publicadas (arquivo storage.rules). Nada foi registrado. Tente novamente.';
    if (c === 'permission-denied') return 'Sem permissão no banco de dados. Confira se as regras mais recentes (arquivo firestore.rules) foram publicadas no Firebase.';
    if (c === 'unavailable' || c === 'auth/network-request-failed' || (e && /network|offline|fetch/i.test(e.message || ''))) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    if (c === 'app/sem-protocolo') return 'Não foi possível gerar um protocolo livre. Tente novamente.';
    return 'Não foi possível concluir a operação. ' + ((e && e.message) || '');
  }

  /* =================================================================
     3) ACESSO AO FIRESTORE (Firebase JS SDK v10 modular, carregado sob demanda)
     ================================================================= */
  let fbPromise = null;
  function fb() {
    if (!fbPromise) {
      fbPromise = Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]).then(function (m) {
        const A = m[0], F = m[1];
        /* reaproveita o app que o core.js já criou (mesmo login da gestão); senão cria um com a mesma configuração */
        const app = A.getApps().length ? A.getApp() : A.initializeApp(FIREBASE_CONFIG);
        return { app: app, F: F, db: F.getFirestore(app) };
      }).catch(function (e) { fbPromise = null; throw e; });
    }
    return fbPromise;
  }

  const paraData = ts => ts && typeof ts.toDate === 'function' ? ts.toDate() : (ts ? new Date(ts) : null);

  /* ---------- envia os anexos para o Storage e devolve os metadados ---------- */
  async function enviarAnexos(app, protocolo, arquivos, avisar) {
    const lista = [];
    if (!arquivos.length) return lista;
    try {
      const S = await import(SDK + 'firebase-storage.js');
      const st = S.getStorage(app, 'gs://' + STORAGE_BUCKET);
      for (let i = 0; i < arquivos.length; i++) {
        const f = arquivos[i], tipo = ANEXO.tipos[extDe(f.name)] || f.type;
        const caminho = 'triagens/' + protocolo + '/' + (i + 1) + '-' + nomeSeguro(f.name);
        avisar('Enviando anexos (' + (i + 1) + ' de ' + arquivos.length + ')…');
        const ref = S.ref(st, caminho);
        await S.uploadBytes(ref, f, { contentType: tipo });
        lista.push({ nome: f.name.slice(0, 150), tamanho: f.size, tipo: tipo, caminho: caminho, url: await S.getDownloadURL(ref) });
      }
    } catch (e) {
      console.error('Falha ao enviar anexos:', e);
      throw { code: 'app/anexo', message: e && e.message };
    }
    return lista;
  }

  /* ---------- NOVA SOLICITAÇÃO ----------
     dados = { nome, cpf, nascimento, contato, medico }   arquivos = [File]
     Devolve { protocolo, criadoEm }. Ordem: protocolo livre → anexos → grava (lote atômico). */
  async function criar(dados, arquivos, avisar) {
    avisar = avisar || function () {};
    const c = await fb(), F = c.F;

    avisar('Gerando protocolo…');
    let protocolo = '';
    for (let t = 0; t < 8 && !protocolo; t++) {                 /* confere no banco se o sorteio já existe */
      const p = gerarProtocolo();
      if (!(await F.getDoc(F.doc(c.db, COLECAO, p))).exists()) protocolo = p;
    }
    if (!protocolo) throw { code: 'app/sem-protocolo' };

    const anexos = await enviarAnexos(c.app, protocolo, arquivos || [], avisar);

    avisar('Registrando solicitação…');
    const b = F.writeBatch(c.db);
    b.set(F.doc(c.db, COLECAO, protocolo), {            /* parte pública (consulta) */
      protocolo: protocolo,
      nome: dados.nome.trim(),
      medico: (dados.medico || '').trim(),
      status: STATUS.PENDENTE,                          /* status inicial */
      criadoEm: F.serverTimestamp()                     /* data/hora do servidor */
    });
    b.set(F.doc(c.db, COLECAO, protocolo, 'privado', 'dados'), {   /* parte sensível */
      cpf: so09(dados.cpf),
      nascimento: dados.nascimento || '',
      contato: so09(dados.contato),
      anexos: anexos
    });
    await b.commit();
    return { protocolo: protocolo, criadoEm: new Date() };
  }

  /* ---------- CONSULTA POR PROTOCOLO (leitura direta pelo id do documento) ---------- */
  async function buscar(protocolo) {
    const c = await fb(), s = await c.F.getDoc(c.F.doc(c.db, COLECAO, protocolo));
    if (!s.exists()) return null;
    const d = s.data();
    return { protocolo: s.id, nome: d.nome || '', medico: d.medico || '', status: d.status || STATUS.PENDENTE, criadoEm: paraData(d.criadoEm), atualizadoEm: paraData(d.atualizadoEm) };
  }

  /* ---------- PAINEL ADMIN (as regras só permitem à gestão) ---------- */

  /* lista as solicitações mais recentes primeiro (até 300) */
  async function listar() {
    const c = await fb(), F = c.F;
    const s = await F.getDocs(F.query(F.collection(c.db, COLECAO), F.orderBy('criadoEm', 'desc'), F.limit(300)));
    return s.docs.map(function (d) {
      const x = d.data();
      return { protocolo: d.id, nome: x.nome || '', medico: x.medico || '', status: x.status || STATUS.PENDENTE, criadoEm: paraData(x.criadoEm), atualizadoEm: paraData(x.atualizadoEm) };
    });
  }

  /* quantidade de solicitações pendentes (selo no cartão do painel) */
  async function contarPendentes() {
    const c = await fb(), F = c.F;
    return (await F.getCountFromServer(F.query(F.collection(c.db, COLECAO), F.where('status', '==', STATUS.PENDENTE)))).data().count;
  }

  /* dados sensíveis + anexos de uma solicitação */
  async function detalhes(protocolo) {
    const c = await fb(), s = await c.F.getDoc(c.F.doc(c.db, COLECAO, protocolo, 'privado', 'dados'));
    return s.exists() ? s.data() : null;
  }

  /* altera o status (grava também quem alterou e quando) */
  async function atualizarStatus(protocolo, status, por) {
    if (STATUS_LISTA.indexOf(status) < 0) throw new Error('Status inválido');
    const c = await fb(), F = c.F, b = F.writeBatch(c.db);
    b.update(F.doc(c.db, COLECAO, protocolo), { status: status, atualizadoEm: F.serverTimestamp() });
    b.update(F.doc(c.db, COLECAO, protocolo, 'privado', 'dados'), { atualizadoPor: String(por || '').slice(0, 60) });
    await b.commit();
  }

  window.Triagem = {
    STATUS: STATUS, STATUS_LISTA: STATUS_LISTA, STATUS_INFO: STATUS_INFO, ANEXO: ANEXO,
    criar: criar, buscar: buscar, listar: listar, contarPendentes: contarPendentes, detalhes: detalhes, atualizarStatus: atualizarStatus,
    normalizarProtocolo: normalizarProtocolo, gerarProtocolo: gerarProtocolo,
    badge: badge, erroMsg: erroMsg, fmtData: fmtData, fmtCPF: fmtCPF, fmtTel: fmtTel, fmtNasc: fmtNasc, fmtTamanho: fmtTamanho,
    /* expostos para teste */
    _t: { maskCPF: maskCPF, maskTel: maskTel, validarCPF: validarCPF, validarTel: validarTel, validarNascimento: validarNascimento }
  };

  /* =================================================================
     4) INTERFACE DA PÁGINA triagem.html
     ================================================================= */
  const form = document.getElementById('triForm');
  if (!form) return;                         /* painel.html e outras páginas usam só a API acima */

  const $ = id => document.getElementById(id);
  const msgForm = $('triMsg');
  const campos = {
    nome: $('fNome'), cpf: $('fCpf'), nascimento: $('fNasc'), contato: $('fTel'), medico: $('fMedico')
  };
  let arquivos = [];                         /* arquivos escolhidos (File) */
  let enviando = false;

  /* ---------- mensagens e erros por campo ---------- */
  function mostrar(el, tipo, texto) { el.className = 'au-msg show ' + tipo; el.textContent = texto; }
  function esconder(el) { el.className = 'au-msg'; el.textContent = ''; }
  function erroCampo(nome, texto) {
    const inp = campos[nome], e = $('e_' + nome);
    inp.classList.toggle('invalido', !!texto);
    inp.setAttribute('aria-invalid', texto ? 'true' : 'false');
    e.textContent = texto || '';
  }

  /* ---------- validação de cada campo (devolve texto do erro ou '') ---------- */
  const VALIDA = {
    nome: function (v) { return v.trim().length < 3 ? 'Informe o nome completo do paciente.' : ''; },
    cpf: function (v) { return v && !validarCPF(v) ? 'CPF inválido. Confira os 11 números.' : ''; },
    nascimento: function (v) { return v && !validarNascimento(v) ? 'Data de nascimento inválida.' : ''; },
    contato: function (v) { return v && !validarTel(v) ? 'Telefone inválido. Use DDD + número, ex.: (85) 99999-9999.' : ''; },
    medico: function (v) { return v.length > 120 ? 'Use no máximo 120 caracteres.' : ''; }
  };
  function validarCampo(n) { const t = VALIDA[n](campos[n].value); erroCampo(n, t); return !t; }

  /* máscaras ao digitar + validação ao sair do campo */
  campos.cpf.addEventListener('input', function () { campos.cpf.value = maskCPF(campos.cpf.value); if (campos.cpf.classList.contains('invalido')) validarCampo('cpf'); });
  campos.contato.addEventListener('input', function () { campos.contato.value = maskTel(campos.contato.value); if (campos.contato.classList.contains('invalido')) validarCampo('contato'); });
  Object.keys(campos).forEach(function (n) {
    campos[n].addEventListener('blur', function () { validarCampo(n); });
    campos[n].addEventListener('input', function () { if (campos[n].classList.contains('invalido')) validarCampo(n); });
  });
  campos.nascimento.max = new Date().toISOString().slice(0, 10);   /* seletor não deixa escolher data futura */
  campos.nascimento.min = '1900-01-01';

  /* ---------- anexos ---------- */
  const inputArq = $('triFiles'), drop = $('triDrop'), listaArq = $('triLista'), msgArq = $('triArqMsg');

  function renderArquivos() {
    listaArq.innerHTML = arquivos.map(function (f, i) {
      const pdf = extDe(f.name) === 'pdf';
      return '<li class="tg-file-item"><span class="tg-file-ico" aria-hidden="true">' + (pdf ? '📄' : '🖼️') + '</span>' +
        '<span class="tg-file-nome" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
        '<span class="tg-file-tam">' + fmtTamanho(f.size) + '</span>' +
        '<button type="button" class="tg-file-x" data-i="' + i + '" aria-label="Remover ' + esc(f.name) + '">×</button></li>';
    }).join('');
    listaArq.classList.toggle('hidden', !arquivos.length);
    $('triArqResumo').textContent = arquivos.length
      ? arquivos.length + ' arquivo(s) · ' + fmtTamanho(arquivos.reduce(function (s, f) { return s + f.size; }, 0))
      : '';
  }

  /* valida e acumula os arquivos escolhidos; os recusados são explicados */
  function adicionarArquivos(files) {
    const recusas = [];
    Array.prototype.forEach.call(files, function (f) {
      const ext = extDe(f.name);
      if (ANEXO.exts.indexOf(ext) < 0) return recusas.push('"' + f.name + '": formato não permitido (use PDF, JPG, JPEG ou PNG).');
      if (f.type && f.type !== ANEXO.tipos[ext] && !(ext === 'jpg' && f.type === 'image/jpeg')) return recusas.push('"' + f.name + '": o conteúdo não corresponde à extensão.');
      if (f.size === 0) return recusas.push('"' + f.name + '": arquivo vazio.');
      if (f.size > ANEXO.maxBytes) return recusas.push('"' + f.name + '": maior que ' + fmtTamanho(ANEXO.maxBytes) + '.');
      if (arquivos.some(function (a) { return a.name === f.name && a.size === f.size && a.lastModified === f.lastModified; })) return;   /* já escolhido */
      if (arquivos.length >= ANEXO.maxQtd) return recusas.push('"' + f.name + '": limite de ' + ANEXO.maxQtd + ' arquivos.');
      arquivos.push(f);
    });
    renderArquivos();
    if (recusas.length) mostrar(msgArq, 'warn', recusas.join(' ')); else esconder(msgArq);
  }

  inputArq.addEventListener('change', function () { adicionarArquivos(inputArq.files); inputArq.value = ''; });   /* limpa para poder escolher o mesmo arquivo de novo */
  listaArq.addEventListener('click', function (ev) {
    const b = ev.target.closest('.tg-file-x'); if (!b) return;
    arquivos.splice(Number(b.dataset.i), 1); renderArquivos(); esconder(msgArq);
  });
  /* arrastar e soltar */
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) adicionarArquivos(e.dataTransfer.files); });

  /* ---------- comprovante (modal) ---------- */
  function mostrarComprovante(r) {
    const m = UI.openModal({
      title: '✅ Solicitação enviada',
      sub: 'Guarde o número do protocolo para acompanhar',
      html: '<div class="tg-ok">' +
        '<p class="tg-ok-lbl">Número do protocolo</p>' +
        '<div class="tg-proto" id="tgProtoNum" aria-live="polite">' + esc(r.protocolo) + '</div>' +
        '<div class="tg-ok-meta">' + badge(STATUS.PENDENTE, true) + '<small>Enviada em ' + esc(fmtData(r.criadoEm)) + '</small></div>' +
        '<p class="au-note" style="margin-top:14px">Use este número na aba <b>Consultar Protocolo</b> para ver se a solicitação foi autorizada.</p></div>',
      foot: '<button class="btn ghost" id="tgIr" type="button">🔍 Consultar</button><button class="btn" id="tgCopiar" type="button">📋 Copiar Protocolo</button>'
    });
    m.foot.querySelector('#tgCopiar').onclick = function () { UI.copy(r.protocolo, 'Protocolo copiado!'); };
    m.foot.querySelector('#tgIr').onclick = function () { UI.closeModal(); abrirAba('consultar'); $('triProtocolo').value = r.protocolo; $('triBusca').requestSubmit(); };
  }

  /* ---------- envio ---------- */
  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (enviando) return;
    esconder(msgForm);
    const invalidos = Object.keys(campos).filter(function (n) { return !validarCampo(n); });
    if (invalidos.length) {
      mostrar(msgForm, 'err', 'Corrija os campos destacados antes de enviar.');
      campos[invalidos[0]].focus();
      return;
    }
    const btn = $('triEnviar'), rotulo = btn.textContent;
    enviando = true; btn.disabled = true;
    const avisar = function (t) { btn.textContent = '⏳ ' + t; };
    try {
      const r = await criar({
        nome: campos.nome.value, cpf: campos.cpf.value, nascimento: campos.nascimento.value,
        contato: campos.contato.value, medico: campos.medico.value
      }, arquivos, avisar);
      form.reset(); arquivos = []; renderArquivos(); esconder(msgArq);
      Object.keys(campos).forEach(function (n) { erroCampo(n, ''); });
      mostrarComprovante(r);
    } catch (e) {
      console.error('Falha ao enviar a solicitação:', e);
      mostrar(msgForm, 'err', erroMsg(e));
    }
    enviando = false; btn.disabled = false; btn.textContent = rotulo;
  });

  /* ---------- abas: Nova Solicitação / Consultar Protocolo ---------- */
  const abas = Array.prototype.slice.call(document.querySelectorAll('.tg-tabs button'));
  function abrirAba(nome) {
    abas.forEach(function (b) {
      const on = b.dataset.aba === nome;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
      $('aba-' + b.dataset.aba).classList.toggle('hidden', !on);
    });
    try { history.replaceState(null, '', nome === 'consultar' ? '#consultar' : location.pathname + location.search); } catch (e) {}
  }
  abas.forEach(function (b) {
    b.addEventListener('click', function () { abrirAba(b.dataset.aba); });
    b.addEventListener('keydown', function (e) {          /* setas ← → trocam de aba (acessibilidade) */
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const o = abas[(abas.indexOf(b) + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length];
      o.focus(); abrirAba(o.dataset.aba);
    });
  });

  /* ---------- consulta de protocolo ---------- */
  const resultado = $('triResultado'), msgBusca = $('triBuscaMsg');
  $('triProtocolo').addEventListener('input', function (e) { e.target.value = e.target.value.toUpperCase(); });

  function renderResultado(r) {
    resultado.innerHTML =
      '<article class="tg-res" aria-live="polite">' +
        '<header class="tg-res-head"><div><small>Protocolo</small><b>' + esc(r.protocolo) + '</b></div>' + badge(r.status, true) + '</header>' +
        '<dl class="tg-res-dl">' +
          '<div><dt>Paciente</dt><dd>' + esc(r.nome) + '</dd></div>' +
          '<div><dt>Médico sugerido / Solicitante</dt><dd>' + (r.medico ? esc(r.medico) : '—') + '</dd></div>' +
          '<div><dt>Data da solicitação</dt><dd>' + esc(fmtData(r.criadoEm)) + '</dd></div>' +
          (r.atualizadoEm ? '<div><dt>Última atualização</dt><dd>' + esc(fmtData(r.atualizadoEm)) + '</dd></div>' : '') +
        '</dl>' +
        '<footer><button class="btn ghost" id="tgCopiarRes" type="button">📋 Copiar Protocolo</button></footer>' +
      '</article>';
    $('tgCopiarRes').onclick = function () { UI.copy(r.protocolo, 'Protocolo copiado!'); };
  }

  $('triBusca').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    esconder(msgBusca); resultado.innerHTML = '';
    const p = normalizarProtocolo($('triProtocolo').value);
    if (!p) return mostrar(msgBusca, 'err', 'Protocolo inválido. Use o formato LIGA-XXXXX (5 letras ou números depois do hífen).');
    $('triProtocolo').value = p;
    const btn = $('triBuscar'); btn.disabled = true; btn.textContent = 'Buscando…';
    try {
      const r = await buscar(p);
      if (!r) mostrar(msgBusca, 'warn', 'Nenhuma solicitação encontrada com o protocolo ' + p + '. Confira o número e tente de novo.');
      else renderResultado(r);
    } catch (e) {
      console.error('Falha na consulta:', e);
      mostrar(msgBusca, 'err', erroMsg(e));
    }
    btn.disabled = false; btn.textContent = '🔍 Buscar';
  });

  /* link direto: triagem.html?protocolo=LIGA-XXXXX  (ou #consultar abre só a aba) */
  (function inicio() {
    const param = new URLSearchParams(location.search).get('protocolo');
    if (param) { abrirAba('consultar'); $('triProtocolo').value = param.toUpperCase(); $('triBusca').requestSubmit(); }
    else if (location.hash === '#consultar') abrirAba('consultar');
  })();
})();
