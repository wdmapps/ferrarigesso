// Ferrari Gesso — painel administrativo (Authentication + Firestore + Storage).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig, SITE_ID } from '../firebase-config.js';
import { DEFAULT_DATA } from '../site-data.js';

const ADMIN_EMAILS = ['ferrarigesso@hotmail.com'];
const SECTION_DEFS = [
  { id: 'carrossel',    titulo: 'Carrossel',   desc: 'As 3 imagens do topo do site (fundo animado da capa).', count: 3 },
  { id: 'servicos',     titulo: 'Serviços',    desc: 'Os 6 serviços exibidos na seção de serviços.', count: 6 },
  { id: 'galeria',      titulo: 'Galeria',     desc: 'As 6 fotos da galeria de trabalhos.', count: 6 },
  { id: 'dados',        titulo: 'Dados',       desc: 'Contatos e textos do site. Reflita no site após salvar.', count: 0 }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const digits = v => String(v ?? '').replace(/\D/g, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MIDIA_PREFIX = 'midia:';

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function compressImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      try {
        const MAX = 1200;
        let { width, height } = im;
        const k = Math.min(1, MAX / Math.max(width, height));
        width = Math.max(1, Math.round(width * k));
        height = Math.max(1, Math.round(height * k));
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d').drawImage(im, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      } catch (e) { reject(e); }
    };
    im.onerror = reject;
    im.src = dataUrl;
  });
}

async function publishMidias(st) {
  const jobs = [];
  for (const kind of ['carrossel', 'servicos', 'galeria']) {
    const arr = st[kind] || [];
    for (let i = 0; i < arr.length; i++) {
      const im = arr[i]?.imagem;
      if (im && im.startsWith('data:')) {
        const id = `${kind}-${i}`;
        jobs.push(setDoc(doc(db, 'sites', SITE_ID, 'midias', id), {
          dataUrl: im,
          atualizadoEm: serverTimestamp()
        }).then(() => { arr[i] = { ...arr[i], imagem: `${MIDIA_PREFIX}${id}` }; }));
      }
    }
  }
  await Promise.all(jobs);
}

async function resolveMidiaRef(item) {
  if (!item?.imagem || !item.imagem.startsWith(MIDIA_PREFIX)) return item;
  const id = item.imagem.slice(MIDIA_PREFIX.length);
  try {
    const s = await getDoc(doc(db, 'sites', SITE_ID, 'midias', id));
    if (s.exists() && s.data().dataUrl) return { ...item, imagem: s.data().dataUrl };
  } catch (e) { /* imagem indisponível */ }
  return { ...item, imagem: '' };
}

let state = { dados: JSON.parse(JSON.stringify(DEFAULT_DATA)) };
let currentUser = null;

function toast(msg, type = 'info') {
  const t = el('div', `toast ${type}`, esc(msg));
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 5200);
}
function setBusy(on, label = 'Aguarde…') {
  const b = $('#btnSave');
  if (b) { b.disabled = on; b.textContent = on ? label : 'SALVAR ALTERAÇÕES'; }
}

function loginView(errMsg) {
  const wrap = el('div', 'loginWrap');
  const card = el('div', 'login');
  card.appendChild(el('h1', null, 'Acesso da administração'));
  card.appendChild(el('p', null, 'Entre com a conta de administrador do site Ferrari Gesso.'));
  if (errMsg) card.appendChild(el('div', 'loginErr', esc(errMsg)));
  const fEmail = el('input'); fEmail.type = 'email'; fEmail.required = true; fEmail.placeholder = 'E-mail'; fEmail.autocomplete = 'email';
  fEmail.style.cssText = 'width:100%;padding:12px;background:#101214;border:1px solid #303438;border-radius:7px;color:#eee;font-size:15px;margin-bottom:10px';
  const fPass = el('input'); fPass.type = 'password'; fPass.required = true; fPass.placeholder = 'Senha'; fPass.autocomplete = 'current-password';
  fPass.style.cssText = 'width:100%;padding:12px;background:#101214;border:1px solid #303438;border-radius:7px;color:#eee;font-size:15px';
  const btn = el('button', 'btnGreen', 'Entrar'); btn.type = 'submit';
  const form = el('form'); form.append(fEmail, fPass, btn);
  form.addEventListener('submit', async e => {
    e.preventDefault(); btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      await signInWithEmailAndPassword(auth, fEmail.value.trim(), fPass.value);
    } catch (err) {
      const map = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/user-not-found': 'Conta não encontrada.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/network-request-failed': 'Sem conexão com a internet.',
        'auth/operation-not-allowed': 'Entrada por e-mail/senha não habilitada. Ative em Authentication → Sign-in method → E-mail/Senha.'
      };
      const mg = map[err.code] || err.code;
      const cur = $('.loginWrap');
      if (cur) cur.replaceWith(loginView(mg));
    }
  });
  card.append(form);
  wrap.appendChild(card);
  return wrap;
}

function deniedView(text) {
  const wrap = el('div', 'loginWrap');
  const card = el('div', 'login');
  card.appendChild(el('div', 'denied', `⚠️ ${esc(text)}`));
  const bt = el('button', 'btnGreen', 'Sair');
  bt.addEventListener('click', () => signOut(auth));
  card.appendChild(bt);
  wrap.appendChild(card);
  return wrap;
}

async function isAdmin(user) {
  if (ADMIN_EMAILS.includes(user.email)) return true;
  try {
    const s = await getDoc(doc(db, 'admins', user.uid));
    if (s.exists() && s.data().active === true) return true;
  } catch (e) { /* sem permissão de leitura => não admin */ }
  return false;
}

function imgsBlock(kind, parentIdx, meta) {
  const wrap = el('div', 'photo');
  const img = el('img'); img.id = `img-${kind}-${parentIdx}`; img.alt = '';
  const body = el('div', 'photoBody');
  const b = el('b', null, meta.titulo);
  const lab = el('label', 'btn', 'Escolher imagem');
  const file = el('input'); file.type = 'file'; file.accept = 'image/*';
  file.addEventListener('change', ev => startUpload(kind, parentIdx, ev));
  const pb = el('div', 'progress'); pb.id = `bar-${kind}-${parentIdx}`;
  pb.appendChild(el('i'));
  const pt = el('div', 'progText'); pt.id = `txt-${kind}-${parentIdx}`;
  lab.appendChild(file); body.append(b, lab, pb, pt);
  wrap.append(img, body);
  return wrap;
}

function renderSection(secId) {
  const panel = $('#panel');
  panel.innerHTML = '';
  const def = SECTION_DEFS.find(s => s.id === secId);
  panel.appendChild(el('h1', null, def.titulo));
  panel.appendChild(el('div', 'notice', esc(def.desc)));

  if (secId === 'dados') {
    const f = el('div', 'form');
    const campos = [
      ['whatsapp', 'WhatsApp (com DDI e DDD, ex.: 5511940867283)'],
      ['telefoneExibido', 'Telefone exibido (ex.: (11) 94086-7283)'],
      ['cidade', 'Cidade / região'],
      ['instagram', 'Instagram (link completo, ex.: https://instagram.com/ferrari_gesso)'],
      ['facebook', 'Facebook (link completo, ex.: https://facebook.com/ferrari.gesso)'],
      ['tag', 'Tag (linha sobre o título)'],
      ['heroTitulo', 'Título da capa'],
      ['heroDescricao', 'Descrição da capa'],
      ['botaoOrcamento', 'Texto do botão de orçamento'],
      ['sobreTitulo', 'Título da seção "Sobre"'],
      ['contatoTitulo', 'Título da seção de contato'],
      ['footerTexto', 'Rodapé (texto da 2ª linha)']
    ];
    for (const [key, ph] of campos) {
      const d = el('div', key === 'botaoOrcamento' || key === 'footerTexto' ? 'field full' : 'field');
      const lb = el('label', null, ph);
      const inp = el('input'); inp.value = state.dados[key] ?? ''; inp.dataset.k = key;
      d.append(lb, inp); f.appendChild(d);
    }
    const dSobre = el('div', 'field full');
    dSobre.appendChild(el('label', null, 'Texto da seção "Sobre" (separar parágrafos com linha em branco)'));
    const ta = el('textarea'); ta.value = state.dados.sobreTexto ?? ''; ta.dataset.k = 'sobreTexto';
    dSobre.appendChild(ta); f.appendChild(dSobre);
    const dContato = el('div', 'field full');
    dContato.appendChild(el('label', null, 'Descrição da seção de contato'));
    const tac = el('textarea'); tac.value = state.dados.contatoDescricao ?? ''; tac.dataset.k = 'contatoDescricao';
    dContato.appendChild(tac); f.appendChild(dContato);
    panel.appendChild(f);
    return;
  }

  const photos = el('div', secId === 'servicos' ? 'svcgrid' : 'photos');
  const count = def.count;
  for (let i = 0; i < count; i++) {
    if (secId === 'servicos') {
      const s = el('div', 'svc');
      const img = el('img', 'svcImg'); img.id = `img-servicos-${i}`; img.alt = '';
      const body = el('div', 'svcBody');
      const fN = el('div', 'field');
      fN.appendChild(el('label', null, 'Nome do serviço'));
      const inpN = el('input'); inpN.value = state.servicos[i]?.titulo ?? ''; inpN.dataset.f = `servicos.${i}.titulo`;
      fN.appendChild(inpN);
      const fD = el('div', 'field');
      fD.appendChild(el('label', null, 'Descrição'));
      const inD = el('textarea'); inD.value = state.servicos[i]?.descricao ?? ''; inD.dataset.f = `servicos.${i}.descricao`;
      fD.appendChild(inD);
      const lab = el('label', 'btn', 'Escolher imagem');
      const file = el('input'); file.type = 'file'; file.accept = 'image/*';
      file.addEventListener('change', ev => startUpload('servicos', i, ev));
      const pb = el('div', 'progress'); pb.id = `bar-servicos-${i}`; pb.appendChild(el('i'));
      const pt = el('div', 'progText'); pt.id = `txt-servicos-${i}`;
      lab.appendChild(file);
      body.append(fN, fD, lab, pb, pt);
      s.append(img, body);
      photos.appendChild(s);
    } else {
      photos.appendChild(imgsBlock(secId === 'carrossel' ? 'carrossel' : 'galeria', i, { titulo: `${secId === 'carrossel' ? 'Slide' : 'Foto'} ${i + 1}` }));
    }
  }
  panel.appendChild(photos);
}

function panelView(user) {
  const grid = el('div', 'wrap grid');
  const menu = el('aside', 'menu');
  for (const def of SECTION_DEFS) {
    const b = el('button', null, def.titulo);
    b.dataset.sec = def.id;
    b.addEventListener('click', () => {
      menu.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderSection(def.id);
    });
    menu.appendChild(b);
  }
  menu.appendChild(el('hr'));
  const back = el('a', 'back', '← Voltar ao site');
  back.href = '../';
  const nav = el('div', null);
  if (user.photoURL) { const p = el('img'); p.src = user.photoURL; p.style.cssText = 'width:40px;height:40px;border-radius:50%;display:block;margin:0 auto 8px'; nav.appendChild(p); }
  const nm = el('div', null, `${user.displayName || user.email || 'Admin'}`);
  nm.style.cssText = 'text-align:center;color:#b9bec2;font-size:13px;word-break:break-all';
  nav.appendChild(nm);
  menu.append(back, nav);

  const panel = el('section', 'panel');
  panel.id = 'panel';
  const saveWrap = el('div', 'saveWrap');
  const save = el('button', 'save', 'SALVAR ALTERAÇÕES'); save.id = 'btnSave'; save.type = 'button';
  save.addEventListener('click', onSave);
  const saveInfo = el('div', null, ''); saveInfo.id = 'saveInfo';
  saveWrap.append(save, saveInfo);

  grid.append(menu, panel, saveWrap);
  return grid;
}

function fillImages() {
  const set = (kind, idx, url) => {
    const img = document.getElementById(`img-${kind}-${idx}`);
    if (img && url) img.src = url;
  };
  const st = state;
  st.carrossel?.forEach?.((it, i) => set('carrossel', i, it?.imagem));
  st.servicos?.forEach?.((it, i) => set('servicos', i, it?.imagem));
  st.galeria?.forEach?.((it, i) => set('galeria', i, it?.imagem));
}

function startUpload(kind, idx, ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('O arquivo precisa ser uma imagem.', 'err'); return; }
  const txt = document.getElementById(`txt-${kind}-${idx}`);
  const img = document.getElementById(`img-${kind}-${idx}`);
  txt.textContent = 'Processando imagem…';
  readFile(file)
    .then(compressImage)
    .then(dataUrl => {
      const cur = state[kind] ? [...state[kind]] : [];
      cur[idx] = { ...(cur[idx] || {}), imagem: dataUrl };
      state[kind] = cur;
      if (img) img.src = dataUrl;
      txt.textContent = 'Pronto. Salve para publicar.';
    })
    .catch(() => {
      txt.textContent = '';
      toast('Não foi possível processar a imagem.', 'err');
    })
    .finally(() => { ev.target.value = ''; });
}

async function onSave() {
  const st = state;
  st.servicos = (st.servicos || []).map((it, i) => ({
    titulo: document.querySelector(`[data-f="servicos.${i}.titulo"]`)?.value ?? it?.titulo ?? '',
    descricao: document.querySelector(`[data-f="servicos.${i}.descricao"]`)?.value ?? it?.descricao ?? '',
    imagem: it?.imagem ?? ''
  }));
  st.dados = st.dados || {};
  document.querySelectorAll('[data-k]').forEach(inp => {
    st.dados[inp.dataset.k] = inp.value;
  });
  const wa = digits(st.dados.whatsapp);
  if (wa.length < 11) { toast('WhatsApp inválido: informe com DDI + DDD + número.', 'err'); return; }
  st.dados.whatsapp = wa;
  setBusy(true, 'Salvando…');
  try {
    await publishMidias(st);
    const snapshot = {
      carrossel: st.carrossel,
      servicos: st.servicos,
      galeria: st.galeria,
      dados: st.dados,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: currentUser?.email ?? null
    };
    await setDoc(doc(db, 'sites', SITE_ID), snapshot);
    toast('Alterações publicadas no site. ✓', 'ok');
  } catch (e) {
    const map = { 'permission-denied': 'Permissão negada: a conta não é administradora.' };
    toast(map[e.code] || `Erro ao salvar: ${e.code}`, 'err');
  } finally {
    setBusy(false);
  }
}

async function loadData() {
  try {
    const s = await getDoc(doc(db, 'sites', SITE_ID));
    if (s.exists()) {
      const d = s.data() || {};
      for (const kind of ['carrossel', 'servicos', 'galeria']) {
        const arr = d[kind] && Array.isArray(d[kind]) ? d[kind] : [];
        state[kind] = await Promise.all(arr.map(resolveMidiaRef));
      }
      state.dados = { ...DEFAULT_DATA.dados, ...(d.dados || {}) };
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  } catch (e) {
    toast(`Não foi possível carregar os dados: ${e.code || e.message}`, 'err');
  }
}

async function boot() {
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    $('#btnExit').style.display = user ? '' : 'none';
    $('#who').style.display = user ? '' : 'none';
    if (user) $('#who').textContent = user.email || '';
    if (!user) {
      $('#app').replaceChildren(loginView());
      return;
    }
    const admin = await isAdmin(user);
    const app = $('#app');
    if (!admin) {
      $('#who').style.display = 'none';
      app.replaceChildren(deniedView('Esta conta não é administradora do site Ferrari Gesso.'));
      return;
    }
    await loadData();
    const g = panelView(user);
    app.replaceChildren(g);
    $('#btnExit').addEventListener('click', () => signOut(auth));
    const first = g.querySelector('button[data-sec]');
    if (first) {
      first.classList.add('active');
      renderSection(first.dataset.sec);
    }
    fillImages();
  });
}

// referência explícita para o runtime
boot();