const { initializeApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, getFirestore, doc, getDoc, setDoc, serverTimestamp, firebaseConfig, SITE_ID, DEFAULT_DATA } = window.__FGFB;
const ADMIN_EMAILS = ['ferrarigesso@hotmail.com'];
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const siteRef = doc(db, 'sites', SITE_ID);

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const clone = x => JSON.parse(JSON.stringify(x));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits = s => String(s ?? '').replace(/\D/g,'');
const uid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
const brl = n => Number(n || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const isoToday = () => new Date().toISOString().slice(0,10);
const formatDate = v => {
  if(!v) return '—'; const [y,m,d] = String(v).slice(0,10).split('-'); return y&&m&&d ? `${d}/${m}/${y}` : v;
};
const formatDateTime = (d,h='') => `${formatDate(d)}${h ? ` • ${h}` : ''}`;
const statusLabel = s => ({rascunho:'Rascunho',enviado:'Enviado',aguardando:'Aguardando',aprovado:'Aprovado',recusado:'Recusado',agendado:'Agendado','em-andamento':'Em andamento',concluida:'Concluída',cancelada:'Cancelada',pendente:'Pendente',concluido:'Concluído',cancelado:'Cancelado'}[s] || s || '—');
const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const overlap = (a1,a2,b1,b2) => String(a1||'9999') <= String(b2||b1||'0000') && String(b1||'9999') <= String(a2||a1||'0000');

let currentUser = null;
let currentSection = 'dashboard';
let currentMonth = new Date();
let deferredInstallPrompt = null;
let state = {
  site: clone(DEFAULT_DATA),
  gestao: { clientes:[], funcionarios:[], orcamentos:[], obras:[], agenda:[] }
};

function toast(msg,type='info'){
  const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg; $('#toasts').appendChild(t); setTimeout(()=>t.remove(),4500);
}
function setSync(text, ok=true){ const b=$('#syncBadge'); if(!b)return; b.textContent=`● ${text}`; b.style.color=ok?'#9de1bc':'#f1c681'; }
function persistLocal(){ try{ localStorage.setItem('ferrari-gestao-cache',JSON.stringify(state.gestao)); }catch{} }
function loadLocal(){ try{ const x=JSON.parse(localStorage.getItem('ferrari-gestao-cache')||'null'); if(x) return normalizeGestao(x); }catch{} return null; }
function normalizeGestao(g={}){
  return {
    clientes:Array.isArray(g.clientes)?g.clientes:[], funcionarios:Array.isArray(g.funcionarios)?g.funcionarios:[],
    orcamentos:Array.isArray(g.orcamentos)?g.orcamentos:[], obras:Array.isArray(g.obras)?g.obras:[], agenda:Array.isArray(g.agenda)?g.agenda:[]
  };
}
function mergeSite(saved={}){
  const d=clone(DEFAULT_DATA);
  return {
    carrossel:Array.isArray(saved.carrossel)?saved.carrossel:d.carrossel,
    servicos:Array.isArray(saved.servicos)?saved.servicos:d.servicos,
    galeria:Array.isArray(saved.galeria)?saved.galeria:d.galeria,
    dados:{...d.dados,...(saved.dados||{})}
  };
}
async function isAdmin(user){
  if(ADMIN_EMAILS.includes(user.email)) return true;
  try{ const s=await getDoc(doc(db,'admins',user.uid)); return s.exists() && s.data().active===true; }catch{return false;}
}
async function loadAll(){
  setSync('Sincronizando…',false);
  try{
    const snap=await getDoc(siteRef);
    const data=snap.exists()?snap.data():{};
    state.site=mergeSite(data);
    state.gestao=normalizeGestao(data.gestao || loadLocal() || {});
    await resolveAllMedia();
    persistLocal(); setSync('Online');
  }catch(e){
    const cache=loadLocal(); if(cache) state.gestao=cache; setSync('Modo local',false); toast('Não foi possível sincronizar agora. Exibindo o cache local.','err');
  }
}
async function saveGestao(msg='Alterações salvas'){
  persistLocal(); setSync('Salvando…',false);
  try{ await setDoc(siteRef,{gestao:state.gestao,gestaoAtualizadaEm:serverTimestamp()},{merge:true}); setSync('Online'); toast(msg,'ok'); return true; }
  catch(e){ setSync('Pendente',false); toast('Não foi possível salvar no servidor. Tente novamente.','err'); return false; }
}
async function saveSite(){
  setSync('Salvando site…',false);
  try{
    await publishPendingMedia();
    await setDoc(siteRef,{carrossel:state.site.carrossel,servicos:state.site.servicos,galeria:state.site.galeria,dados:state.site.dados,atualizadoEm:serverTimestamp()},{merge:true});
    setSync('Online'); toast('Site atualizado com sucesso.','ok'); renderSection('site');
  }catch(e){ setSync('Erro ao salvar',false); toast(`Erro ao salvar o site: ${e.code||e.message}`,'err'); }
}

function loginView(err=''){
  $('#app').innerHTML=`<div class="login-wrap"><div class="login-card"><h1>Ferrari Gesso</h1><p>Entre com a conta de administração para acessar clientes, orçamentos, agenda e obras.</p>${err?`<div class="login-error">${esc(err)}</div>`:''}<form id="loginForm"><div class="field"><label>E-mail</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Senha</label><input name="senha" type="password" autocomplete="current-password" required></div><button class="btn-primary" type="submit">Entrar</button></form></div></div>`;
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;b.textContent='Entrando…';try{await signInWithEmailAndPassword(auth,e.target.email.value.trim(),e.target.senha.value);}catch(x){const m={'auth/invalid-credential':'E-mail ou senha incorretos.','auth/network-request-failed':'Sem conexão com a internet.','auth/operation-not-allowed':'Acesso por e-mail/senha ainda não está habilitado no Firebase.'};loginView(m[x.code]||x.code||'Não foi possível entrar.');}});
}
function shell(){
  $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar">
    <div class="nav-group">Operação</div>
    ${nav('dashboard','⌂','Dashboard')}${nav('clientes','👤','Clientes')}${nav('orcamentos','🧾','Orçamentos')}${nav('agenda','▦','Planner')}${nav('obras','🛠','Obras')}${nav('funcionarios','👷','Funcionários')}
    <div class="nav-group">Site</div>${nav('site','⚙','Editar site')}
  </aside><section id="content" class="content"></section></div>`;
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>renderSection(b.dataset.sec)));
  renderSection(currentSection);
}
function nav(id,icon,label){return `<button class="nav-btn ${currentSection===id?'active':''}" data-sec="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;}
function activateNav(id){$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.sec===id));}
function pageHead(title,sub,actions=''){return `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div><div class="page-actions">${actions}</div></div>`;}
function renderSection(sec){
  currentSection=sec; activateNav(sec); const c=$('#content'); if(!c)return;
  ({dashboard:renderDashboard,clientes:renderClientes,orcamentos:renderOrcamentos,agenda:renderAgenda,obras:renderObras,funcionarios:renderFuncionarios,site:renderSite}[sec]||renderDashboard)();
  window.scrollTo({top:0,behavior:'smooth'});
}

function getClient(id){return state.gestao.clientes.find(x=>x.id===id);}
function getStaff(id){return state.gestao.funcionarios.find(x=>x.id===id);}
function getQuote(id){return state.gestao.orcamentos.find(x=>x.id===id);}
function getWork(id){return state.gestao.obras.find(x=>x.id===id);}
function nextQuoteNumber(){
  const y=new Date().getFullYear(); const nums=state.gestao.orcamentos.map(x=>Number(String(x.numero||'').split('/')[0])).filter(Number.isFinite); return `${String((nums.length?Math.max(...nums):0)+1).padStart(3,'0')}/${y}`;
}
function quoteTotal(o){return Math.max(0,(o.itens||[]).reduce((s,i)=>s+(Number(i.quantidade)||0)*(Number(i.valorUnitario)||0),0)-(Number(o.desconto)||0));}
function monthApprovedValue(){
  const key=isoToday().slice(0,7); return state.gestao.orcamentos.filter(o=>o.status==='aprovado' && String(o.aprovadoEm||o.criadoEm||'').slice(0,7)===key).reduce((s,o)=>s+quoteTotal(o),0);
}
function upcomingEvents(limit=7){
  const today=isoToday();
  const agenda=state.gestao.agenda.filter(a=>a.data>=today).map(a=>({...a,_kind:a.tipo||'outro'}));
  const starts=state.gestao.obras.filter(o=>o.status!=='concluida'&&o.status!=='cancelada'&&o.inicio>=today).map(o=>({id:`work_${o.id}`,tipo:'obra',_kind:'obra',data:o.inicio,hora:'',titulo:`Início: ${o.titulo||'Obra'}`,clienteId:o.clienteId,funcionarios:o.funcionarios||[],obraId:o.id}));
  return [...agenda,...starts].sort((a,b)=>`${a.data} ${a.hora||''}`.localeCompare(`${b.data} ${b.hora||''}`)).slice(0,limit);
}
function renderDashboard(){
  const g=state.gestao, today=isoToday();
  const pend=g.orcamentos.filter(o=>['enviado','aguardando'].includes(o.status)).length;
  const works=g.obras.filter(o=>['agendado','em-andamento'].includes(o.status)).length;
  const todayEvents=g.agenda.filter(a=>a.data===today).length;
  const pipe=['rascunho','enviado','aguardando','aprovado','recusado'].map(s=>({s,n:g.orcamentos.filter(o=>o.status===s).length}));
  const events=upcomingEvents(8);
  $('#content').innerHTML=`${pageHead('Visão geral','Tudo que a Ferrari Gesso precisa acompanhar hoje.',`<button class="btn-primary" data-quick="orcamento">+ Novo orçamento</button>`)}
  <div class="cards"><div class="stat gold"><small>Orçamentos pendentes</small><b>${pend}</b><span>Enviados ou aguardando resposta</span></div><div class="stat blue"><small>Obras ativas</small><b>${works}</b><span>Agendadas ou em andamento</span></div><div class="stat green"><small>Agenda de hoje</small><b>${todayEvents}</b><span>Compromissos marcados</span></div><div class="stat purple"><small>Aprovado no mês</small><b class="money">${brl(monthApprovedValue())}</b><span>Valor dos orçamentos aprovados</span></div></div>
  <div class="grid-2"><div>
    <div class="panel"><div class="panel-title"><h2>Pipeline de orçamentos</h2><span>${g.orcamentos.length} no total</span></div><div class="pipeline">${pipe.map(p=>`<div class="pipe ${p.s}"><strong>${p.n}</strong><span>${statusLabel(p.s)}</span></div>`).join('')}</div></div>
    <div class="panel"><div class="panel-title"><h2>Próximos compromissos</h2><button class="icon-btn" data-go="agenda">Abrir planner</button></div>${events.length?`<div class="timeline">${events.map(eventHTML).join('')}</div>`:'<div class="empty">Nada agendado para os próximos dias.</div>'}</div>
  </div><div>
    <div class="panel"><div class="panel-title"><h2>Ações rápidas</h2></div><div class="quick"><button data-quick="cliente">👤 Novo cliente<small>Cadastre contato e endereço</small></button><button data-quick="orcamento">🧾 Novo orçamento<small>Monte itens e valores</small></button><button data-quick="agenda">📅 Agendar visita<small>Orçamento ou compromisso</small></button><button data-quick="obra">🛠 Nova obra<small>Planeje equipe e datas</small></button></div></div>
    <div class="panel"><div class="panel-title"><h2>Equipe</h2><span>${g.funcionarios.filter(f=>f.ativo!==false).length} ativos</span></div>${g.funcionarios.length?g.funcionarios.slice(0,6).map(f=>`<div class="event-row"><div class="avatar">${esc((f.nome||'?').slice(0,2).toUpperCase())}</div><div class="event-main"><b>${esc(f.nome)}</b><small>${esc(f.funcao||'Funcionário')}</small></div><div class="event-side">${f.ativo===false?'Inativo':'Disponível'}</div></div>`).join(''):'<div class="empty">Cadastre os funcionários para montar equipes.</div>'}</div>
  </div></div>`;
  bindQuickActions(); $('[data-go="agenda"]')?.addEventListener('click',()=>renderSection('agenda'));
}
function eventHTML(e){ const c=getClient(e.clienteId); const staff=(e.funcionarios||[]).map(id=>getStaff(id)?.nome).filter(Boolean).join(', '); return `<div class="event-row"><div class="event-date">${formatDate(e.data)}<br>${esc(e.hora||'')}</div><div class="event-main"><b>${esc(e.titulo||statusLabel(e.tipo))}</b><small>${esc(c?.nome||'Sem cliente')}${e.tipo?` • ${statusLabel(e.tipo)}`:''}</small></div><div class="event-side">${esc(staff||'')}</div></div>`; }
function bindQuickActions(){
  $$('[data-quick]').forEach(b=>b.addEventListener('click',()=>({cliente:()=>openClientModal(),orcamento:()=>openQuoteModal(),agenda:()=>openAgendaModal(),obra:()=>openWorkModal()}[b.dataset.quick]?.())));
}

