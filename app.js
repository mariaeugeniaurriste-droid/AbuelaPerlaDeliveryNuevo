/* =========================
   Abuela Perla · app.js (premium UI)
   Front de tienda + carrito + guarda comanda en hoja
   ========================= */

/* ===== Config ===== */
const API_URL = 'https://script.google.com/macros/s/AKfycbybCp1e9UmUz6jYV0H_iQF0Trg_F-3kM6xp55hd8Z3MxwPIReW41rRwo0-Giks3EKXH/exec';

const WHATSAPP_NUMBER = "5493435004592"; // 54 + 9 + área sin 0 + número sin 15
const SHIPPING_RATES = { diamante: 500, strobel: 800 };

const money = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

/* ===== Estado ===== */
let PRODUCTS = [];
let CART = [];

/* ===== DOM refs ===== */
const catalog = document.getElementById("catalog");
const pillbar = document.getElementById("pillbar");
const cartList = document.getElementById("cartList");
const sumProductsEl = document.getElementById("sumProducts");
const shipCostEl = document.getElementById("shipCost");
const grandTotalEl = document.getElementById("grandTotal");

const deliveryFields = document.getElementById("deliveryFields");
const pickupFields = document.getElementById("pickupFields");
const selTown = document.getElementById("selTown");

const inpName = document.getElementById("inpName");
const inpAddr = document.getElementById("inpAddr");
const addrNotes = document.getElementById("addrNotes");
const inpNamePickup = document.getElementById("inpNamePickup");
const orderNotes = document.getElementById("orderNotes");

const btnSend = document.getElementById("btnSend");
const btnClear = document.getElementById("btnClear");
const transferBox = document.getElementById("transferBox");
const alertBox = document.getElementById("alertBox");
const titleEl = document.getElementById("mainTitle");

/* ===== Helpers ===== */
const EMOJI_BY_CAT = {
  "Hamburguesas":"🍔","Patynesas y Milanesas":"🍔","Lomitos":"🥪","Empanadas":"🥟",
  "Pizzas":"🍕","Sandwiches de Miga":"🥪","Panchos":"🌭","Papas Fritas":"🍟",
  "Sandwiches de Milanesa":"🥪"
};
function updateTitle(cat){ const e = EMOJI_BY_CAT[cat] || "🍴"; if (titleEl) titleEl.innerHTML = `${e} ¿Qué vas a pedir hoy?`; }

function getQty(name, variant){ const it=CART.find(x=>x.name===name&&x.variant===variant); return it?it.qty:0; }
function addToCart(it){ const ex=CART.find(x=>x.name===it.name&&x.variant===it.variant); if(ex) ex.qty+=it.qty; else CART.push(it); paintCart(); }
function removeOne(name, variant){ const i=CART.findIndex(x=>x.name===name&&x.variant===variant); if(i>-1){ CART[i].qty--; if(CART[i].qty<=0) CART.splice(i,1);} paintCart(); }

function totals(){
  const sum = CART.reduce((a,b)=>a+b.price*b.qty,0);
  const envioSel = (document.querySelector('input[name="delivery"]:checked')?.value || 'retiro')==='envio';
  const ship = envioSel && CART.length ? (SHIPPING_RATES[selTown.value]||0) : 0;
  return { sum, ship, grand: sum + ship };
}
function updateTotals(){
  const t = totals();
  sumProductsEl.textContent = money(t.sum);
  shipCostEl.textContent = money(t.ship);
  grandTotalEl.textContent = money(t.grand);
}

/* ===== Render ===== */
let CATS = []; let activeCat = null;

function paintPills(){
  pillbar.innerHTML = '';
  CATS.forEach(cat=>{
    const b=document.createElement('button');
    b.textContent = cat;
    if(cat===activeCat) b.classList.add('active');
    b.onclick = ()=>{ activeCat=cat; paintPills(); paintCatalog(); updateTitle(cat); };
    pillbar.appendChild(b);
  });
}

function cardProduct(p){
  const c=document.createElement('div'); c.className='ap-card';
  c.innerHTML = `<h3>${p.name}</h3>`;

  let variantSel=null, basePrice=p.price, baseVariant="";
  const hasVariants=Array.isArray(p.variants)&&p.variants.length>0;

  if(hasVariants){
    variantSel=document.createElement('select');
    p.variants.forEach(v=>{
      const o=document.createElement('option');
      o.value=`${v.k}|${v.price}`;
      o.textContent=`${v.k} · ${money(v.price)}`;
      variantSel.appendChild(o);
    });
    c.appendChild(variantSel);
    [baseVariant,basePrice]=variantSel.value.split("|"); basePrice=+basePrice;

    const hint=document.createElement('div'); hint.className='ap-help';
    hint.textContent='Elegí la variante y sumá con (+).';
    c.appendChild(hint);

    variantSel.onchange=()=>{ const v=variantSel.value.split("|")[0]; num.textContent=getQty(p.name,v); };
  }else{
    const pr=document.createElement('div'); pr.className='ap-price';
    pr.textContent=money(basePrice||0); c.appendChild(pr);
  }

  const qtyWrap=document.createElement('div'); qtyWrap.className='ap-qty';
  const btnMinus=document.createElement('button'); btnMinus.className='ap-btn ap-ghost'; btnMinus.textContent='−';
  const num=document.createElement('span'); num.className='ap-num'; num.textContent=getQty(p.name,baseVariant);
  const btnPlus=document.createElement('button'); btnPlus.className='ap-btn ap-ghost'; btnPlus.textContent='+';
  qtyWrap.append(btnMinus,num,btnPlus); c.appendChild(qtyWrap);

  btnPlus.onclick=()=>{
    let price=basePrice, variant=baseVariant;
    if(variantSel){ [variant,price]=variantSel.value.split("|"); price=+price; }
    addToCart({ name:p.name, variant, price, qty:1 });
    num.textContent=getQty(p.name,variant);
  };
  btnMinus.onclick=()=>{
    let variant=baseVariant;
    if(variantSel) variant=variantSel.value.split("|")[0];
    removeOne(p.name,variant);
    num.textContent=getQty(p.name,variant);
  };

  return c;
}

function paintCatalog(){
  const list = PRODUCTS.filter(p => p.cat===activeCat);
  catalog.innerHTML = '';
  if(!list.length){
    catalog.innerHTML = '<p class="ap-help">No hay productos en esta categoría.</p>';
    return;
  }
  list.forEach(p => catalog.appendChild(cardProduct(p)));
}

/* ===== Validación / eventos ===== */
document.querySelectorAll('input[name="delivery"]').forEach(r=>r.addEventListener('change',()=>{
  const envio = r.value==='envio' && r.checked;
  deliveryFields.classList.toggle('ap-hide', !envio);
  pickupFields.classList.toggle('ap-hide',  envio);
  clearErrors(); updateTotals();
}));

document.querySelectorAll('input[name="pay"]').forEach(r=>r.addEventListener('change',()=>{
  const pay = (document.querySelector('input[name="pay"]:checked')?.value || 'efectivo');
  transferBox.classList.toggle('ap-hide', pay!=='transferencia');
}));

function clearErrors(){
  alertBox.classList.add('ap-hide'); alertBox.textContent='';
  [inpName, inpAddr, inpNamePickup].forEach(el=>el?.classList.remove('ap-error'));
}
function missingFields(){
  const miss=[]; if(!CART.length) miss.push("Agregar productos");
  const envio = (document.querySelector('input[name="delivery"]:checked')?.value || 'retiro')==='envio';
  if (envio){ if(!inpName.value?.trim()) miss.push("Apellido y nombre"); if(!inpAddr.value?.trim()) miss.push("Domicilio"); }
  else { if(!inpNamePickup.value?.trim()) miss.push("Apellido y nombre"); }
  return miss;
}
function showMissing(){
  const m=missingFields(); clearErrors();
  if(m.length){
    alertBox.innerHTML = "⚠️ <b>Faltan completar datos:</b><br>• "+m.join("<br>• ");
    alertBox.classList.remove('ap-hide'); alertBox.scrollIntoView({behavior:'smooth',block:'center'});
    return true;
  }
  return false;
}
[selTown, inpName, inpAddr, inpNamePickup, addrNotes, orderNotes].forEach(el=>el?.addEventListener('input',clearErrors));

/* ===== Carrito ===== */
btnClear.onclick=()=>{ CART=[]; paintCart(); clearErrors(); };

function paintCart(){
  cartList.innerHTML='';
  if(!CART.length){ cartList.innerHTML="<li><small>Carrito vacío</small></li>"; }
  else {
    CART.forEach((it,i)=>{
      const li=document.createElement('li');
      const title = it.variant ? `${it.name} (${it.variant})` : it.name;
      li.innerHTML = `<div class="ap-line">
        <div class="ap-qty">
          <button class="ap-btn ap-ghost" onclick="(${()=>{CART[i].qty--; if(CART[i].qty<=0){CART.splice(i,1);} paintCart();}})()">−</button>
          <span class="ap-num">${it.qty}</span>
          <button class="ap-btn ap-ghost" onclick="(${()=>{CART[i].qty++; paintCart();}})()">+</button>
        </div>
        <b style="flex:1">${title}</b>
        <span>${money(it.price * it.qty)}</span>
        <button class="ap-btn ap-ghost" onclick="(${()=>{CART.splice(i,1); paintCart();}})()">❌</button>
      </div>`;
      cartList.appendChild(li);
    });
  }
  updateTotals();
  btnSend.disabled = CART.length === 0; // activo solo si hay items
}

/* ===== Pedido → Guardar en API + WhatsApp ===== */
function buildOrder(){
  const envio = (document.querySelector('input[name="delivery"]:checked')?.value || 'retiro') === 'envio';
  const pay   = (document.querySelector('input[name="pay"]:checked')?.value || 'efectivo');
  const { sum, ship, grand } = totals();

  const items = CART.map(it => ({
    name: it.name,
    variant: it.variant || '',
    qty: it.qty,
    unit: it.price,
    total: it.price * it.qty
  }));

  return {
    created_at: new Date().toISOString(), // el backend igual genera/normaliza
    items,
    sum,
    ship,
    total: grand,
    delivery: envio ? 'envio' : 'retiro',
    town: envio ? (selTown.value || '') : '',
    address: envio ? (inpAddr.value?.trim() || '') : '',
    customer: envio ? (inpName.value?.trim() || '') : (inpNamePickup.value?.trim() || ''),
    pay,
    notes: (orderNotes.value || '').trim()
  };
}

async function postOrder(order){
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type':'text/plain;charset=utf-8' }, // evita preflight CORS
    body: JSON.stringify({ action:'order', order })
  });
  return res.json();
}

function buildWhatsAppText(){
  const { sum, ship, grand } = totals();
  const envio = (document.querySelector('input[name="delivery"]:checked')?.value || 'retiro')==='envio';
  const pay = (document.querySelector('input[name="pay"]:checked')?.value || 'efectivo');
  const lines=[];
  lines.push("*Pedido – Abuela Perla*","");
  lines.push("*Productos:*");
  CART.forEach(it=>{
    const t = it.variant ? `${it.name} (${it.variant})` : it.name;
    lines.push(`• ${it.qty} × ${t} — ${money(it.price*it.qty)}`);
  });
  lines.push("");
  lines.push(`*Total productos:* ${money(sum)}`);
  lines.push(`*Envío:* ${envio?money(ship):"— (retiro en local)"}`);
  lines.push(`*TOTAL:* ${money(grand)}`);
  lines.push("");
  lines.push(`*Modalidad:* ${envio ? "Envío a domicilio" : "Retiro en local"}`);
  lines.push(`*Pago:* ${pay==="efectivo" ? "Efectivo" : "Transferencia"}`);

  if(envio){
    lines.push("", "*Datos de entrega:*");
    lines.push(`• Localidad: ${selTown.value==='diamante'?'Diamante':'Strobel'}`);
    lines.push(`• Apellido y nombre: ${inpName.value.trim()}`);
    lines.push(`• Domicilio: ${inpAddr.value.trim()}`);
    if(addrNotes.value.trim()) lines.push(`• Referencias: ${addrNotes.value.trim()}`);
  }else{
    lines.push("", `*A nombre de:* ${(inpNamePickup.value || inpName.value).trim()}`);
  }
  if (orderNotes.value.trim()){
    lines.push("", "*Observaciones:*", orderNotes.value.trim());
  }
  return lines.join("\n");
}

btnSend.onclick = async ()=>{
  if(showMissing()) return;

  btnSend.disabled = true; // evitar doble click
  alertBox.classList.add('ap-hide'); alertBox.textContent='';

  // 1) Guardar comanda en la hoja (para panel de cocina)
  try{
    const order = buildOrder();
    const resp = await postOrder(order);
    if (!resp.ok){
      alertBox.innerHTML = "⚠️ No se pudo registrar el pedido. Probá de nuevo.";
      alertBox.classList.remove("ap-hide");
      btnSend.disabled = false;
      return;
    }
  }catch(e){
    alertBox.innerHTML = "⚠️ Error de conexión al registrar el pedido.";
    alertBox.classList.remove("ap-hide");
    btnSend.disabled = false;
    return;
  }

  // 2) Abrir WhatsApp para el cliente
  const text = buildWhatsAppText();
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, "_blank");

  // 3) (Opcional) podés limpiar el carrito luego de enviar:
  // CART = []; paintCart();
  btnSend.disabled = false;
};

/* ===== Carga inicial desde la API (con loader/errores) ===== */
async function loadProducts(){
  try{
    const url = `${API_URL}?action=list`;
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // limpiar el loader
    catalog.innerHTML = '';

    if(!data.ok) throw new Error('API ok=false');
    const items = Array.isArray(data.items) ? data.items : [];

    if(items.length === 0){
      pillbar.innerHTML = '';
      catalog.innerHTML = '<p class="ap-help">No hay productos disponibles por ahora.</p>';
      return;
    }

    PRODUCTS = items.map(p => ({
      cat: p.cat, name: p.name, price: p.price || 0, variants: p.variants || null
    }));
    CATS = [...new Set(PRODUCTS.map(p=>p.cat))];
    activeCat = CATS[0];

    paintPills(); paintCatalog(); updateTitle(activeCat); updateTotals();
  }catch(err){
    console.error('API error:', err);
    catalog.innerHTML = `<p class="ap-alert">Error cargando catálogo: ${err?.message || err}. Probá abrir <a href="${API_URL}?action=ping" target="_blank" rel="noopener">este ping</a>.</p>`;
  }
}
loadProducts();
/* ==== Promo horarios/contacto (solo botón Cerrar) ==== */
(function(){
  // Dom=0, Lun=1, Mar=2, Mié=3, Jue=4, Vie=5, Sáb=6
  const OPEN_DAYS = new Set([0,1,3,4,5,6]); // abierto: dom, lun, mié, jue, vie, sáb (martes cerrado)
  const OPEN_HOUR = 19;  // 19:00
  const CLOSE_HOUR = 24; // 00:00

  function isOpenNow(d=new Date()){
    const day = d.getDay();
    const h = d.getHours();
    return OPEN_DAYS.has(day) && h >= OPEN_HOUR && h < CLOSE_HOUR;
  }
  function nextOpenText(d=new Date()){
    const day = d.getDay();
    if (OPEN_DAYS.has(day)){
      const h = d.getHours();
      if (h < OPEN_HOUR) return 'Hoy desde las 19:00';
      return 'Hasta las 00:00';
    }
    return 'Reabrimos mañana 19:00';
  }

  function showPromo(){
    const el = document.getElementById('promo');
    if(!el) return;
    const status = document.getElementById('promoStatus');
    const open = isOpenNow();
    status.textContent =
      (open ? 'Abierto ahora' : 'Cerrado ahora') +
      ' · Mié a Lun · 19:00–00:00 · ' + nextOpenText();

    el.classList.add('show');
    document.getElementById('promoClose')?.addEventListener('click', () => {
      el.classList.remove('show');
    });
  }

  // Exponer para llamarlo al cargar
  window.showPromo = showPromo;
})();
