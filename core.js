/* =====================================================================
   core.js • Central de Marcação
   Parte compartilhada pelas páginas: conexão com o banco (Firebase), login por
   USUÁRIO, perfis (administrador / gestor / triagem / operador), senha temporária e
   avisos em tempo real (com o título da aba piscando).

   Use depois do shell.js:
     <script src="shell.js"></script>
     <script src="core.js"></script>
     Core.init({ allowCreate: false, onChange: function (estado) { ... } });

   estado = { logado: true|false, erro: 'texto' (se houve falha ao entrar), falha: true (sem conexão) }

   Com FIREBASE_CONFIG vazio, tudo roda em MODO DE TESTE LOCAL (só neste navegador).
   ===================================================================== */
(function () {
  'use strict';

   var FIREBASE_CONFIG = {
     apiKey: "AIzaSyDIi1Z4-4xDJ7G6fVcmbmJnd8aX4022gXk",
     authDomain: "teste-infotratamento.firebaseapp.com",
     projectId: "teste-infotratamento",
     appId: "1:662089972473:web:d61716f85168a2ab4f0028"
   };

  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var SENHA_TEMP = 'LIGA@123';            /* senha temporária padrão gerada pela gestão */
  var TEMP_HORAS = 24;                    /* quanto tempo a senha temporária pode ser usada pela primeira vez */
  var USER_RE = /^[a-z0-9._-]{3,30}$/;    /* regra do nome de usuário */
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var TITULO_AVISO = '📢 Aviso da gestão!';
  var PAPEL = { admin: 'Administrador', gestor: 'Gestor', triagem: 'Triagem', operador: 'Operador' };

  var Core = window.Core = {
    SENHA_TEMP: SENHA_TEMP, TEMP_HORAS: TEMP_HORAS, USER_RE: USER_RE, EMAIL_RE: EMAIL_RE, PAPEL: PAPEL,
    B: null, user: null, perfil: null
  };

  var esc = UI.esc;
  var q = function (s, r) { return (r || document).querySelector(s); };
  var norm = function (s) { return String(s || '').trim().toLowerCase(); };
  Core.norm = norm;

  /* ---------- regra da senha: mínimo 8, letras, números e caractere especial ---------- */
  var RULES = [
    { t: 'Mínimo de 8 caracteres',                         ok: function (p) { return p.length >= 8; } },
    { t: 'Contém letras',                                  ok: function (p) { return /\p{L}/u.test(p); } },
    { t: 'Contém números',                                 ok: function (p) { return /\d/.test(p); } },
    { t: 'Contém caractere especial (ex.: ! @ # $ % &)',   ok: function (p) { return /[^\p{L}\d\s]/u.test(p); } }
  ];
  Core.pwValid = function (p) { return RULES.every(function (r) { return r.ok(p); }); };
  Core.rulesHTML = function () { return '<ul class="au-rules">' + RULES.map(function (r) { return '<li>' + esc(r.t) + '</li>'; }).join('') + '</ul>'; };
  Core.bindRules = function (input, list) {
    var upd = function () { Array.prototype.forEach.call(list.children, function (li, i) { li.classList.toggle('ok', RULES[i].ok(input.value)); }); };
    input.addEventListener('input', upd); upd();
  };

  /* ---------- mensagens de erro (texto que a pessoa lê) ---------- */
  var ERROS = {
    'auth/invalid-credential': 'Usuário ou senha incorretos.',
    'auth/wrong-password': 'Usuário ou senha incorretos.',
    'auth/user-not-found': 'Usuário ou senha incorretos.',
    'auth/invalid-email': 'Usuário inválido. Use de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.',
    'auth/email-already-in-use': 'Este usuário já existe. Escolha outro nome de usuário.',
    'auth/weak-password': 'A senha é muito fraca. Siga os requisitos listados abaixo do campo.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    'auth/requires-recent-login': 'Por segurança, saia da conta, entre de novo e repita a operação.',
    'auth/user-disabled': 'Esta conta foi desativada. Fale com o gestor ou administrador.',
    'auth/operation-not-allowed': 'O login por usuário e senha está desligado no Firebase. Ative o provedor "E-mail/senha" em Authentication.',
    'permission-denied': 'Sem permissão no banco de dados. Confira se as regras mais recentes (arquivo firestore.rules) foram publicadas no Firebase.',
    'app/nao-autorizado': 'Não foi possível criar a conta: este usuário não está autorizado ou já existe. Peça ao gestor ou administrador para autorizar o seu usuário.',
    'app/desativada': 'Esta conta está desativada. Fale com o gestor ou administrador.',
    'app/senha-redefinida': 'A sua senha foi redefinida pela gestão. Entre usando a senha temporária que a gestão informou.',
    'app/usuario-invalido': 'Usuário inválido. Use de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado (sem espaços).',
    'app/redefinicao-falhou': 'Não foi possível concluir a redefinição da senha. Tente de novo ou peça à gestão para gerar a senha temporária outra vez.',
    'local/exists': 'Este usuário já existe. Escolha outro nome de usuário.',
    'local/nocrypto': 'O modo de teste precisa de HTTPS ou de localhost para funcionar.'
  };
  Core.erroMsg = function (e) { return ERROS[e && e.code] || ('Não foi possível concluir a operação. ' + ((e && e.message) || '')).trim(); };

  /* ---------- utilitários de tela usados pelas páginas ---------- */
  Core.showMsg = function (el, kind, text) { el.className = 'au-msg show ' + kind; el.textContent = text; };
  Core.eyeBtn = '<button type="button" class="au-eye" aria-label="Mostrar ou ocultar a senha" tabindex="-1">👁</button>';
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.au-eye'); if (!b) return;
    var i = b.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password';
  });

  /* usuário do perfil (perfis antigos ainda não têm o campo: usa o começo do e-mail) */
  Core.usuarioDe = function (p) {
    if (!p) return '';
    return p.usuario || norm(String(p.email || '').split('@')[0]);
  };
  Core.nomeUser = function () { return (Core.perfil && Core.perfil.nome) || Core.usuarioDe(Core.perfil) || ''; };
  Core.isAdmin = function () { return !!Core.perfil && Core.perfil.papel === 'admin'; };
  /* gestor e administrador têm os mesmos acessos de gestão */
  /* acesso à tela de triagem: perfil Triagem (operador + triagem), gestor e administrador */
  Core.temTriagem = function () { return !!Core.perfil && (Core.perfil.papel === 'admin' || Core.perfil.papel === 'gestor' || Core.perfil.papel === 'triagem'); };
  Core.isGestao = function () { return !!Core.perfil && (Core.perfil.papel === 'admin' || Core.perfil.papel === 'gestor'); };

  /* =====================================================================
     BACKEND 1: Firebase (Authentication + Firestore)
     O login é por USUÁRIO. Por dentro, o Firebase Authentication exige um e-mail,
     então usamos um e-mail interno "usuario@<dominio do projeto>" (nunca recebe nada).
     ===================================================================== */
  async function backendFirebase() {
    var mods = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    var app = mods[0], A = mods[1], F = mods[2];
    var fb = app.initializeApp(FIREBASE_CONFIG), auth = A.getAuth(fb), db = F.getFirestore(fb);
    auth.languageCode = 'pt-BR';

    var usr = function () { return auth.currentUser; };
    var D = function () { return F.doc.apply(null, [db].concat([].slice.call(arguments))); };
    var C = function () { return F.collection.apply(null, [db].concat([].slice.call(arguments))); };
    var emailInterno = function (u) { return u + '@' + FIREBASE_CONFIG.authDomain; };
    var local = function (email) { return norm(String(email).split('@')[0].split('+')[0]); };
    var map = function (u) { return u ? { id: u.uid, email: u.email } : null; };
    var rows = function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); };

    var PID = null;          /* id do perfil da pessoa que está logada (normalmente é o uid dela) */
    var pend = null;         /* cadastro em andamento: { usuario, contato } */
    var rebinding = false;   /* true enquanto a senha temporária está sendo trocada */
    var lastCb = null;
    var pref = function () { return D('usuarios', PID || usr().uid); };
    var notas = function () { return C('usuarios', PID || usr().uid, 'notas'); };
    var RUIM = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'];

    /* Entrada com a senha temporária: cria uma nova credencial e a liga ao mesmo perfil */
    async function religar(usuario, L) {
      rebinding = true;
      var novo = null;
      try {
        var email = usuario + '+' + Math.random().toString(36).slice(2, 8) + '@' + FIREBASE_CONFIG.authDomain;
        novo = (await A.createUserWithEmailAndPassword(auth, email, SENHA_TEMP)).user;
        await F.setDoc(D('vinculos', novo.uid), { perfil: L.perfil, usuario: usuario });
        await F.updateDoc(D('usuarios', L.perfil), { authAtual: novo.uid });
        await F.updateDoc(D('logins', usuario), { email: email.toLowerCase(), reset: false });
      } catch (e) {
        console.error('Falha ao entrar com a senha temporária:', e);
        try { if (novo) await A.deleteUser(novo); } catch (x) {}
        try { await A.signOut(auth); } catch (x) {}
        rebinding = false;
        throw { code: 'app/redefinicao-falhou' };
      }
      rebinding = false;
      if (lastCb) lastCb(map(usr()));
    }

    return {
      mode: 'firebase',
      watch: function (cb) {
        lastCb = cb;
        return A.onAuthStateChanged(auth, function (u) { if (rebinding) return; PID = null; cb(map(u)); });
      },
      async signIn(usuario, pw) {
        usuario = norm(usuario);
        /* quem tinha conta antes da mudança ainda pode entrar digitando o e-mail antigo */
        if (usuario.indexOf('@') > -1) return A.signInWithEmailAndPassword(auth, usuario, pw);
        if (!USER_RE.test(usuario)) throw { code: 'auth/invalid-credential' };
        var L = null;
        try { var s = await F.getDoc(D('logins', usuario)); L = s.exists() ? s.data() : null; } catch (e) {}
        /* redefinição ativa + senha temporária: a credencial antiga já está bloqueada, então vai direto para a nova
           (mesmo que a senha antiga da pessoa fosse igual à temporária) */
        var vale = L && L.reset === true && L.expira > Date.now() && pw === SENHA_TEMP;
        if (vale) return religar(usuario, L);
        return A.signInWithEmailAndPassword(auth, (L && L.email) || emailInterno(usuario), pw);
      },
      async signUp(usuario, pw, contato) {
        usuario = norm(usuario);
        if (!USER_RE.test(usuario)) throw { code: 'app/usuario-invalido' };
        pend = { usuario: usuario, contato: String(contato || '').trim().toLowerCase() };
        try { return await A.createUserWithEmailAndPassword(auth, emailInterno(usuario), pw); }
        catch (e) { pend = null; throw e; }
      },
      signOut: function () { return A.signOut(auth); },
      async changePw(cur, nw) {
        await A.reauthenticateWithCredential(usr(), A.EmailAuthProvider.credential(usr().email, cur));
        await A.updatePassword(usr(), nw);
      },
      /* perfil */
      async getProfile() {
        var uid = usr().uid, s = null, passo = 'vinculos/' + uid;
        try {
          /* entrou com a senha temporária: o perfil vem do vínculo (ler antes o perfil do uid novo seria negado pelas regras) */
          var v = await F.getDoc(D('vinculos', uid));
          passo = 'usuarios/' + (v.exists() ? v.data().perfil : uid);
          if (v.exists()) s = await F.getDoc(D('usuarios', v.data().perfil));
          else s = await F.getDoc(D('usuarios', uid));
        } catch (e) { console.error('[diagnóstico] leitura negada em: ' + passo + ' (uid de login: ' + uid + ')'); throw e; }
        if (!s.exists()) { PID = null; return null; }
        PID = s.id;
        return Object.assign({ uid: s.id, authUid: uid }, s.data());
      },
      async createProfile() {
        var u = usr();
        var usuario = (pend && pend.usuario) || local(u.email);
        if (!USER_RE.test(usuario)) throw { code: 'app/usuario-invalido' };
        var base = { usuario: usuario, email: (pend && pend.contato) || '', nome: '', tema: 'light', favoritos: [], usos: {}, ordem: [], ativo: true, criado: Date.now() };
        var login = { email: norm(u.email), perfil: u.uid, reset: false, pedido: false };
        var ref = D('usuarios', u.uid), b = F.writeBatch(db);
        var g = await F.getDoc(D('config', 'geral'));
        var p;
        if (!g.exists()) {                       /* primeira conta do sistema = administrador (criador) */
          p = Object.assign({}, base, { papel: 'admin' });
          b.set(ref, p); b.set(D('logins', usuario), login);
          b.set(D('config', 'geral'), { cadastroAberto: false, criado: Date.now(), criadorUid: u.uid });
        } else {
          p = Object.assign({}, base, { papel: 'operador' });
          b.set(ref, p); b.set(D('logins', usuario), login);
        }
        try { await b.commit(); }
        catch (e) { if (e.code === 'permission-denied' && g.exists()) throw { code: 'app/nao-autorizado' }; throw e; }
        pend = null; PID = u.uid;
        return Object.assign({ uid: u.uid, authUid: u.uid }, p);
      },
      updateProfile: function (patch) { return F.updateDoc(pref(), patch); },
      /* contas criadas antes desta versão ganham o campo "usuario" (começo do e-mail) na primeira entrada */
      async migrarUsuario(p) {
        var u = usr(), usuario = local(u.email);
        if (p.uid !== u.uid || String(u.email).indexOf('+') > -1 || !USER_RE.test(usuario)) return null;
        if ((await F.getDoc(D('logins', usuario))).exists()) return null;
        var b = F.writeBatch(db);
        b.update(pref(), { usuario: usuario });
        b.set(D('logins', usuario), { email: norm(u.email), perfil: u.uid, reset: false, pedido: false });
        await b.commit();
        return usuario;
      },
      async discardIfNew() {
        var u = usr(); if (u && u.metadata.creationTime === u.metadata.lastSignInTime) { try { await A.deleteUser(u); } catch (e) {} }
      },
      async deleteAccount(pw) {
        await A.reauthenticateWithCredential(usr(), A.EmailAuthProvider.credential(usr().email, pw));
        var s = await F.getDocs(notas());
        for (var i = 0; i < s.docs.length; i++) await F.deleteDoc(s.docs[i].ref);
        var usuario = Core.usuarioDe(Core.perfil);
        try { await F.deleteDoc(D('logins', usuario)); } catch (e) {}
        try { await F.deleteDoc(D('vinculos', usr().uid)); } catch (e) {}
        await F.deleteDoc(pref());
        await A.deleteUser(usr());
      },
      /* gestão (gestor / administrador): o gestor nunca recebe os administradores */
      async listUsers(papel) {
        var ref = papel === 'admin' ? C('usuarios') : F.query(C('usuarios'), F.where('papel', 'in', ['operador', 'triagem', 'gestor']));
        return (await F.getDocs(ref)).docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
      },
      setUserAdmin: function (uid, patch) { return F.updateDoc(D('usuarios', uid), patch); },
      /* senha temporária: a senha atual deixa de valer e a pessoa entra com LIGA@123 */
      async gerarSenhaTemp(u) {
        var b = F.writeBatch(db);
        b.update(D('usuarios', u.uid), { authAtual: 'PENDENTE', senhaTemp: true });
        b.update(D('logins', u.usuario), { reset: true, expira: Date.now() + TEMP_HORAS * 3600000, pedido: false });
        await b.commit();
      },
      async listLogins() { var o = {}; (await F.getDocs(C('logins'))).docs.forEach(function (d) { o[d.id] = d.data(); }); return o; },
      dispensarPedido: function (usuario) { return F.updateDoc(D('logins', usuario), { pedido: false }); },
      /* "esqueci minha senha": qualquer pessoa pode registrar o pedido (a gestão vê no painel) */
      async pedirReset(usuario) {
        try { await F.updateDoc(D('logins', norm(usuario)), { pedido: true }); } catch (e) {}
      },
      async getConfig() { var s = await F.getDoc(D('config', 'geral')); return s.exists() ? s.data() : { cadastroAberto: false }; },
      setConfig: function (patch) { return F.updateDoc(D('config', 'geral'), patch); },
      async listAutorizados() { return (await F.getDocs(C('autorizados'))).docs.map(function (d) { return d.id; }); },
      addAutorizado: function (u) { return F.setDoc(D('autorizados', norm(u)), { por: Core.usuarioDe(Core.perfil), criado: Date.now() }); },
      delAutorizado: function (u) { return F.deleteDoc(D('autorizados', norm(u))); },
      /* avisos em tempo real: quem está com o site aberto recebe na hora */
      async sendAviso(texto) { await F.setDoc(D('avisos', 'atual'), { texto: texto, enviadoEm: Date.now(), uid: usr().uid }); },
      async getAviso() { var s = await F.getDoc(D('avisos', 'atual')); return s.exists() ? s.data() : null; },
      watchAviso: function (cb) { return F.onSnapshot(D('avisos', 'atual'), function (s) { cb(s.exists() ? s.data() : null); }, function (e) { console.warn('Avisos indisponíveis:', e); }); },
      /* mensagens compartilhadas */
      async listShared() { return rows(await F.getDocs(C('respostas'))); },
      async saveShared(id, d) {
        var data = { grupo: d.grupo, titulo: d.titulo, texto: d.texto, oculta: !!d.oculta, atualizado: Date.now(), por: Core.usuarioDe(Core.perfil) };
        if (id) await F.setDoc(D('respostas', id), data); else await F.addDoc(C('respostas'), data);
      },
      deleteShared: function (id) { return F.deleteDoc(D('respostas', id)); },
      /* anotações pessoais */
      async list() { return rows(await F.getDocs(notas())); },
      async save(n) {
        var data = { titulo: n.titulo, texto: n.texto, categoria: n.categoria || '', atualizado: Date.now() };
        if (n.id) await F.setDoc(F.doc(notas(), n.id), data); else await F.addDoc(notas(), data);
      },
      del: function (id) { return F.deleteDoc(F.doc(notas(), id)); }
    };
  }

  /* =====================================================================
     BACKEND 2: teste local (localStorage) — só para testar sem o Firebase
     ===================================================================== */
  function backendLocal() {
    var S = UI.store, listeners = [], pend = null;
    var hex = function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };
    async function hash(pw, salt) {
      if (!(window.crypto && crypto.subtle)) throw { code: 'local/nocrypto' };
      var k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, k, 256));
    }
    var users = function () { return S.get('an_users', {}); };
    var DB = function () { return Object.assign({ usuarios: {}, respostas: {}, autorizados: {}, config: null, notas: {}, pedidos: {} }, S.get('an_db', {})); };
    var save = function (d) { S.set('an_db', d); };
    var cur = function () { try { return sessionStorage.getItem('an_sess'); } catch (e) { return null; } };
    var setCur = function (e) { try { e ? sessionStorage.setItem('an_sess', e) : sessionStorage.removeItem('an_sess'); } catch (x) {} };
    var emit = function () { listeners.forEach(function (cb) { cb(cur() ? { id: cur(), email: cur() } : null); }); };
    var rid = function () { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
    var mine = function () { return DB().usuarios[cur()]; };
    var gestao = function () { var p = mine(); return p && p.ativo && (p.papel === 'gestor' || p.papel === 'admin'); };
    var souAdmin = function () { var p = mine(); return p && p.ativo && p.papel === 'admin'; };
    var need = function () { if (!gestao()) throw { code: 'permission-denied' }; };
    async function novaSenha(u, pw) {
      var all = users(), salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      all[u] = { salt: salt, h: await hash(pw, salt) }; S.set('an_users', all);
    }
    return {
      mode: 'local',
      watch: function (cb) { listeners.push(cb); cb(cur() ? { id: cur(), email: cur() } : null); },
      async signUp(u, p, contato) {
        u = norm(u);
        if (!USER_RE.test(u)) throw { code: 'app/usuario-invalido' };
        if (users()[u]) throw { code: 'local/exists' };
        pend = { usuario: u, contato: String(contato || '').trim().toLowerCase() };
        await novaSenha(u, p); setCur(u); emit();
      },
      async signIn(u, p) {
        u = norm(u); var r = users()[u];
        if (!r || (await hash(p, r.salt)) !== r.h) throw { code: 'auth/invalid-credential' };
        setCur(u); emit();
      },
      async signOut() { setCur(null); emit(); },
      async changePw(c, n) {
        var r = users()[cur()];
        if ((await hash(c, r.salt)) !== r.h) throw { code: 'auth/invalid-credential' };
        await novaSenha(cur(), n);
      },
      async getProfile() { var p = mine(); return p ? Object.assign({ uid: cur(), authUid: cur() }, p) : null; },
      async createProfile() {
        var d = DB(), u = cur();
        var base = { usuario: u, email: (pend && pend.contato) || '', nome: '', tema: 'light', favoritos: [], usos: {}, ordem: [], ativo: true, criado: Date.now() };
        if (!d.config) { d.config = { cadastroAberto: false, criadorUid: u }; d.usuarios[u] = Object.assign(base, { papel: 'admin' }); }
        else if (d.config.cadastroAberto || d.autorizados[u]) d.usuarios[u] = Object.assign(base, { papel: 'operador' });
        else throw { code: 'app/nao-autorizado' };
        save(d); pend = null; return Object.assign({ uid: u, authUid: u }, d.usuarios[u]);
      },
      async updateProfile(patch) { var d = DB(); Object.assign(d.usuarios[cur()], patch); save(d); },
      async discardIfNew() { var u = users(); delete u[cur()]; S.set('an_users', u); },
      async deleteAccount(pw) {
        var r = users()[cur()];
        if ((await hash(pw, r.salt)) !== r.h) throw { code: 'auth/invalid-credential' };
        var d = DB(), u = cur(), all = users(); delete d.usuarios[u]; delete d.notas[u]; save(d);
        delete all[u]; S.set('an_users', all); setCur(null); emit();
      },
      async listUsers() { need(); var d = DB(); return Object.keys(d.usuarios).map(function (k) { return Object.assign({ uid: k }, d.usuarios[k]); }).filter(function (u) { return souAdmin() || u.papel !== 'admin'; }); },
      async setUserAdmin(uid, patch) {
        need(); var d = DB(), alvo = d.usuarios[uid];
        if (!alvo || uid === cur() || uid === (d.config || {}).criadorUid) throw { code: 'permission-denied' };
        if (!souAdmin() && (alvo.papel === 'admin' || patch.papel === 'admin')) throw { code: 'permission-denied' };
        Object.assign(alvo, patch); save(d);
      },
      async gerarSenhaTemp(u) {
        need(); var d = DB(), alvo = d.usuarios[u.uid];
        if (!alvo || u.uid === cur() || u.uid === (d.config || {}).criadorUid) throw { code: 'permission-denied' };
        if (!souAdmin() && alvo.papel === 'admin') throw { code: 'permission-denied' };
        await novaSenha(u.uid, SENHA_TEMP);
        alvo.senhaTemp = true; delete d.pedidos[u.uid]; save(d);
      },
      async listLogins() { need(); var o = {}, d = DB(); Object.keys(d.usuarios).forEach(function (k) { o[k] = { pedido: !!d.pedidos[k] }; }); return o; },
      async dispensarPedido(usuario) { need(); var d = DB(); delete d.pedidos[usuario]; save(d); },
      async pedirReset(usuario) { var d = DB(), u = norm(usuario); if (d.usuarios[u]) { d.pedidos[u] = Date.now(); save(d); } },
      async getConfig() { return DB().config || { cadastroAberto: false }; },
      async setConfig(patch) { need(); var d = DB(); d.config = Object.assign(d.config || {}, patch); save(d); },
      async listAutorizados() { need(); return Object.keys(DB().autorizados); },
      async addAutorizado(u) { need(); var d = DB(); d.autorizados[norm(u)] = { por: cur() }; save(d); },
      async delAutorizado(u) { need(); var d = DB(); delete d.autorizados[norm(u)]; save(d); },
      async sendAviso(texto) { need(); var d = DB(); d.aviso = { texto: texto, enviadoEm: Date.now(), uid: cur() }; save(d); },
      async getAviso() { return DB().aviso || null; },
      watchAviso: function (cb) {
        cb(DB().aviso || null); var last = JSON.stringify(DB().aviso || null);
        var h = function (e) { if (e.key !== 'an_db') return; var a = DB().aviso || null, j = JSON.stringify(a); if (j !== last) { last = j; cb(a); } };
        window.addEventListener('storage', h); return function () { window.removeEventListener('storage', h); };
      },
      async listShared() { var r = DB().respostas; return Object.keys(r).map(function (k) { return Object.assign({ id: k }, r[k]); }); },
      async saveShared(id, x) { need(); var d = DB(); d.respostas[id || rid()] = { grupo: x.grupo, titulo: x.titulo, texto: x.texto, oculta: !!x.oculta, atualizado: Date.now(), por: cur() }; save(d); },
      async deleteShared(id) { need(); var d = DB(); delete d.respostas[id]; save(d); },
      async list() { return (DB().notas[cur()] || []).slice(); },
      async save(n) {
        var d = DB(), l = d.notas[cur()] = d.notas[cur()] || [];
        var data = { titulo: n.titulo, texto: n.texto, categoria: n.categoria || '', atualizado: Date.now() };
        if (n.id) { var i = l.findIndex(function (x) { return x.id === n.id; }); if (i > -1) l[i] = Object.assign({ id: n.id }, data); }
        else l.push(Object.assign({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, data));
        save(d);
      },
      async del(id) { var d = DB(); d.notas[cur()] = (d.notas[cur()] || []).filter(function (x) { return x.id !== id; }); save(d); }
    };
  }

  /* =====================================================================
     perfil: salvar com atraso (favoritos, contadores, ordem, nome, tema)
     ===================================================================== */
  var pendP = null, pendT = null;
  Core.salvarPerfil = function (patch) {
    if (!Core.perfil) return;
    Object.assign(Core.perfil, patch); pendP = Object.assign(pendP || {}, patch);
    clearTimeout(pendT); pendT = setTimeout(Core.flushPerfil, 900);
  };
  Core.flushPerfil = async function () {
    if (!pendP || !Core.B || !Core.perfil) return;
    var p = pendP; pendP = null; clearTimeout(pendT);
    try { await Core.B.updateProfile(p); } catch (e) { UI.toast(Core.erroMsg(e), 'err'); }
  };
  window.addEventListener('pagehide', Core.flushPerfil);
  UI.tema.onChange = function (t) { if (Core.perfil) Core.salvarPerfil({ tema: t }); };

  /* =====================================================================
     avisos em tempo real + título da aba piscando
     ===================================================================== */
  var tituloOriginal = document.title, blinkT = null, avisoPendente = false, unAviso = null;

  function piscar(ligar) {
    if (ligar) {
      if (blinkT) return;
      var alt = true; document.title = TITULO_AVISO;
      blinkT = setInterval(function () { alt = !alt; document.title = alt ? TITULO_AVISO : tituloOriginal; }, 1000);
    } else if (blinkT) {
      clearInterval(blinkT); blinkT = null; document.title = tituloOriginal;
    }
  }
  /* pisca só enquanto há um aviso não lido e a pessoa está em outra aba ou janela */
  function atualizarPisca() { piscar(avisoPendente && (document.hidden || !document.hasFocus())); }
  document.addEventListener('visibilitychange', atualizarPisca);
  window.addEventListener('focus', atualizarPisca);
  window.addEventListener('blur', atualizarPisca);
  Core._piscar = atualizarPisca;      /* usado nos testes */

  var avisoVisto = function (id) { try { return localStorage.getItem('an_aviso_visto') === id; } catch (e) { return false; } };
  function mostrarAviso(a, id) {
    var old = q('#avisoBar'); if (old) old.remove();
    var bar = document.createElement('div');
    bar.id = 'avisoBar'; bar.className = 'aviso-bar'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<div class="aviso-ico">📢</div><div class="aviso-txt"><b>Aviso da gestão</b><div>' + esc(a.texto) + '</div></div><button class="btn" type="button">Entendi</button>';
    q('button', bar).onclick = function () {
      try { localStorage.setItem('an_aviso_visto', id); } catch (e) {}
      bar.remove(); avisoPendente = false; atualizarPisca();
    };
    document.body.appendChild(bar);
    avisoPendente = true; atualizarPisca();
  }
  function iniciarAvisos() {
    pararAvisos(); var primeiro = true;
    try {
      unAviso = Core.B.watchAviso(function (a) {
        var era1a = primeiro; primeiro = false;
        if (!a || !a.enviadoEm || !Core.user || a.uid === Core.user.id) return;      /* quem enviou não recebe o próprio aviso */
        var id = a.enviadoEm + '_' + a.uid;
        if (avisoVisto(id)) return;
        if (era1a && Date.now() - a.enviadoEm > 5 * 60 * 1000) return;               /* só recebe quem estava com o site aberto */
        mostrarAviso(a, id);
      });
    } catch (e) { console.warn('Avisos indisponíveis:', e); }
  }
  function pararAvisos() {
    if (typeof unAviso === 'function') { try { unAviso(); } catch (e) {} }
    unAviso = null; var b = q('#avisoBar'); if (b) b.remove();
    avisoPendente = false; atualizarPisca();
  }

  /* =====================================================================
     sessão: quem está logada e qual é o perfil
     ===================================================================== */
  var O = {}, authSeq = 0, erroPendente = null;

  function atualizarTopo() {
    var b = document.getElementById('userBtn'); if (!b) return;
    b.innerHTML = Core.perfil ? '👤 <span>' + esc(Core.nomeUser()) + '</span>' : '⚙️ <span>Painel</span>';
    b.title = Core.perfil ? 'Abrir o Painel de Controle (' + Core.nomeUser() + ')' : 'Painel de Controle';
  }
  function emitir(estado) {
    UI.store.set('an_logado', !!estado.logado);
    atualizarTopo();
    if (typeof O.onChange === 'function') { try { O.onChange(estado); } catch (e) { console.error(e); } }
  }

  async function onAuth(u) {
    var seq = ++authSeq;
    if (!u) {
      Core.user = null; Core.perfil = null; pendP = null; pararAvisos();
      var erro = erroPendente; erroPendente = null;
      return emitir({ logado: false, erro: erro });
    }
    try {
      var p = await Core.B.getProfile();
      if (p && p.authAtual && p.authAtual !== p.authUid) throw { code: 'app/senha-redefinida' };
      if (!p) {
        if (!O.allowCreate) return emitir({ logado: false });        /* páginas públicas nunca criam conta */
        p = await Core.B.createProfile();
      }
      if (seq !== authSeq) return;
      if (!p.ativo) throw { code: 'app/desativada' };
      Core.user = u;
      Core.perfil = Object.assign({ nome: '', tema: 'light', favoritos: [], usos: {}, ordem: [] }, p);
      /* a escolha de tema feita neste aparelho vale; o perfil só define o tema em aparelho novo */
      var loc = null; try { loc = localStorage.getItem('an_tema'); } catch (x) {}
      if (loc && loc !== Core.perfil.tema) Core.salvarPerfil({ tema: loc }); else if (!loc) UI.tema.set(Core.perfil.tema, true);
      if (!Core.perfil.usuario && Core.B.migrarUsuario) {
        try { var nu = await Core.B.migrarUsuario(Core.perfil); if (nu) Core.perfil.usuario = nu; } catch (x) { console.warn('Não foi possível atualizar o usuário da conta:', x); }
      }
      if (seq !== authSeq) return;
      iniciarAvisos();
      emitir({ logado: true });
    } catch (e) {
      if (seq !== authSeq) return;
      console.error('Falha ao entrar:', e);
      if (!O.allowCreate) {                                          /* página pública: segue como visitante, sem sair da conta */
        Core.user = null; Core.perfil = null; return emitir({ logado: false });
      }
      if (e && e.code === 'app/nao-autorizado') await Core.B.discardIfNew();
      erroPendente = Core.erroMsg(e);
      await Core.B.signOut();
    }
  }

  /* opções: allowCreate (só o Painel cria contas), onChange(estado) */
  Core.init = async function (opts) {
    O = opts || {};
    var ready = Object.keys(FIREBASE_CONFIG).every(function (k) { return FIREBASE_CONFIG[k]; });
    try { Core.B = ready ? await backendFirebase() : backendLocal(); }
    catch (e) {
      /* com o banco configurado nunca cai para o modo local: a página segue só com o conteúdo padrão */
      console.error('Não foi possível conectar ao banco de dados:', e);
      Core.B = null; return emitir({ logado: false, falha: true });
    }
    Core.B.watch(onAuth);
  };
})();
