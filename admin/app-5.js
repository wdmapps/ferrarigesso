function modal(title,body,{wide=false,saveText='Salvar',onSave=null,extra=''}={}){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal ${wide?'wide':''}"><div class="modal-head"><h2>${title}</h2><button class="modal-close" aria-label="Fechar">×</button></div><div class="modal-body">${body}</div><div class="modal-foot">${extra}<button class="btn" id="modalCancel">Cancelar</button>${onSave?`<button class="btn-primary" id="modalSave">${saveText}</button>`:''}</div></div></div>`;
  $('.modal-close').onclick=closeModal;$('#modalCancel').onclick=closeModal;$('.modal-bg').addEventListener('click',e=>{if(e.target.classList.contains('modal-bg'))closeModal();}); if(onSave)$('#modalSave').onclick=async()=>{const b=$('#modalSave');b.disabled=true;const old=b.textContent;b.textContent='Salvando…';try{const ok=await onSave();if(ok!==false)closeModal();}finally{if(document.body.contains(b)){b.disabled=false;b.textContent=old;}}};
}
function closeModal(){$('#modalRoot').innerHTML='';}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;const b=$('#btnInstall');if(b)b.hidden=false;});
$('#btnInstall').addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#btnInstall').hidden=true;});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
$('#btnExit').addEventListener('click',()=>signOut(auth));

onAuthStateChanged(auth,async user=>{
  currentUser=user; $('#btnExit').hidden=!user; $('#who').textContent=user?.email||'';
  if(!user){loginView();return;}
  if(!await isAdmin(user)){ $('#app').innerHTML='<div class="login-wrap"><div class="login-card"><div class="denied">Esta conta não possui acesso ao painel Ferrari Gesso.</div><button id="deniedExit" class="btn-red" style="width:100%">Sair</button></div></div>';$('#deniedExit').onclick=()=>signOut(auth);return; }
  await loadAll(); shell();
});
