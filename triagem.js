/* =====================================================================
   triagem.js • Central de Marcação
   Módulo de TRIAGEM: nova solicitação, consulta de protocolo e a tela de gestão
   (lista de solicitações do Painel de Controle).

   Use depois do shell.js:
     <script src="shell.js"></script>
     <script src="triagem.js"></script>

   O arquivo faz três coisas:
     1) Expõe  window.Triagem  (API de leitura/escrita no Firestore, Firebase SDK v10 modular).
     2) Expõe  Triagem.renderAdmin(caixa, {usuario, onChange})  → tela de gestão usada pelo painel.html
        (busca, filtros, cartões, detalhes do paciente, anexos com pré-visualização e download).
     3) Se a página tiver o formulário #triForm (triagem.html), liga a interface.

   COLEÇÕES NO FIRESTORE
     triagens/{LIGA-XXXXX}                 → dados PÚBLICOS da consulta
         { protocolo, nome, medico, medicoEspecialidade?, medicoCrm?, status, criadoEm, atualizadoEm? }
     triagens/{LIGA-XXXXX}/privado/dados   → dados SENSÍVEIS (só a gestão lê)
         { cpf, nascimento, contato, anexos:[{nome,tipo,tamanho,partes}], atualizadoPor? }
   (Os dados sensíveis ficam separados para que quem consulta um protocolo nunca receba CPF/telefone.)

   ARQUIVOS ANEXOS ficam no próprio Firestore (sem Firebase Storage, plano gratuito):
     triagens/{LIGA-XXXXX}/anexos/{n}_{parte}  { arquivo, parte, dados(base64) }
   Imagens são reduzidas/comprimidas no navegador; cada arquivo é cortado em partes de ~700 KB
   (limite de 1 MiB por documento do Firestore). NÃO há limite de quantidade de anexos: a gravação
   é dividida em vários lotes (um lote do Firestore aceita ~10 MiB). Só a gestão lê.
   ===================================================================== */
(function () {
  'use strict';

  /* =================================================================
     1) CONFIGURAÇÃO  (ajuste aqui)
     ================================================================= */

  /* Mesmos dados do core.js. Precisam ser IDÊNTICOS para os dois arquivos compartilharem o mesmo app Firebase. */
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDIi1Z4-4xDJ7G6fVcmbmJnd8aX4022gXk",
    authDomain: "teste-infotratamento.firebaseapp.com",
    projectId: "teste-infotratamento",
    appId: "1:662089972473:web:d61716f85168a2ab4f0028"
  };

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';   /* mesma versão do core.js */
  const COLECAO = 'triagens';

  /* Status possíveis (o texto é exatamente o que fica salvo no Firestore) */
  const STATUS = { PENDENTE: 'Pendente', AUTORIZADO: 'Autorizado', NAO_AUTORIZADO: 'Não Autorizado', ANALISANDO: 'Analisando' };
  const STATUS_LISTA = [STATUS.PENDENTE, STATUS.ANALISANDO, STATUS.AUTORIZADO, STATUS.NAO_AUTORIZADO];
  const STATUS_INFO = {
    'Pendente':       { cls: 'pendente',   ico: '🟡', desc: 'Aguardando análise' },
    'Analisando':     { cls: 'analisando', ico: '🔵', desc: 'Em análise pela equipe' },
    'Autorizado':     { cls: 'autorizado', ico: '🟢', desc: 'Solicitação liberada' },
    'Não Autorizado': { cls: 'recusado',   ico: '🔴', desc: 'Solicitação recusada' }
  };

  /* Regras dos anexos. NÃO existe limite de quantidade nem de soma total.
     Os limites abaixo são só por arquivo (cada um precisa caber no Firestore) e do lote de gravação. */
  const ANEXO = {
    exts: ['pdf', 'jpg', 'jpeg', 'png'],
    tipos: { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' },
    maxPdf: 3 * 1024 * 1024,             /* PDF não comprime: até 3 MB cada */
    maxImagemOrigem: 15 * 1024 * 1024,   /* foto escolhida/colada (será reduzida) */
    maxFinal: 3 * 1024 * 1024,           /* tamanho de cada arquivo depois do preparo */
    lado: 1800,                          /* imagens: maior lado em pixels */
    qualidade: 0.75,                     /* imagens: qualidade JPEG */
    parte: 700000,                       /* caracteres base64 por documento */
    loteChars: 6000000,                  /* caracteres base64 por lote de gravação (< 10 MiB do Firestore) */
    loteOps: 400,                        /* documentos por lote (máx. do Firestore: 500) */
    janelaMin: 30                        /* minutos após o registro em que os lotes extras de anexos são aceitos */
  };

  /* Alfabeto do protocolo: sem 0/O e 1/I (confundem na hora de ditar por telefone). 32 letras = sem viés no sorteio. */
  const PROTO_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PROTO_RE = /^LIGA-[A-HJ-NP-Z2-9]{5}$/;

  const esc = (window.UI && UI.esc) || function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* =================================================================
     2) UTILITÁRIOS (máscaras, validações, formatação) — sem dependência do Firebase
     ================================================================= */
  const so09 = v => String(v || '').replace(/\D/g, '');

  /* 00000000000 → 000.000.000-00 (formata enquanto digita; o separador é sempre o hífen "-" comum) */
  function maskCPF(v) {
    v = so09(v).slice(0, 11);
    let o = v.slice(0, 3);
    if (v.length > 3) o += '.' + v.slice(3, 6);
    if (v.length > 6) o += '.' + v.slice(6, 9);
    if (v.length > 9) o += '-' + v.slice(9, 11);
    return o;
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

  const fmtCPF = v => so09(v) ? maskCPF(v) : '—';
  const fmtTel = v => so09(v) ? maskTel(v) : '—';
  const fmtNasc = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('/') : '—';   /* sem new Date: evita erro de fuso */
  const fmtData = d => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  /* Idade por extenso a partir de AAAA-MM-DD ("31 anos", "1 ano", "8 meses"); '' se a data for inválida */
  function idadeDe(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return '';
    const p = v.split('-').map(Number), h = new Date();
    let anos = h.getFullYear() - p[0];
    const antes = (h.getMonth() + 1 < p[1]) || (h.getMonth() + 1 === p[1] && h.getDate() < p[2]);
    if (antes) anos--;
    if (anos < 0) return '';
    if (anos >= 1) return anos + (anos === 1 ? ' ano' : ' anos');
    let meses = (h.getFullYear() - p[0]) * 12 + (h.getMonth() + 1 - p[1]) - (h.getDate() < p[2] ? 1 : 0);
    if (meses < 1) return 'menos de 1 mês';
    return meses + (meses === 1 ? ' mês' : ' meses');
  }
  /* 1995-04-09 → "09/04/1995 (31 anos)" */
  function fmtNascIdade(v) {
    const n = fmtNasc(v), i = idadeDe(v);
    return i ? n + ' (' + i + ')' : n;
  }

  function fmtTamanho(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1).replace('.', ',') + ' KB';
    return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  const extDe = nome => { const m = /\.([a-z0-9]+)$/i.exec(nome || ''); return m ? m[1].toLowerCase() : ''; };

  /* Ícones (SVG de traço simples, herdam a cor do texto) */
  const ICO = {
    zap:   '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    search:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    eye:   '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    down:  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
    clip:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>'
  };

  /* Contato com máscara + botões de ação (WhatsApp só para celular; ligar para qualquer número) */
  function contatoHTML(v) {
    const d = so09(v);
    if (!d) return '<span class="tg-vazio">—</span>';
    const completo = d.length === 10 || d.length === 11;
    let h = '<span class="tg-contact"><span class="tg-tel">' + esc(maskTel(d)) + '</span>';
    if (completo) {
      if (d.length === 11 && d.charAt(2) === '9')
        h += '<a class="tg-act wa" href="https://wa.me/55' + d + '" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp" aria-label="Abrir WhatsApp de ' + esc(maskTel(d)) + '">' + ICO.zap + 'WhatsApp</a>';
      h += '<a class="tg-act tel" href="tel:+55' + d + '" title="Ligar" aria-label="Ligar para ' + esc(maskTel(d)) + '">' + ICO.phone + 'Ligar</a>';
    }
    return h + '</span>';
  }

  /* Médico solicitante: nome completo (quebra de linha, nunca corta) + especialidade e CRM quando existirem */
  function medicoHTML(m) {
    if (!m || !m.medico) return '<span class="tg-vazio">Não informado</span>';
    const crm = m.medicoCrm ? (/^crm/i.test(m.medicoCrm) ? m.medicoCrm : 'CRM ' + m.medicoCrm) : '';
    const sub = [m.medicoEspecialidade, crm].filter(Boolean);
    return '<span class="tg-med-nome">' + esc(m.medico) + '</span>' +
      (sub.length ? '<span class="tg-med-sub">' + sub.map(esc).join(' · ') + '</span>' : '');
  }

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
    return '<span class="tg-badge ' + i.cls + '"><i aria-hidden="true"></i>' + esc(status || STATUS.PENDENTE) +
      (comDescricao ? '<small>' + esc(i.desc) + '</small>' : '') + '</span>';
  }

  /* Traduz o erro técnico em texto que a pessoa entende */
  function erroMsg(e) {
    const c = e && e.code;
    if (c === 'app/anexo-tamanho') return (e && e.message) || 'Um dos anexos ficou grande demais.';
    if (c === 'app/anexo') return 'Não foi possível preparar um dos anexos. Tente outro arquivo ou envie uma foto menor. Nada foi registrado.';
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

  /* converte o documento público em objeto da aplicação */
  function paraSolicitacao(id, d) {
    return {
      protocolo: id, nome: d.nome || '', medico: d.medico || '',
      medicoEspecialidade: d.medicoEspecialidade || '', medicoCrm: d.medicoCrm || '',
      status: d.status || STATUS.PENDENTE, criadoEm: paraData(d.criadoEm), atualizadoEm: paraData(d.atualizadoEm)
    };
  }

  /* ---------- prepara os anexos: reduz imagens, converte em base64 e corta em partes ---------- */
  function lerBase64(blob) {
    return new Promise(function (ok, erro) {
      const r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { erro(r.error); };
      r.readAsDataURL(blob);
    });
  }

  /* foto → JPEG com no máx. 1800 px de lado (fundo branco para PNG com transparência).
     Se o resultado não ficar menor que o original, mantém o original. */
  async function reduzirImagem(f) {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, ANEXO.lado / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(bmp, 0, 0, cv.width, cv.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', ANEXO.qualidade); });
    return blob && blob.size < f.size ? { blob: blob, tipo: 'image/jpeg', nome: f.name.replace(/\.[^.]+$/, '') + '.jpg' } : { blob: f, tipo: ANEXO.tipos[extDe(f.name)] || f.type, nome: f.name };
  }

  /* Sem limite de quantidade nem de soma: só confere o tamanho de cada arquivo depois do preparo */
  async function prepararAnexos(arquivos, avisar) {
    const saida = [];
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i];
      avisar('Preparando anexos (' + (i + 1) + ' de ' + arquivos.length + ')…');
      let p;
      try { p = extDe(f.name) === 'pdf' ? { blob: f, tipo: 'application/pdf', nome: f.name } : await reduzirImagem(f); }
      catch (e) { console.error('Falha ao preparar anexo:', e); throw { code: 'app/anexo' }; }
      if (p.blob.size > ANEXO.maxFinal) throw { code: 'app/anexo-tamanho', message: '"' + f.name + '" continua maior que ' + fmtTamanho(ANEXO.maxFinal) + ' mesmo depois de reduzido. Use um arquivo menor.' };
      const b64 = await lerBase64(p.blob), partes = [];
      for (let k = 0; k < b64.length; k += ANEXO.parte) partes.push(b64.slice(k, k + ANEXO.parte));
      saida.push({ nome: p.nome.slice(0, 150), tipo: p.tipo, tamanho: p.blob.size, partes: partes });
    }
    return saida;
  }

  /* ---------- NOVA SOLICITAÇÃO ----------
     dados = { nome, cpf, nascimento, contato, medico, medicoEspecialidade?, medicoCrm? }   arquivos = [File]
     Devolve { protocolo, criadoEm }.
     Ordem: protocolo livre → anexos preparados → lote 1 (solicitação + dados + primeiros anexos, atômico)
            → lotes seguintes só com partes de anexos (quando há muitos arquivos). */
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

    const prontos = await prepararAnexos(arquivos || [], avisar);   /* antes de gravar: se falhar, nada é registrado */

    /* distribui as partes em lotes (limite de tamanho e de operações por gravação) */
    const lotes = [{ itens: [], chars: 0 }];
    prontos.forEach(function (a, i) {
      a.partes.forEach(function (conteudo, k) {
        let l = lotes[lotes.length - 1];
        if (l.itens.length && (l.itens.length >= ANEXO.loteOps - 3 || l.chars + conteudo.length > ANEXO.loteChars)) { l = { itens: [], chars: 0 }; lotes.push(l); }
        l.itens.push({ i: i, k: k, dados: conteudo }); l.chars += conteudo.length;
      });
    });

    const addPartes = function (b, lote) {
      lote.itens.forEach(function (x) {
        b.set(F.doc(c.db, COLECAO, protocolo, 'anexos', x.i + '_' + x.k), { arquivo: x.i, parte: x.k, dados: x.dados });
      });
    };

    avisar(lotes.length > 1 ? 'Registrando solicitação (1 de ' + lotes.length + ')…' : 'Registrando solicitação…');
    const pub = {                                        /* parte pública (consulta) */
      protocolo: protocolo,
      nome: dados.nome.trim(),
      medico: (dados.medico || '').trim(),
      status: STATUS.PENDENTE,                           /* status inicial */
      criadoEm: F.serverTimestamp()                      /* data/hora do servidor */
    };
    const esp = (dados.medicoEspecialidade || '').trim();
    if (esp) pub.medicoEspecialidade = esp;              /* só grava quando preenchido */

    const b = F.writeBatch(c.db);
    b.set(F.doc(c.db, COLECAO, protocolo), pub);
    b.set(F.doc(c.db, COLECAO, protocolo, 'privado', 'dados'), {   /* parte sensível */
      cpf: so09(dados.cpf),
      nascimento: dados.nascimento || '',
      contato: so09(dados.contato),
      anexos: prontos.map(function (a) { return { nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, partes: a.partes.length }; })
    });
    addPartes(b, lotes[0]);
    await b.commit();
    const criadoEm = new Date();

    /* lotes extras: cada um é tentado até 3 vezes; se algum falhar a solicitação já existe, então avisamos */
    let falhas = 0;
    for (let n = 1; n < lotes.length; n++) {
      avisar('Enviando anexos (' + (n + 1) + ' de ' + lotes.length + ')…');
      let ok = false;
      for (let t = 0; t < 3 && !ok; t++) {
        try { const bx = F.writeBatch(c.db); addPartes(bx, lotes[n]); await bx.commit(); ok = true; }
        catch (e) { console.error('Falha no lote de anexos ' + (n + 1) + ':', e); await new Promise(function (r) { setTimeout(r, 600 * (t + 1)); }); }
      }
      if (!ok) falhas++;
    }
    return { protocolo: protocolo, criadoEm: criadoEm, anexosIncompletos: falhas > 0, lotesComFalha: falhas };
  }

  /* ---------- CONSULTA POR PROTOCOLO (leitura direta pelo id do documento) ---------- */
  async function buscar(protocolo) {
    const c = await fb(), s = await c.F.getDoc(c.F.doc(c.db, COLECAO, protocolo));
    return s.exists() ? paraSolicitacao(s.id, s.data()) : null;
  }

  /* ---------- PAINEL ADMIN (as regras só permitem à gestão) ---------- */

  /* lista as solicitações mais recentes primeiro (até 300) */
  async function listar() {
    const c = await fb(), F = c.F;
    const s = await F.getDocs(F.query(F.collection(c.db, COLECAO), F.orderBy('criadoEm', 'desc'), F.limit(300)));
    return s.docs.map(function (d) { return paraSolicitacao(d.id, d.data()); });
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

  /* baixa as partes de um anexo, junta e devolve um Blob (guardado em memória para não baixar de novo) */
  const cacheAnexos = new Map();
  async function obterAnexo(protocolo, i, a) {
    const chave = protocolo + '#' + i;
    if (cacheAnexos.has(chave)) return cacheAnexos.get(chave);
    const c = await fb(), F = c.F;
    const docs = await Promise.all(Array.from({ length: a.partes }, function (_, k) { return F.getDoc(F.doc(c.db, COLECAO, protocolo, 'anexos', i + '_' + k)); }));
    if (docs.some(function (d) { return !d.exists(); })) throw new Error('Anexo incompleto no banco de dados.');
    const bin = atob(docs.map(function (d) { return d.data().dados; }).join(''));
    const bytes = new Uint8Array(bin.length);
    for (let n = 0; n < bin.length; n++) bytes[n] = bin.charCodeAt(n);
    const blob = new Blob([bytes], { type: a.tipo });
    cacheAnexos.set(chave, blob);
    return blob;
  }

  /* abre um anexo numa nova aba (mantido por compatibilidade) */
  async function abrirAnexo(protocolo, i, a) {
    const url = URL.createObjectURL(await obterAnexo(protocolo, i, a));
    window.open(url, '_blank', 'noopener');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* exclui a solicitação inteira: anexos, dados privados e documento público (as regras só permitem ao administrador) */
  async function excluirTriagem(protocolo) {
    const c = await fb(), F = c.F;
    const refs = (await F.getDocs(F.collection(c.db, COLECAO, protocolo, 'anexos'))).docs.map(function (d) { return d.ref; });
    refs.push(F.doc(c.db, COLECAO, protocolo, 'privado', 'dados'));
    for (let k = 0; k < refs.length; k += 400) {
      const b = F.writeBatch(c.db);
      refs.slice(k, k + 400).forEach(function (r) { b.delete(r); });
      await b.commit();
    }
    await F.deleteDoc(F.doc(c.db, COLECAO, protocolo));
    for (const k of Array.from(cacheAnexos.keys())) if (k.indexOf(protocolo) === 0) cacheAnexos.delete(k);
  }

  /* altera o status (grava também quem alterou e quando) */
  async function atualizarStatus(protocolo, status, por) {
    if (STATUS_LISTA.indexOf(status) < 0) throw new Error('Status inválido');
    const c = await fb(), F = c.F, b = F.writeBatch(c.db);
    b.update(F.doc(c.db, COLECAO, protocolo), { status: status, atualizadoEm: F.serverTimestamp() });
    b.update(F.doc(c.db, COLECAO, protocolo, 'privado', 'dados'), { atualizadoPor: String(por || '').slice(0, 60) });
    await b.commit();
  }

  /* =================================================================
     3b) PRÉ-VISUALIZAÇÃO E DOWNLOAD (usados no formulário e na gestão)
     itens = [{ nome, tipo, tamanho, obter: () => Promise<Blob> }]
     ================================================================= */
  function baixarBlob(blob, nome) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome || 'arquivo'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  let urlPrevia = null;
  function visualizar(itens, pos) {
    if (!itens || !itens[pos] || !window.UI) return;
    const it = itens[pos], pdf = it.tipo === 'application/pdf' || extDe(it.nome) === 'pdf', n = itens.length;
    if (urlPrevia) { URL.revokeObjectURL(urlPrevia); urlPrevia = null; }
    const m = UI.openModal({
      stack: true,
      title: it.nome, sub: (n > 1 ? (pos + 1) + ' de ' + n + ' · ' : '') + fmtTamanho(it.tamanho || 0), size: 'wide',
      html: '<div class="tg-prev" aria-live="polite"><span class="tg-prev-load">Carregando…</span></div>',
      foot: (n > 1 ? '<button type="button" class="tg-btn" data-nav="-1">‹ Anterior</button><button type="button" class="tg-btn" data-nav="1">Próximo ›</button>' : '') +
            '<button type="button" class="tg-btn primary" data-baixar>' + ICO.down + ' Baixar</button>'
    });
    let blob = null;
    m.foot.onclick = function (ev) {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.nav) { UI.backModal(); visualizar(itens, (pos + Number(b.dataset.nav) + n) % n); }
      else if (b.hasAttribute('data-baixar') && blob) baixarBlob(blob, it.nome);
    };
    /* clicar no contêiner / área em branco volta para a tela anterior (detalhe da triagem) */
    m.body.onclick = function (ev) {
      if (!m.body.contains(ev.target) || ev.target.closest('img, iframe')) return;   /* ignora o clique que abriu o visualizador */
      UI.backModal();
    };
    Promise.resolve(it.obter()).then(function (bl) {
      blob = bl; urlPrevia = URL.createObjectURL(bl);
      const box = m.body.querySelector('.tg-prev'); if (!box) return;
      box.innerHTML = pdf
        ? '<iframe title="' + esc(it.nome) + '" src="' + urlPrevia + '"></iframe>'
        : '<img alt="' + esc(it.nome) + '" src="' + urlPrevia + '">';
    }).catch(function (e) {
      const box = m.body.querySelector('.tg-prev'); if (box) box.innerHTML = '<span class="tg-prev-load">' + esc(erroMsg(e)) + '</span>';
    });
  }

  /* =================================================================
     3c) TELA DE GESTÃO (usada pelo Painel de Controle)
     renderAdmin(caixa, { usuario: 'quem está logado', onChange: fn })
     ================================================================= */
  const normTxt = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  async function renderAdmin(box, ctx) {
    ctx = ctx || {};
    box.innerHTML = '<div class="tg-admin"><div class="au-empty">Carregando solicitações…</div></div>';
    let itens;
    try { itens = await listar(); }
    catch (e) { box.innerHTML = '<div class="au-msg err show">' + esc(erroMsg(e)) + '</div>'; return; }

    let filtro = 'todos', busca = '';
    const cont = f => f === 'todos' ? itens.length : itens.filter(function (i) { return i.status === f; }).length;

    box.innerHTML =
      '<div class="tg-admin">' +
        '<div class="au-msg" id="tMsg" role="alert"></div>' +
        '<div class="tg-toolbar">' +
          '<label class="tg-search">' + ICO.search + '<input id="tBusca" type="search" placeholder="Buscar por protocolo, paciente ou médico…" autocomplete="off" aria-label="Buscar solicitações"></label>' +
          '<div class="tg-filters" id="tChips" role="group" aria-label="Filtrar por status"></div>' +
        '</div>' +
        '<p class="tg-count" id="tCount" aria-live="polite"></p>' +
        '<div class="tg-cards" id="tLista"></div>' +
      '</div>';
    const $a = s => box.querySelector(s), msg = $a('#tMsg'), lista = $a('#tLista');
    function aviso(tipo, t) { msg.className = 'au-msg show ' + tipo; msg.textContent = t; }

    function chips() {
      $a('#tChips').innerHTML = ['todos'].concat(STATUS_LISTA).map(function (f) {
        const cls = f === 'todos' ? 'todos' : STATUS_INFO[f].cls;
        return '<button type="button" class="tg-filter ' + cls + (f === filtro ? ' active' : '') + '" data-f="' + esc(f) + '" aria-pressed="' + (f === filtro) + '">' +
          '<i class="tg-dot" aria-hidden="true"></i>' + (f === 'todos' ? 'Todos' : esc(f)) + '<em>' + cont(f) + '</em></button>';
      }).join('');
    }

    function rodape(i) {
      if (!i.atualizadoEm) return 'Sem alteração de status desde o registro';
      return 'Última alteração' + (i.por ? ' por <b>' + esc(i.por) + '</b>' : '') + ' · ' + esc(fmtData(i.atualizadoEm));
    }

    function cardHTML(i) {
      const info = STATUS_INFO[i.status] || STATUS_INFO[STATUS.PENDENTE];
      return '<article class="tg-card ' + info.cls + '" data-p="' + esc(i.protocolo) + '">' +
        '<header class="tg-card-head"><div class="tg-card-id"><span class="tg-proto-tag">' + esc(i.protocolo) + '</span><h3>' + esc(i.nome) + '</h3></div>' +
          '<span data-badge>' + badge(i.status) + '</span></header>' +
        '<div class="tg-card-acts">' +
          '<label class="tg-status-sel"><span>Alterar status</span>' +
            '<select class="tg-select" data-st="' + esc(i.protocolo) + '" aria-label="Alterar status de ' + esc(i.protocolo) + '">' +
              STATUS_LISTA.map(function (s) { return '<option' + (s === i.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
            '</select></label>' +
          '<button class="tg-btn" type="button" data-det="' + esc(i.protocolo) + '" aria-expanded="false">Ver detalhes</button>' +
          (ctx.admin ? '<button class="tg-btn danger" type="button" data-del="' + esc(i.protocolo) + '" title="Excluir esta triagem (somente Administrador)">🗑️ Excluir</button>' : '') +
        '</div>' +
        '<dl class="tg-card-meta">' +
          '<div><dt>Médico solicitado</dt><dd class="tg-med">' + medicoHTML(i) + '</dd></div>' +
          '<div><dt>Solicitada em</dt><dd>' + esc(fmtData(i.criadoEm)) + '</dd></div>' +
        '</dl>' +
        '<div class="tg-det hidden"></div>' +
        '<footer class="tg-card-foot" data-foot>' + rodape(i) + '</footer>' +
      '</article>';
    }

    function desenhar() {
      const f = normTxt(busca);
      const vis = itens.filter(function (i) {
        return (filtro === 'todos' || i.status === filtro) &&
          (!f || normTxt(i.protocolo + ' ' + i.nome + ' ' + i.medico + ' ' + i.medicoEspecialidade + ' ' + i.medicoCrm).indexOf(f) >= 0);
      });
      $a('#tCount').textContent = vis.length + (vis.length === 1 ? ' solicitação' : ' solicitações');
      lista.innerHTML = vis.length ? vis.map(cardHTML).join('') : '<div class="au-empty">Nenhuma solicitação encontrada.</div>';
    }

    function detalhesHTML(p, x) {
      const anexos = x.anexos || [];
      return '<dl class="tg-det-grid">' +
          '<div><dt>CPF</dt><dd>' + esc(fmtCPF(x.cpf)) + '</dd></div>' +
          '<div><dt>Data de nascimento</dt><dd>' + esc(fmtNascIdade(x.nascimento)) + '</dd></div>' +
          '<div class="tg-wide"><dt>Contato</dt><dd>' + contatoHTML(x.contato) + '</dd></div>' +
        '</dl>' +
        '<section class="tg-anexos"><h4>Anexos <span>' + anexos.length + '</span></h4>' +
          (anexos.length ? '<ul class="tg-thumbs">' + anexos.map(function (a, n) {
            const pdf = a.tipo === 'application/pdf';
            return '<li class="tg-thumb-card"><button type="button" class="tg-thumb" data-prev="' + n + '" aria-label="Visualizar ' + esc(a.nome) + '">' +
                (pdf ? '<span class="tg-thumb-ico">📄</span>' : '<span class="tg-thumb-ico" data-img="' + n + '">🖼️</span>') + '</button>' +
              '<div class="tg-thumb-info"><span class="tg-thumb-nome" title="' + esc(a.nome) + '">' + esc(a.nome) + '</span><small>' + esc(fmtTamanho(a.tamanho || 0)) + '</small></div>' +
              '<div class="tg-thumb-acts"><button type="button" class="tg-mini" data-prev="' + n + '">' + ICO.eye + ' Ver</button>' +
              '<button type="button" class="tg-mini" data-dl="' + n + '">' + ICO.down + ' Baixar</button></div></li>';
          }).join('') + '</ul>' : '<p class="tg-vazio">Nenhum anexo enviado.</p>') +
        '</section>';
    }

    /* miniaturas das imagens: carregadas uma a uma depois que o painel abre */
    async function miniaturas(p, anexos, det) {
      for (let n = 0; n < anexos.length; n++) {
        const a = anexos[n]; if (a.tipo === 'application/pdf') continue;
        const ph = det.querySelector('[data-img="' + n + '"]'); if (!ph) continue;
        try {
          const url = URL.createObjectURL(await obterAnexo(p, n, a));
          if (!det.isConnected) { URL.revokeObjectURL(url); return; }
          ph.outerHTML = '<img alt="" src="' + url + '">';
        } catch (e) { /* mantém o ícone */ }
      }
    }

    async function abrirDetalhes(card, btn) {
      const p = card.dataset.p, it = itens.find(function (x) { return x.protocolo === p; }), d = card.querySelector('.tg-det');
      if (!d.classList.contains('hidden')) { d.classList.add('hidden'); btn.textContent = 'Ver detalhes'; btn.setAttribute('aria-expanded', 'false'); return; }
      d.classList.remove('hidden'); btn.textContent = 'Ocultar detalhes'; btn.setAttribute('aria-expanded', 'true');
      d.innerHTML = '<p class="tg-vazio">Carregando…</p>';
      try {
        if (!it.det) it.det = await detalhes(p);
        const x = it.det;
        if (!x) { d.innerHTML = '<p class="tg-vazio">Sem dados adicionais.</p>'; return; }
        if (x.atualizadoPor && !it.por) { it.por = x.atualizadoPor; card.querySelector('[data-foot]').innerHTML = rodape(it); }
        d.innerHTML = detalhesHTML(p, x);
        miniaturas(p, x.anexos || [], d);
      } catch (e) { d.innerHTML = '<p class="tg-vazio">' + esc(erroMsg(e)) + '</p>'; }
    }

    /* cliques (delegação): detalhes, ver anexo, baixar anexo */
    lista.addEventListener('click', async function (ev) {
      const card = ev.target.closest('.tg-card'); if (!card) return;
      const p = card.dataset.p, it = itens.find(function (x) { return x.protocolo === p; });
      const bx = ev.target.closest('[data-del]');
      if (bx) {
        if (!ctx.admin || !it) return;
        if (!confirm('Excluir definitivamente a triagem ' + p + ' (' + it.nome + ')?\n\nOs dados do paciente e todos os anexos serão apagados. Esta ação não pode ser desfeita.')) return;
        bx.disabled = true;
        try {
          await excluirTriagem(p);
          itens.splice(itens.indexOf(it), 1);
          chips(); desenhar();
          if (window.UI) UI.toast('Triagem ' + p + ' excluída');
          if (ctx.onChange) ctx.onChange(it);
        } catch (e) { bx.disabled = false; aviso('err', erroMsg(e)); }
        return;
      }
      const bd = ev.target.closest('[data-det]'), bp = ev.target.closest('[data-prev]'), bl = ev.target.closest('[data-dl]');
      if (bd) return abrirDetalhes(card, bd);
      if (!it || !it.det) return;
      const anexos = it.det.anexos || [];
      if (bp) {
        visualizar(anexos.map(function (a, n) { return { nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, obter: function () { return obterAnexo(p, n, a); } }; }), Number(bp.dataset.prev));
      } else if (bl) {
        const n = Number(bl.dataset.dl); bl.disabled = true;
        try { baixarBlob(await obterAnexo(p, n, anexos[n]), anexos[n].nome); }
        catch (e) { aviso('err', erroMsg(e)); }
        bl.disabled = false;
      }
    });

    /* altera o status direto no Firestore e atualiza o cartão no lugar (sem fechar os detalhes) */
    lista.addEventListener('change', async function (ev) {
      const sel = ev.target.closest('[data-st]'); if (!sel) return;
      const it = itens.find(function (x) { return x.protocolo === sel.dataset.st; }), novo = sel.value, antigo = it.status;
      if (novo === antigo) return;
      sel.disabled = true; msg.className = 'au-msg';
      try {
        await atualizarStatus(it.protocolo, novo, ctx.usuario);
        it.status = novo; it.atualizadoEm = new Date(); it.por = String(ctx.usuario || '').slice(0, 60);
        if (window.UI) UI.toast('Status atualizado: ' + novo);
        chips();
        if (filtro !== 'todos' && filtro !== novo) desenhar();
        else {
          const card = sel.closest('.tg-card'), info = STATUS_INFO[novo];
          card.className = 'tg-card ' + info.cls;
          card.querySelector('[data-badge]').innerHTML = badge(novo);
          card.querySelector('[data-foot]').innerHTML = rodape(it);
          sel.disabled = false;
        }
        if (ctx.onChange) ctx.onChange(it);
      } catch (e) { sel.value = antigo; sel.disabled = false; aviso('err', erroMsg(e)); }
    });

    $a('#tChips').addEventListener('click', function (ev) {
      const b = ev.target.closest('[data-f]'); if (!b) return;
      filtro = b.dataset.f; chips(); desenhar();
    });
    const deb = (window.UI && UI.debounce) || function (fn) { return fn; };
    $a('#tBusca').addEventListener('input', deb(function (ev) { busca = ev.target.value; desenhar(); }, 80));
    chips(); desenhar();
  }

  window.Triagem = {
    STATUS: STATUS, STATUS_LISTA: STATUS_LISTA, STATUS_INFO: STATUS_INFO, ANEXO: ANEXO,
    criar: criar, buscar: buscar, listar: listar, contarPendentes: contarPendentes, detalhes: detalhes,
    obterAnexo: obterAnexo, abrirAnexo: abrirAnexo, atualizarStatus: atualizarStatus, excluirTriagem: excluirTriagem, renderAdmin: renderAdmin,
    visualizar: visualizar, baixarBlob: baixarBlob,
    normalizarProtocolo: normalizarProtocolo, gerarProtocolo: gerarProtocolo,
    badge: badge, erroMsg: erroMsg, fmtData: fmtData, fmtCPF: fmtCPF, fmtTel: fmtTel, fmtNasc: fmtNasc, fmtNascIdade: fmtNascIdade,
    idadeDe: idadeDe, fmtTamanho: fmtTamanho, contatoHTML: contatoHTML, medicoHTML: medicoHTML,
    /* expostos para teste */
    _t: { maskCPF: maskCPF, maskTel: maskTel, validarCPF: validarCPF, validarTel: validarTel, validarNascimento: validarNascimento, idadeDe: idadeDe }
  };

  /* =================================================================
     4) INTERFACE DA PÁGINA triagem.html
     ================================================================= */
  const form = document.getElementById('triForm');
  if (!form) return;                         /* painel.html e outras páginas usam só a API acima */

  const $ = id => document.getElementById(id);
  const msgForm = $('triMsg');
  const campos = {
    nome: $('fNome'), cpf: $('fCpf'), nascimento: $('fNasc'), contato: $('fTel'),
    medico: $('fMedico'), especialidade: $('fEsp')
  };
  let arquivos = [];                         /* arquivos escolhidos (File) */
  let enviando = false;
  const previas = new Map();                 /* File → URL da miniatura (liberada ao remover) */

  /* ---------- mensagens e erros por campo ---------- */
  function mostrar(el, tipo, texto) { el.className = 'au-msg show ' + tipo; el.textContent = texto; }
  function esconder(el) { el.className = 'au-msg'; el.textContent = ''; }
  function erroCampo(nome, texto) {
    const inp = campos[nome], e = $('e_' + nome);
    inp.classList.toggle('invalido', !!texto);
    inp.setAttribute('aria-invalid', texto ? 'true' : 'false');
    if (e) e.textContent = texto || '';
  }

  /* ---------- validação de cada campo (devolve texto do erro ou '') ---------- */
  const VALIDA = {
    nome: function (v) { return v.trim().length < 3 ? 'Informe o nome completo do paciente.' : ''; },
    cpf: function (v) { return v && !validarCPF(v) ? 'CPF inválido. Confira os 11 números.' : ''; },
    nascimento: function (v) { return v && !validarNascimento(v) ? 'Data de nascimento inválida.' : ''; },
    contato: function (v) { return v && !validarTel(v) ? 'Telefone inválido. Use DDD + número, ex.: (85) 99999-9999.' : ''; },
    medico: function (v) { return v.length > 120 ? 'Use no máximo 120 caracteres.' : ''; },
    especialidade: function (v) { return v.length > 80 ? 'Use no máximo 80 caracteres.' : ''; }
  };
  function validarCampo(n) { const t = VALIDA[n](campos[n].value); erroCampo(n, t); return !t; }

  /* máscaras ao digitar + validação ao sair do campo */
  campos.cpf.addEventListener('input', function () { campos.cpf.value = maskCPF(campos.cpf.value); });
  campos.contato.addEventListener('input', function () { campos.contato.value = maskTel(campos.contato.value); });
  Object.keys(campos).forEach(function (n) {
    campos[n].addEventListener('blur', function () { validarCampo(n); });
    campos[n].addEventListener('input', function () { if (campos[n].classList.contains('invalido')) validarCampo(n); });
  });
  campos.nascimento.max = new Date().toISOString().slice(0, 10);   /* seletor não deixa escolher data futura */
  campos.nascimento.min = '1900-01-01';
  /* mostra a idade calculada logo abaixo da data escolhida */
  const idadeEl = $('fIdade');
  campos.nascimento.addEventListener('input', function () {
    const i = validarNascimento(campos.nascimento.value) ? idadeDe(campos.nascimento.value) : '';
    if (idadeEl) idadeEl.textContent = i ? fmtNascIdade(campos.nascimento.value) : '';
  });

  /* ---------- anexos ---------- */
  const inputArq = $('triFiles'), drop = $('triDrop'), listaArq = $('triLista'), msgArq = $('triArqMsg');
  let seqColada = 0;

  function liberarPrevia(f) { const u = previas.get(f); if (u) { URL.revokeObjectURL(u); previas.delete(f); } }

  function renderArquivos() {
    listaArq.innerHTML = arquivos.map(function (f, i) {
      const pdf = extDe(f.name) === 'pdf';
      if (!pdf && !previas.has(f)) previas.set(f, URL.createObjectURL(f));
      return '<li class="tg-file-item">' +
        '<button type="button" class="tg-file-thumb" data-prev="' + i + '" aria-label="Visualizar ' + esc(f.name) + '">' +
          (pdf ? '<span aria-hidden="true">📄</span>' : '<img alt="" src="' + previas.get(f) + '">') + '</button>' +
        '<div class="tg-file-info"><span class="tg-file-nome" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
          '<span class="tg-file-tam">' + (pdf ? 'PDF' : 'Imagem') + ' · ' + fmtTamanho(f.size) + '</span></div>' +
        '<div class="tg-file-acts"><button type="button" class="tg-mini" data-prev="' + i + '">' + ICO.eye + ' Ver</button>' +
        '<button type="button" class="tg-file-x" data-i="' + i + '" aria-label="Remover ' + esc(f.name) + '" title="Remover">×</button></div></li>';
    }).join('');
    listaArq.classList.toggle('hidden', !arquivos.length);
    $('triArqResumo').textContent = arquivos.length
      ? arquivos.length + (arquivos.length === 1 ? ' arquivo' : ' arquivos') + ' · ' + fmtTamanho(arquivos.reduce(function (s, f) { return s + f.size; }, 0))
      : '';
  }

  /* valida e acumula os arquivos escolhidos; os recusados são explicados. Não há limite de quantidade. */
  function adicionarArquivos(files) {
    const recusas = [];
    Array.prototype.forEach.call(files, function (f) {
      const ext = extDe(f.name);
      if (ANEXO.exts.indexOf(ext) < 0) return recusas.push('"' + f.name + '": formato não permitido (use PDF, JPG, JPEG ou PNG).');
      if (f.type && f.type !== ANEXO.tipos[ext] && !(ext === 'jpg' && f.type === 'image/jpeg')) return recusas.push('"' + f.name + '": o conteúdo não corresponde à extensão.');
      if (f.size === 0) return recusas.push('"' + f.name + '": arquivo vazio.');
      if (ext === 'pdf' && f.size > ANEXO.maxPdf) return recusas.push('"' + f.name + '": PDF maior que ' + fmtTamanho(ANEXO.maxPdf) + '.');
      if (ext !== 'pdf' && f.size > ANEXO.maxImagemOrigem) return recusas.push('"' + f.name + '": imagem muito grande (máx. ' + fmtTamanho(ANEXO.maxImagemOrigem) + ').');
      if (arquivos.some(function (a) { return a.name === f.name && a.size === f.size && a.lastModified === f.lastModified; })) return;   /* já escolhido */
      arquivos.push(f);
    });
    renderArquivos();
    if (recusas.length) mostrar(msgArq, 'warn', recusas.join(' ')); else esconder(msgArq);
  }

  /* ---------- colar imagem da área de transferência (Ctrl+V / Cmd+V ou botão) ---------- */
  function nomeColada(ext) {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    seqColada++;
    return 'imagem-colada-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '-' + seqColada + '.' + ext;
  }
  /* WebP/GIF/BMP colados viram PNG; PNG e JPEG entram como estão */
  async function imagemColada(blob) {
    if (blob.type === 'image/png') return new File([blob], nomeColada('png'), { type: 'image/png', lastModified: Date.now() });
    if (blob.type === 'image/jpeg') return new File([blob], nomeColada('jpg'), { type: 'image/jpeg', lastModified: Date.now() });
    const bmp = await createImageBitmap(blob), cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    const png = await new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
    return new File([png], nomeColada('png'), { type: 'image/png', lastModified: Date.now() });
  }
  async function adicionarColadas(blobs) {
    const fs = [];
    for (let i = 0; i < blobs.length; i++) {
      try { fs.push(await imagemColada(blobs[i])); } catch (e) { console.error('Imagem colada inválida:', e); }
    }
    if (!fs.length) return mostrar(msgArq, 'warn', 'Não foi possível ler a imagem colada. Salve-a como arquivo e use "Clique para escolher".');
    adicionarArquivos(fs);
    if (window.UI) UI.toast(fs.length === 1 ? 'Imagem colada!' : fs.length + ' imagens coladas!');
  }

  document.addEventListener('paste', function (ev) {
    if ($('aba-nova').classList.contains('hidden') || enviando) return;
    const cd = ev.clipboardData; if (!cd || !cd.items) return;
    const imgs = [];
    Array.prototype.forEach.call(cd.items, function (it) {
      if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) imgs.push(f); }
    });
    if (!imgs.length) return;
    const t = ev.target, emTexto = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && Array.prototype.indexOf.call(cd.types || [], 'text/plain') >= 0;
    if (emTexto) return;                                 /* copiou texto + imagem (ex.: planilha) dentro de um campo: cola o texto */
    ev.preventDefault();
    adicionarColadas(imgs);
  });

  const btnColar = $('triColar');
  if (btnColar) btnColar.addEventListener('click', async function () {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('sem suporte');
      const blobs = [];
      for (const item of await navigator.clipboard.read()) {
        const tipo = item.types.find(function (t) { return /^image\//.test(t); });
        if (tipo) blobs.push(await item.getType(tipo));
      }
      if (!blobs.length) return mostrar(msgArq, 'warn', 'Não há imagem na área de transferência. Copie uma imagem (ou faça um print) e tente de novo.');
      adicionarColadas(blobs);
    } catch (e) {
      mostrar(msgArq, 'warn', 'O navegador não liberou o acesso à área de transferência. Clique em qualquer lugar da página e use Ctrl + V (⌘ + V no Mac).');
    }
  });

  inputArq.addEventListener('change', function () { adicionarArquivos(inputArq.files); inputArq.value = ''; });   /* limpa para poder escolher o mesmo arquivo de novo */
  listaArq.addEventListener('click', function (ev) {
    const x = ev.target.closest('.tg-file-x'), v = ev.target.closest('[data-prev]');
    if (x) { const f = arquivos.splice(Number(x.dataset.i), 1)[0]; liberarPrevia(f); renderArquivos(); esconder(msgArq); }
    else if (v) visualizar(arquivos.map(function (f) { return { nome: f.name, tipo: f.type || ANEXO.tipos[extDe(f.name)], tamanho: f.size, obter: function () { return Promise.resolve(f); } }; }), Number(v.dataset.prev));
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
        (r.anexosIncompletos ? '<p class="au-msg warn show" style="margin-top:14px">A solicitação foi registrada, mas alguns anexos não foram enviados por falha de conexão. Informe o protocolo à equipe e reenvie os arquivos.</p>' : '') +
        '<p class="au-note" style="margin-top:14px">Use este número na aba <b>Consultar Protocolo</b> para ver se a solicitação foi autorizada.</p></div>',
      foot: '<button class="tg-btn" id="tgIr" type="button">🔍 Consultar</button><button class="tg-btn primary" id="tgCopiar" type="button">📋 Copiar Protocolo</button>'
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
        nome: campos.nome.value, cpf: campos.cpf.value, nascimento: campos.nascimento.value, contato: campos.contato.value,
        medico: campos.medico.value, medicoEspecialidade: campos.especialidade.value
      }, arquivos, avisar);
      form.reset(); arquivos.forEach(liberarPrevia); arquivos = []; renderArquivos(); esconder(msgArq);
      if (idadeEl) idadeEl.textContent = '';
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
          '<div><dt>Médico solicitado</dt><dd>' + medicoHTML(r) + '</dd></div>' +
          '<div><dt>Data da solicitação</dt><dd>' + esc(fmtData(r.criadoEm)) + '</dd></div>' +
          (r.atualizadoEm ? '<div><dt>Última atualização</dt><dd>' + esc(fmtData(r.atualizadoEm)) + '</dd></div>' : '') +
        '</dl>' +
        '<footer><button class="tg-btn" id="tgCopiarRes" type="button">📋 Copiar Protocolo</button></footer>' +
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
