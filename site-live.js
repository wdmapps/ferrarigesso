// Ferrari Gesso — site público: carrega conteúdos reais do Firestore quando
// existirem. Sem Firestore configurada, o site mantém o conteúdo atual.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig, SITE_ID } from './firebase-config.js';

const digits = v => String(v ?? '').replace(/\D/g, '');
const waLink = n => 'https://wa.me/' + digits(n);
const orcamentoText = 'Olá%20Ferrari%20Gesso!%20Gostaria%20de%20um%20orçamento.';

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