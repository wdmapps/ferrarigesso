// Ferrari Gesso — site público: carrega conteúdos reais do Firestore quando
// existirem. Sem Firestore configurada, o site mantém o conteúdo atual.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig, SITE_ID } from './firebase-config.js';

const digits = v => String(v ?? '').replace(/\D/g, '');
const waLink = n => 'https://wa.me/' + digits(n);
const orcamentoText = 'Olá%20Ferrari%20Gesso!%20Gostaria%20de%20um%20orçamento.';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON_INSTA = `<svg viewBox="0 0 24 24"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 01-1.38-.9 3.7 3.7 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 7.05a4.95 4.95 0 100 9.9 4.95 4.95 0 000-9.9zm5.15-.43a1.15 1.15 0 11-2.3 0 1.15 1.15 0 012.3 0zM12 9a3 3 0 110 6 3 3 0 010-6zM12 0C8.74 0 8.33.01 7.06.07 5.78.13 4.9.33 4.14.63A5.87 5.87 0 001.63 2.6 5.87 5.87 0 00.02 5.44C-.1 6.2-.2 7.08-.27 8.36S-.33 10.26-.33 12s.01 3.33.07 4.64c.06 1.28.16 2.16.46 2.92a5.87 5.87 0 001.61 2.02 5.87 5.87 0 002.84 1.21c.76.12 1.64.22 2.92.28 1.28.06 1.68.06 4.64.06s3.33-.01 4.64-.06c1.28-.06 2.16-.16 2.92-.28a5.87 5.87 0 002.84-1.21 5.87 5.87 0 001.61-2.02c.3-.76.4-1.64.46-2.92.06-1.28.06-1.68.06-4.64s-.01-3.33-.06-4.64c-.06-1.28-.16-2.16-.46-2.92A5.87 5.87 0 0021.38 1.52 5.87 5.87 0 0018.54.31C17.78.01 16.9-.19 15.62-.25 14.34-.32 13.94-.33 12-.33S8.33 0 12 0z"/></svg>`;
const ICON_FACE = `<svg viewBox="0 0 24 24"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"/></svg>`;

function socialLabel(url, kind) {
  try {
    const seg = decodeURIComponent(String(new URL(url).pathname).split('/').filter(Boolean).pop() || '').replace(/^@+/, '');
    if (!seg) return null;
    if (kind === 'instagram') return '@' + seg;
    return seg.split(/[._\-]+/).filter(Boolean).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
  } catch {
    return null;
  }
}

function applySocials(d) {
  const boxes = document.querySelectorAll('.social');
  const networks = [
    { kind: 'instagram', icon: ICON_INSTA, href: d.instagram },
    { kind: 'facebook', icon: ICON_FACE, href: d.facebook }
  ];
  boxes.forEach(box => {
    box.innerHTML = '';
    for (const n of networks) {
      const url = String(n.href || '').trim();
      if (!url) continue;
      const label = socialLabel(url, n.kind);
      if (!label) continue;
      const a = document.createElement('a');
      a.target = '_blank';
      a.rel = 'noopener';
      a.href = url;
      a.innerHTML = n.icon + ' ' + esc(label);
      box.appendChild(a);
    }
  });
}

async function resolveMidiaRefs(db, data) {
  const refs = [];
  for (const kind of ['carrossel', 'servicos', 'galeria']) {
    (data[kind] || []).forEach((it, i) => {
      if (typeof it?.imagem === 'string' && it.imagem.startsWith('midia:')) {
        refs.push({ kind, i, id: it.imagem.slice(6) });
      }
    });
  }
  if (!refs.length) return data;
  const map = {};
  await Promise.all(refs.map(async ({ kind, i, id }) => {
    try {
      const s = await getDoc(doc(db, 'sites', SITE_ID, 'midias', id));
      if (s.exists() && s.data().dataUrl) map[`${kind}-${i}`] = s.data().dataUrl;
    } catch (e) { /* mantém imagem original */ }
  }));
  const out = { ...data };
  for (const { kind, i } of refs) {
    const url = map[`${kind}-${i}`];
    if (url) {
      const arr = [...(out[kind] || [])];
      arr[i] = { ...(arr[i] || {}), imagem: url };
      out[kind] = arr;
    }
  }
  return out;
}

function applyCarrossel(itens) {
  const slides = document.querySelectorAll('.hero .slide');
  slides.forEach((slide, i) => {
    const img = itens?.[i]?.imagem;
    if (img) slide.style.backgroundImage = `url('${img}')`;
  });
}

function applyServicos(itens) {
  const cards = document.querySelectorAll('.services .card');
  cards.forEach((card, i) => {
    const item = itens?.[i];
    if (!item) return;
    const img = card.querySelector('img'), h3 = card.querySelector('h3'), p = card.querySelector('p');
    if (img && item.imagem) img.src = item.imagem;
    if (h3 && item.titulo) h3.textContent = item.titulo;
    if (p && item.descricao) p.textContent = item.descricao;
  });
}

function applyGaleria(itens) {
  const imgs = document.querySelectorAll('#galeria .gallery img');
  imgs.forEach((img, i) => {
    const url = itens?.[i]?.imagem;
    if (url) img.src = url;
  });
}

function applyDados(d) {
  const info = document.querySelectorAll('.info .wrap span');
  if (info[0] && d.cidade) info[0].textContent = `Ferrari Gesso • ${d.cidade}`;
  if (info[1] && d.telefoneExibido) info[1].textContent = `WhatsApp: ${d.telefoneExibido}`;

  const tag = document.querySelector('.hero .tag');
  if (tag && d.tag) tag.textContent = d.tag;

  const h1 = document.querySelector('.hero h1');
  if (h1 && d.heroTitulo) h1.textContent = d.heroTitulo;

  const heroP = document.querySelector('.heroText p');
  if (heroP && d.heroDescricao) heroP.textContent = d.heroDescricao;

  const heroBtn = document.querySelector('.heroText .btn');
  if (heroBtn) {
    heroBtn.href = `${waLink(d.whatsapp)}?text=${orcamentoText}`;
    if (d.botaoOrcamento) heroBtn.textContent = d.botaoOrcamento;
  }

  const aboutH2 = document.querySelector('.about h2');
  if (aboutH2 && d.sobreTitulo) aboutH2.textContent = d.sobreTitulo;

  const aboutP = document.querySelectorAll('.about p');
  const paragrafos = String(d.sobreTexto ?? '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  aboutP.forEach((p, i) => {
    if (paragrafos[i]) p.textContent = paragrafos[i];
  });

  const aboutBtn = document.querySelector('.about .btn');
  if (aboutBtn) aboutBtn.href = waLink(d.whatsapp);

  const bannerBtn = document.querySelector('.banner .btn');
  if (bannerBtn) bannerBtn.href = waLink(d.whatsapp);

  const contactH2 = document.querySelector('.contact h2');
  if (contactH2 && d.contatoTitulo) contactH2.textContent = d.contatoTitulo;

  const contactP = document.querySelector('.contact p');
  if (contactP && d.contatoDescricao) contactP.textContent = d.contatoDescricao;

  const contactBtn = document.querySelector('.contactBox .btn');
  if (contactBtn) {
    contactBtn.href = waLink(d.whatsapp);
    if (d.telefoneExibido) contactBtn.textContent = `WHATSAPP • ${d.telefoneExibido}`;
  }

  const footDiv = document.querySelector('.foot > div');
  if (footDiv && d.footerTexto) {
    const strong = footDiv.querySelector('strong');
    footDiv.innerHTML = '';
    footDiv.append(strong, document.createElement('br'), document.createTextNode(d.footerTexto));
  }

  const float = document.querySelector('.float');
  if (float) float.href = waLink(d.whatsapp);

  applySocials(d);
}

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const docRef = doc(db, 'sites', SITE_ID);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = await resolveMidiaRefs(db, snap.data() || {});
    applyCarrossel(data.carrossel);
    applyServicos(data.servicos);
    applyGaleria(data.galeria);
    applyDados(data.dados || {});
  }
} catch (e) {
  console.warn('[Ferrari Gesso] Firestore indisponível; exibindo conteúdo padrão.', e?.code || e?.message || e);
}