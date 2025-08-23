const API_URL = 'https://script.google.com/macros/s/AKfycbybCp1e9UmUz6jYV0H_iQF0Trg_F-3kM6xp55hd8Z3MxwPIReW41rRwo0-Giks3EKXH/exec';

const el = (id)=>document.getElementById(id);
const tbody = el('tbody');
const admAlert = el('admAlert');

function showMsg(msg,isErr=false){
  admAlert.textContent=msg;
  admAlert.classList.remove('ap-hide');
  admAlert.style.borderColor=isErr?'#e53935':'#5A2EA6';
}

async function apiGet(action,key){
  const q=key?`&key=${encodeURIComponent(key)}`:'';
  const res=await fetch(`${API_URL}?action=${action}${q}`, { cache:'no-store' });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function apiPost(payload){
  const res=await fetch(API_URL,{
    method:'POST',
    // text/plain evita preflight CORS con Apps Script
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function rowTpl(p){
  const price=p.price!==''&&p.price!==null?Number(p.price):'';
  const variants=p.variants?JSON.stringify(p.variants):'';
  return `<tr>
    <td>${p.id}</td>
    <td>${p.cat}</td>
    <td>${p.name}</td>
    <td style="text-align:right">${price}</td>
    <td><code style="font-size:12px">${variants}</code></td>
    <td style="text-align:center">${p.visible?'✅':'❌'}</td>
    <td style="text-align:center">
      <button class="ap-btn ap-ghost" data-act="edit" data-id="${p.id}">Editar</button>
      <button class="ap-btn ap-ghost" data-act="toggle" data-id="${p.id}" data-vis="${!p.visible}">${p.visible?'Ocultar':'Mostrar'}</button>
    </td>
  </tr>`;
}

function fillForm(p){
  el('f_id').value=p.id||'';
  el('f_cat').value=p.cat||'';
  el('f_name').value=p.name||'';
  el('f_price').value=(p.price??'')===''?'':Number(p.price);
  el('f_variants').value=p.variants?JSON.stringify(p.variants):'';
  el('f_visible').value=String(!!p.visible);
}
function clearForm(){ ['f_id','f_cat','f_name','f_price','f_variants'].forEach(id=>el(id).value=''); el('f_visible').value='true'; }

el('btnLoad').onclick=async()=>{
  admAlert.classList.add('ap-hide');
  const key=el('adminKey').value.trim();
  if(!key) return showMsg('Ingresá la clave de administrador',true);

  try{
    const data=await apiGet('listAll',key);
    if(!data.ok) return showMsg('Clave incorrecta o error de carga',true);
    tbody.innerHTML=data.items.map(rowTpl).join('');
    tbody.querySelectorAll('button').forEach(b=>{
      b.onclick=async()=>{
        const id=b.dataset.id, act=b.dataset.act, key=el('adminKey').value.trim();
        if(act==='edit'){
          const p=data.items.find(x=>x.id===id);
          fillForm(p); window.scrollTo({top:0,behavior:'smooth'});
        }else if(act==='toggle'){
          const vis=b.dataset.vis==='true';
          const resp=await apiPost({action:'toggleVisible',key,id,visible:vis});
          if(resp.ok){ showMsg('Visibilidad actualizada'); el('btnLoad').click(); }
          else showMsg('Error al actualizar visibilidad',true);
        }
      }
    });
  }catch(err){
    console.error(err);
    showMsg('No se pudo conectar con la API. Revisá el deploy (Yo/Cualquiera).',true);
  }
};

el('btnUpsert').onclick=async()=>{
  const key=el('adminKey').value.trim();
  if(!key) return showMsg('Ingresá la clave de administrador',true);

  let variants=el('f_variants').value.trim();
  let parsed=null;
  if(variants){
    try{
      parsed=JSON.parse(variants);
      if(!Array.isArray(parsed)) throw new Error('no array');
    }catch(e){ return showMsg('Variantes JSON inválido',true); }
  }

  const payload={
    action:'upsert',
    key,
    item:{
      id: el('f_id').value.trim() || undefined,
      cat: el('f_cat').value.trim(),
      name: el('f_name').value.trim(),
      price: parsed ? '' : Number(el('f_price').value || 0),
      variants: parsed || undefined,
      visible: el('f_visible').value === 'true'
      // << sin stock >>
    }
  };

  try{
    const resp=await apiPost(payload);
    if(resp.ok){ showMsg('Producto guardado'); clearForm(); el('btnLoad').click(); }
    else showMsg('Error al guardar',true);
  }catch(err){
    console.error(err);
    showMsg('No se pudo guardar (API).',true);
  }
};

el('btnClearForm').onclick=clearForm;
