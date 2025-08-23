/* ========= Config ========= */
const API_URL   = 'https://script.google.com/macros/s/AKfycbybCp1e9UmUz6jYV0H_iQF0Trg_F-3kM6xp55hd8Z3MxwPIReW41rRwo0-Giks3EKXH/exec';
const ADMIN_KEY = 'AbuelaPerla2025_key!@';   // Debe coincidir con Code.gs
// 'onePage' (2 copias en una página), 'twoPages' (salto de página), 'twoJobs' (dos trabajos)
const PRINT_MODE = 'twoPages';

/* ========= UI refs ========= */
const statusEl     = document.getElementById('status');
const listPendEl   = document.getElementById('listPending');
const listPrintEl  = document.getElementById('listPrinted');
const lastUpdateEl = document.getElementById('lastUpdate');
const btnRefresh   = document.getElementById('btnRefresh');

/* ========= Estado ========= */
let PENDING = [];
let PRINTED = [];
let polling = false;

/* ========= Utils ========= */
const money  = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
const q      = (o,k,d='') => (o && o[k] != null ? o[k] : d);
const status = msg => { if (statusEl) statusEl.textContent = msg; };

/* ========= API ========= */
async function apiGet(action, params={}) {
  const usp = new URLSearchParams({ action, key: ADMIN_KEY, ...params });
  const res = await fetch(`${API_URL}?${usp.toString()}`, { cache:'no-store' });
  return res.json();
}
async function apiPost(payload){
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}
const markPrinted = (order_id)=> apiPost({ action:'markprinted', key:ADMIN_KEY, order_id });

/* ========= Render ========= */
function orderCardHTML(o, kind){ // kind: 'pending' | 'printed'
  const items = (o.items||[]).map(it=>{
    const name    = q(it,'title') || q(it,'name') || 'Item';
    const variant = q(it,'variant','');
    const qty     = Number(q(it,'qty',1));
    const unit    = Number(q(it,'unit', q(it,'price',0)));
    const total   = Number(q(it,'total', qty*unit));
    const label   = variant ? `${name} (${variant})` : name;
    return `<div class="row"><span>${qty}× ${label}</span><b>${money(total)}</b></div>`;
  }).join('');

  const dest = (o.delivery==='envio')
    ? `Envío: ${o.town||'-'} · ${o.address||'-'}`
    : `Retiro: ${o.customer||'-'}`;

  const btns = (kind==='pending')
    ? `<div class="actions">
         <button class="btn primary" data-act="print-final" data-id="${o.order_id}">Imprimir x2 y finalizar</button>
         <button class="btn ghost"   data-act="finalize"     data-id="${o.order_id}">Finalizar SIN imprimir</button>
       </div>`
    : `<div class="actions">
         <button class="btn" data-act="reprint" data-id="${o.order_id}">Reimprimir x2</button>
       </div>`;

  return `<article class="card" id="card-${o.order_id}">
    <header class="hdr">
      <div><b>${o.order_id}</b><br><small>${o.created_at||''}</small></div>
      <div class="tot"><span>Total</span><b>${money(o.total)}</b></div>
    </header>
    <div class="meta"><small>Pago: ${o.pay||'-'}</small> · <small>${dest}</small></div>
    <div class="items">${items || '<small>(sin ítems)</small>'}</div>
    <div class="sum">
      <div class="row"><span>Subtotal</span><b>${money(o.sum)}</b></div>
      <div class="row"><span>Envío</span><b>${money(o.ship)}</b></div>
      <div class="row grand"><span>TOTAL</span><b>${money(o.total)}</b></div>
    </div>
    ${o.notes ? `<div class="notes"><small><b>Obs:</b> ${o.notes}</small></div>` : ''}
    ${btns}
  </article>`;
}
function render(){
  listPendEl.innerHTML  = PENDING.map(o => orderCardHTML(o,'pending')).join('') || '<p class="empty">Sin pendientes</p>';
  listPrintEl.innerHTML = PRINTED.map(o => orderCardHTML(o,'printed')).join('') || '<p class="empty">Aún no hay impresos</p>';
  if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString();
}

/* ========= Tickets / Impresión ========= */
function ticketBlockHTML(o, tag){
  const head = [
    '*** ABUELA PERLA ***',
    `Pedido: ${o.order_id}`,
    `Fecha:  ${o.created_at || ''}`,
    `Pago:   ${o.pay || '-'}`,
    (o.delivery==='envio' ? `Envío:  ${o.town||'-'} · ${o.address||'-'}` : `Retiro: ${o.customer||'-'}`),
    ''
  ].join('\n');

  const lines = (o.items||[]).map(it=>{
    const name    = q(it,'title') || q(it,'name') || 'Item';
    const variant = q(it,'variant','');
    const qty     = Number(q(it,'qty',1));
    const unit    = Number(q(it,'unit', q(it,'price',0)));
    const total   = Number(q(it,'total', qty*unit));
    const label   = variant ? `${name} (${variant})` : name;
    return `${qty}× ${label}    ${money(total)}`;
  }).join('\n');

  const foot = [
    '',
    `Subtotal         ${money(o.sum)}`,
    `Envío            ${money(o.ship)}`,
    `TOTAL            ${money(o.total)}`,
    '',
    (o.notes ? `Obs: ${o.notes}\n` : ''),
    `— ${tag} —`
  ].join('\n');

  return `<div class="ticket"><pre>${head}${lines}${foot}</pre></div>`;
}

function buildPrintHTML(order){
  if (PRINT_MODE === 'onePage') {
    return ticketBlockHTML(order,'CONTROL') +
           '<hr style="border:0;border-top:1px dashed #999;margin:6px 0" />' +
           ticketBlockHTML(order,'PEDIDO');
  }
  if (PRINT_MODE === 'twoPages') {
    return ticketBlockHTML(order,'CONTROL') +
           '<div class="cut"></div>' +
           ticketBlockHTML(order,'PEDIDO');
  }
  // twoJobs => devolver sólo una copia
  return ticketBlockHTML(order,'PEDIDO');
}

function printTwo(order, finalizeAfter=true){
  return new Promise((resolve) => {
    const html = buildPrintHTML(order);

    const frame = document.createElement('iframe');
    frame.style.position='fixed'; frame.style.right='0'; frame.style.bottom='0';
    frame.style.width='0'; frame.style.height='0'; frame.style.border='0';
    document.body.appendChild(frame);

    const baseCSS = `
      <style>
      :root { --paper: 72mm; }
      body { margin:0; background:#fff; }
      .ticket { width: var(--paper); padding: 4mm 3mm; }
      pre { font: 12px/1.15 "Courier New", monospace; white-space: pre-wrap; }
      .cut { break-after: page; }
      @page { size: 80mm auto; margin: 0 }
      @media print { .cut{ break-after: page; } }
      </style>
    `;

    frame.contentDocument.open();
    frame.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title>${baseCSS}</head><body>${html}</body></html>`);
    frame.contentDocument.close();

    const finish = async () => {
      if (finalizeAfter) { try { await markPrinted(order.order_id); } catch(e){} }
      frame.remove();
      resolve();
    };

    if (PRINT_MODE === 'twoJobs') {
      const w = frame.contentWindow;
      const after1 = () => {
        w.removeEventListener('afterprint', after1);
        w.addEventListener('afterprint', finish, { once:true });
        w.print(); // segunda copia
      };
      w.addEventListener('afterprint', after1, { once:true });
      w.print();
    } else {
      frame.contentWindow.addEventListener('afterprint', finish, { once:true });
      frame.contentWindow.print();
    }
  });
}

/* ========= Eventos ========= */
listPendEl.addEventListener('click', async (ev)=>{
  const b = ev.target.closest('button[data-act]');
  if(!b) return;
  const id  = b.dataset.id;
  const act = b.dataset.act;
  const o   = PENDING.find(x=>x.order_id===id);
  if(!o) return;

  if (act === 'print-final') {
    status(`Imprimiendo ${id}…`);
    await printTwo(o, true);
    PENDING = PENDING.filter(x=>x.order_id!==id);
    PRINTED.unshift(o);
    render();
    status(`Pedido ${id} impreso ✔`);
  }
  if (act === 'finalize') {
    status(`Finalizando ${id}…`);
    await markPrinted(id);
    PENDING = PENDING.filter(x=>x.order_id!==id);
    PRINTED.unshift(o);
    render();
    status(`Pedido ${id} finalizado ✔`);
  }
});

listPrintEl.addEventListener('click', async (ev)=>{
  const b = ev.target.closest('button[data-act="reprint"]');
  if(!b) return;
  const id = b.dataset.id;
  const o  = PRINTED.find(x=>x.order_id===id);
  if(!o) return;
  status(`Reimprimiendo ${id}…`);
  await printTwo(o, false); // no vuelve a marcar
  status(`Reimpreso ${id} ✔`);
});

/* ========= Polling ========= */
async function refresh(){
  if(polling) return;
  polling = true;
  try{
    const [pend, impr] = await Promise.all([
      apiGet('listpending', { limit: 100 }),
      apiGet('listprinted', { limit: 50 })
    ]);
    if (pend.ok)  PENDING = pend.items || [];
    if (impr.ok) PRINTED = impr.items || [];
    render();
    status('Listo. Actualizado.');
  }catch(e){
    status('Error de conexión. Reintentando…');
  }finally{
    polling = false;
  }
}

btnRefresh?.addEventListener('click', refresh);

(async function init(){
  status('Conectando…');
  try{ await apiGet('ping'); }catch(e){}
  await refresh();
  setInterval(refresh, 5000);
})();
