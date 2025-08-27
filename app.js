/* =========================================================
   Abuela Perla - Catálogo + Carrito + Admin + Panel Cocina
   ========================================================= */

const AP = (() => {
  /* ==========================
     1) CONFIG
     ========================== */
  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbwAq-qrLWHHBBqG05XC6m-6BkBTLo_x37dEAzCD4s6FwWHytJIJLK_XflFbLsRXH2oVTw/exec";
  const EMPLOYEE_WA  = "5493434515370"; // WhatsApp para pedidos
  const TRANSFER     = { alias: "abuela.perla.mp", titular: "Agustín Urriste", compa: "5493434515370" };
  const ENVIO        = { Diamante: 500, Strobel: 800, retiro: 0 }; // fallback local
  const HOURS        = { open:"19:00", close:"23:59", open_days:[0,1,3,4,5,6], closed_dates:[] }; // fallback local (martes cerrado)
  const TOKEN_KEY    = "AP_ADMIN_TOKEN";

  const ALLOW_NOTES = new Set(["Hamburguesas", "Lomitos", "Patynesas y Milanesas"]);

  /* ==========================
     2) HELPERS
     ========================== */
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2,10);
  const fmt = n => "$ " + (Number(n)||0).toLocaleString("es-AR");
  const norm = s => (s||"").toString().trim().toLowerCase();
  const safe = v => (v || "").toString().trim();
  const ASSET = n => `assets/${n}`;
  const isoDate = d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const HHmm = d => d.toTimeString().slice(0,5);
  const stripAccents = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normKey = (s="") => stripAccents(String(s).toLowerCase().trim());
  const todayISO = ()=> isoDate(new Date());

  const CATEGORY_IMG = {
    "Sandwiches de Miga":     ASSET("miga.png"),
    "Hamburguesas":           ASSET("hamburguesas.png"),
    "Patynesas y Milanesas":  ASSET("milanesa.png"),
    "Lomitos":                ASSET("lomito.png"),
    "Pizzas":                 ASSET("pizzasenteras.png"),
    "Empanadas":              ASSET("empanadas.png"),
    "Papas Fritas":           ASSET("papas.png"),
    "Panchos":                ASSET("pancho.png"),
    "Bebidas":                ASSET("bebidas.png"),
    "Postres":                ASSET("postres.png"),
  };

  function getProductImage(p){
    const cat  = (p.categoria||"").trim();
    const name = (p.nombre||"").toLowerCase();
    if (p.img) return /^https?:\/\//i.test(p.img) ? p.img : ASSET(p.img);
    if (cat === "Pizzas") {
      if (/\bmedia\b|1\/2|mitad|medio/i.test(name)) return ASSET("mediapizza.png");
      return ASSET("pizzasenteras.png");
    }
    if (cat === "Empanadas") {
      if (/docena/i.test(name)) return ASSET("empanadas.png");
      if (/unidad|unitaria/i.test(name)) return ASSET("empanada.png");
      return ASSET("empanadas.png");
    }
    return CATEGORY_IMG[cat] || ASSET("fallback.png");
  }

  function normalizeProduct(p){
    const orig = p.categoria || "";
    let cat = orig.trim();
    if (/^pancho/i.test(cat) || /panchos?/i.test(cat)) cat = "Panchos";
    if (/milanes/i.test(cat) && /paty/i.test(cat)) cat = "Patynesas y Milanesas";
    p.categoria = cat;

    if (!p.img && p.imagen)  p.img  = p.imagen;
    if (!p.img && p.imgUrl)  p.img = p.imgUrl;
    if (typeof p.visible === "undefined") p.visible = true;

    if (typeof p.sabores_off === "string" && p.sabores_off.trim()) {
      p._saboresOff = p.sabores_off.split(/[,;/]+/).map(s=>normKey(s)).filter(Boolean);
    } else {
      p._saboresOff = [];
    }
    return p;
  }

  function P(cat, name, price, desc="", hidden=false, half=0){
    return { id: uid(), categoria: cat, nombre: name, precio: price, precio_media: half, descripcion: desc, visible: !hidden };
  }
  function pizza(name, full, half){
    return [
      P("Pizzas", `Pizza ${name}`, full,  `Salsa + ingredientes ${name.toLowerCase()}`),
      P("Pizzas", `Media Pizza ${name}`, half, `Media porción ${name.toLowerCase()}`)
    ];
  }

  /* ==========================
     3) AUTENTICACIÓN (ADMIN)
     ========================== */
  const setToken   = t => localStorage.setItem(TOKEN_KEY, t);
  const getToken   = () => localStorage.getItem(TOKEN_KEY) || "";
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);

  async function login(user, pass){
    try{
      const r = await api("login", { user, pass }, false);
      if (r?.ok && r.token){ setToken(r.token); return true; }
    }catch(_){}

    try{
      const url = GAS_ENDPOINT
        + "?action=login&user=" + encodeURIComponent(user)
        + "&pass=" + encodeURIComponent(pass);
      const res  = await fetch(url, { method:"GET", mode:"cors", credentials:"omit" });
      const json = await res.json().catch(()=>null);
      if (json?.ok && json.token){ setToken(json.token); return true; }
    }catch(_){}

    return false;
  }

  async function ensureAuth(dest = location.pathname.split("/").pop() || "admin.html"){
    if (getToken()) return true;
    renderLoginCard({
      title: dest.includes("panel") ? "Panel de Cocina" : "Administración",
      onSubmit: async (user, pass) => {
        const ok = await login(user, pass);
        if(!ok){ alert("Usuario o contraseña inválidos."); return; }
        location.href = dest;
      }
    });
    return false;
  }

  /* ==========================
     4) API Apps Script
     ========================== */
  const ADMIN_ACTIONS = new Set([
    "updateVisibility", "listOrders", "setOrderStatus",
    "upsertProduct", "deleteProduct", "upsertConfig", "archiveDay",
    "createOrder"
  ]);

  async function api(action, data = {}, requireAuth = false) {
    if (!GAS_ENDPOINT) throw new Error("GAS_ENDPOINT vacío");
    const url = GAS_ENDPOINT + "?action=" + encodeURIComponent(action);
    const isReadOnly = action === "listProducts" || action === "getConfig";

    const body = { ...(data || {}) };
    if (requireAuth || ADMIN_ACTIONS.has(action)) {
      const token = getToken();
      if (!token) throw new Error("unauthorized");
      body.token = token;
    }

    let res;
    if (isReadOnly) {
      res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit" });
    } else {
      res = await fetch(url, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
    }
    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      console.error(`[api] ${action} HTTP ${res.status}`, txt.slice(0,300));
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json().catch(async ()=>{
      const txt = await res.text(); console.error(`[api] ${action} no JSON`, txt.slice(0,300));
      throw new Error("Respuesta no JSON");
    });
    if(json && json.ok === false && /unauthorized|invalid/i.test(json.error||"")) clearToken();
    return json;
  }

  /* ==========================
     5) ESTADO
     ========================== */
  let PRODUCTS = [];
  const CART = JSON.parse(localStorage.getItem("AP_CART")||"[]");
  let SUBMITTING_ORDER = false;

  /* ==========================
     6) SEED LOCAL
     ========================== */
  const SEED_PRODUCTS = [
    P("Sandwiches de Miga","Miga simple",6000,"Pan de miga con jamón y queso"),
    P("Sandwiches de Miga","Miga triple",7600,"Jamón, queso, lechuga y tomate"),
    P("Sandwiches de Miga","Miga triple con huevo",8200,""),
    P("Sandwiches de Miga","Miga triple con huevo y morrón/aceitunas",8550,"+ morrón o aceitunas"),
    P("Sandwiches de Miga","Miga pollo",6350,"Pollo + mayonesa"),
    P("Sandwiches de Miga","Miga pollo triple",8100,"Pollo triple"),
    P("Sandwiches de Miga","Miga pollo triple con huevo",8550,""),
    P("Sandwiches de Miga","Miga pollo triple con huevo y morrón/aceitunas",9050,""),
    P("Sandwiches de Miga","Miga tostado",6300,"Plancha tostada"),
    P("Sandwiches de Miga","Miga triple tostado",7850,"Plancha triple tostada"),
    P("Sandwiches de Miga","Alberts",9400,"Especia de la casa"),
    P("Sandwiches de Miga","Adicional jamón crudo",1200,"Extra, se suma a tu producto"),
    P("Hamburguesas","Hamburguesa común",6300,""),
    P("Hamburguesas","Hamburguesa especial",7200,""),
    P("Hamburguesas","Hamburguesa completa",8100,""),
    P("Hamburguesas","Doble Bacon Smock",8700,"Línea Deluxe"),
    P("Hamburguesas","Doble Burger Classic",8500,"Línea Deluxe"),
    P("Hamburguesas","Cheesy Burger Classic",8000,"Línea Cheesy Burger"),
    P("Hamburguesas","Cheesy Burger Double",8500,"Línea Cheesy Burger"),
    P("Hamburguesas","Criolla XL",8400,""),
    P("Hamburguesas","Guacamole",8400,""),
    P("Patynesas y Milanesas","Patynesa común",7000,""),
    P("Patynesas y Milanesas","Patynesa especial",7700,""),
    P("Patynesas y Milanesas","Patynesa completa",8500,""),
    P("Lomitos","Lomito común",7700,""),
    P("Lomitos","Lomito especial",8400,""),
    P("Lomitos","Lomito completo",9100,""),
    P("Panchos","Superpancho",4500,""),
    ...pizza("Muzarella",10200,5200),
    ...pizza("Especial",10900,5600),
    ...pizza("Fugazza",10400,5300),
    ...pizza("Napolitana",10900,5600),
    ...pizza("Calabresa",11100,5700),
    ...pizza("Palmito",12600,6400),
    ...pizza("Ananá y roquefort",12600,6400),
    ...pizza("Roquefort",12100,6200),
    ...pizza("Jamón, morrón y huevo",12100,6200),
    ...pizza("Cuatro quesos",12600,6400),
    ...pizza("Capresse",12100,6200),
    ...pizza("Rúcula y parmesano",12600,6400),
    ...pizza("Pollo",13500,6900),
    ...pizza("Anchoas",12600,6400),
    ...pizza("Choclo",10900,5600),
    ...pizza("Salchipapa",10900,5600),
    ...pizza("Abuela Perla",13500,6900),
    P("Empanadas","Empanadas por unidad",1400,"Carne salada/dulce, Pollo, JyQ, Choclo, Verdura, Salchiqueso, Cebolla y queso, Pescado."),
    P("Empanadas","Empanadas por docena",16200,"Cualquier variedad. Ej: 4 pollo + 4 carne + 4 verdura = 12"),
    P("Papas Fritas","Papas fritas",5800,""),
    P("Papas Fritas","Papas fritas media porción",3100,""),
    P("Papas Fritas","Guarnición",1500,""),
    P("Papas Fritas","Papas con cheddar",5800,""),
    P("Bebidas","Coca-Cola 1.5L",0,"Definí el precio en la hoja",true),
    P("Postres","Postre del día",0,"Definí el precio en la hoja",true),
  ];

  /* ==========================
     7) EMPANADAS: Sabores
     ========================== */
  const EMPANADA_FLAVORS = [
    "Carne salada","Carne dulce","Pollo","Jamón y queso",
    "Choclo","Verdura","Salchiqueso","Cebolla y queso","Pescado"
  ];
  const FLV_KEYS = Object.fromEntries(EMPANADA_FLAVORS.map(n => [n, normKey(n)]));

  /* ==========================
     8) CARGA DE PRODUCTOS / CONFIG
     ========================== */
  async function loadProducts(){
    try{
      const r = await api("listProducts");
      PRODUCTS = (r?.ok && Array.isArray(r.products) && r.products.length)
        ? r.products.map(normalizeProduct)
        : SEED_PRODUCTS.map(normalizeProduct);
    }catch(e){
      console.error("Fallo listProducts:", e);
      PRODUCTS = SEED_PRODUCTS.map(normalizeProduct);
    }
  }

  async function loadConfig(){
    try{
      const r = await api("getConfig", {} , false);
      if (r?.ok){
        if (r.envio && typeof r.envio === "object"){
          ["Diamante","Strobel","retiro"].forEach(k=>{
            const v = Number(r.envio[k]);
            if (!Number.isNaN(v)) ENVIO[k] = v;
          });
        }
        if (r.transfer && typeof r.transfer === "object"){
          if (typeof r.transfer.alias   === "string") TRANSFER.alias   = r.transfer.alias;
          if (typeof r.transfer.titular === "string") TRANSFER.titular = r.transfer.titular;
          if (typeof r.transfer.compa   === "string") TRANSFER.compa   = r.transfer.compa;
        }
        if (r.hours && typeof r.hours === "object"){
          if (typeof r.hours.open === "string")  HOURS.open = r.hours.open;
          if (typeof r.hours.close === "string") HOURS.close = r.hours.close;
          if (Array.isArray(r.hours.open_days))  HOURS.open_days = r.hours.open_days.map(n=>+n).filter(n=>!Number.isNaN(n));
          if (r.hours.closed_dates) HOURS.closed_dates = r.hours.closed_dates;
        }
      }
    }catch(e){ console.warn("[config] getConfig falló", e); }
    queueOpenBadgesRefresh();
  }

  function applyConfigToUI(){
    const sel = $("#envioSelect");
    if (sel) {
      const v = sel.value;
      sel.innerHTML = `<option value="" selected disabled>Seleccioná la modalidad…</option>
        <option value="Diamante">Diamante (${fmt(ENVIO.Diamante)})</option>
        <option value="Strobel">Strobel (${fmt(ENVIO.Strobel)})</option>
        <option value="retiro">Retiro por el local (${fmt(ENVIO.retiro)})</option>`;
      if (["Diamante","Strobel","retiro"].includes(v)) sel.value = v;
      const checkoutBtn = $("#checkoutBtn");
      if (checkoutBtn) checkoutBtn.disabled = !sel.value;
    }
    $("#apAliasText") && ($("#apAliasText").textContent = TRANSFER.alias || "—");
    $("#apTitular")   && ($("#apTitular").textContent   = TRANSFER.titular || "—");
    $("#apCompa")     && ($("#apCompa").textContent     = "+"+TRANSFER.compa || "—");
  }

  /* ==========================
     9) UI: TABS + LISTA (cliente)
     ========================== */

  function renderTabs(){
    const tabs = $("#categoryTabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    const cats = [...new Set(PRODUCTS.filter(p=>p.visible!==false).map(p=>p.categoria))];

    cats.forEach((c,i)=>{
      const b=document.createElement("button");
      b.textContent=c;
      if(i===0) b.classList.add("active");
      b.onclick=()=>{
        $$("#categoryTabs button").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        renderList(c);
      };
      tabs.appendChild(b);
    });
    if(cats[0]) renderList(cats[0]);
  }

  /* ---------- PIZZAS: helpers y render especial ---------- */
  function basePizzaName(n = "") {
    return String(n).replace(/^Media\s+Pizza\s+/i, "").replace(/^Pizza\s+/i, "").trim();
  }
  function groupPizzas() {
    const map = new Map();
    PRODUCTS
      .filter(p => p.categoria === "Pizzas" && p.visible !== false)
      .forEach(p => {
        const sabor = basePizzaName(p.nombre || "");
        const g = map.get(sabor) || { sabor, desc: p.descripcion || "", full: null, half: null };
        if (/^media\s+pizza/i.test(p.nombre)) g.half = p; else g.full = p;
        if (!g.desc && p.descripcion) g.desc = p.descripcion;
        map.set(sabor, g);
      });
    return [...map.values()].filter(g => g.full || g.half);
  }

  function renderPizzaCards(listEl) {
    const groups = groupPizzas();
    groups.forEach(g => {
      const card = document.createElement("article");
      card.className = "ap-card ap-product";
      card.innerHTML = `
        <div class="ap-product__head">
          <div class="ap-avatar"><img class="ap-thumb" alt="Pizza ${g.sabor}" /></div>
          <div>
            <h3 class="ap-card-title">Pizza ${g.sabor}</h3>
            <p class="ap-card-desc">${g.desc || ""}</p>
          </div>
        </div>

        <div style="margin-top:.4rem">
          <div style="text-align:center;font-size:.9rem;color:#a1a1aa;margin:.2rem 0 .5rem">Seleccioná el tamaño</div>
          <div class="ap-size" style="display:flex;justify-content:center;gap:.5rem;flex-wrap:wrap">
            <button type="button" class="ap-size-btn" data-size="full" ${g.full ? "" : "disabled"}>
              Entera <small style="opacity:.8;margin-left:.35rem">${g.full ? fmt(g.full.precio) : "—"}</small>
            </button>
            <button type="button" class="ap-size-btn" data-size="half" ${g.half ? "" : "disabled"}>
              Media <small style="opacity:.8;margin-left:.35rem">${g.half ? fmt(g.half.precio) : "—"}</small>
            </button>
          </div>

          <div class="ap-pizza-price" data-price style="text-align:center;font-weight:700;margin:.5rem 0 .2rem">—</div>

          <div class="ap-pizza-actions" style="display:flex;align-items:center;justify-content:center;gap:.7rem;margin:.4rem 0 0">
            <div class="ap-qty">
              <button class="ap-qty-btn" data-op="-">−</button>
              <input class="ap-qty-input" value="0" inputmode="numeric" />
              <button class="ap-qty-btn" data-op="+">+</button>
            </div>
            <button class="ap-btn ap-btn--primary ap-add" disabled>Agregar</button>
          </div>
        </div>
      `;

      const img = card.querySelector(".ap-thumb");
      const priceEl = card.querySelector("[data-price]");
      const qty = card.querySelector(".ap-qty-input");
      const [btnMenos, btnMas] = card.querySelectorAll(".ap-qty-btn");
      const addBtn = card.querySelector(".ap-add");
      let selected = g.full ? "full" : "half";

      const prodFor = () => (selected === "half" ? g.half : g.full);

      function paintSizeButtons(){
        card.querySelectorAll(".ap-size-btn").forEach(b=>{
          const on = (b.dataset.size === selected);
          b.style.filter = on ? "saturate(1.05)" : "none";
          b.style.outline = on ? "2px solid rgba(234,179,8,.38)" : "none";
        });
      }

      function syncCta(){
        const prod = prodFor();
        addBtn.disabled = !prod || (+qty.value)<=0;
        btnMenos.disabled = (+qty.value)<=0;
      }

      function setSize(size) {
        selected = size;
        const prod = prodFor();
        priceEl.textContent = prod ? fmt(prod.precio) : "—";
        img.src = size === "half" ? ASSET("mediapizza.png") : ASSET("pizzasenteras.png");
        img.onerror = () => { img.onerror = null; img.src = CATEGORY_IMG["Pizzas"] || ASSET("pizzasenteras.png"); };
        paintSizeButtons();
        syncCta();
      }

      card.querySelectorAll(".ap-size-btn").forEach(b => b.onclick = () => setSize(b.dataset.size));
      btnMenos.onclick = () => { qty.value = Math.max(0, (+qty.value - 1)); syncCta(); };
      btnMas.onclick   = () => { qty.value = (+qty.value + 1);           syncCta(); };

      addBtn.onclick = () => {
        const prod = prodFor();
        const q = +qty.value || 0;
        if (!prod || q <= 0) return;
        addToCart({ id: prod.id, nombre: prod.nombre, precio: prod.precio, qty: q, notas: "" });
        notifyAdded(`${q > 1 ? q + "× " : ""}${prod.nombre}`);
        qty.value = 0;
        syncCta();
      };

      setSize(selected);
      listEl.appendChild(card);
    });
  }

  function renderList(cat){
    const list = document.getElementById("productList");
    if(!list) return;
    list.innerHTML = "";

    if (cat === "Pizzas") {
      renderPizzaCards(list);
      return;
    }

    const tpl = document.getElementById("productCardTpl");
    PRODUCTS
      .filter(p=>p.visible!==false && p.categoria===cat)
      .forEach(p=>{
        const node = tpl.content.firstElementChild.cloneNode(true);

        const avatar = node.querySelector(".ap-avatar");
        if (avatar){
          avatar.innerHTML = "";
          const img = document.createElement("img");
          img.className = "ap-thumb";
          img.alt = p.nombre || "Producto";
          img.src = getProductImage(p);
          img.loading = "lazy";
          img.decoding = "async";
          img.onerror = () => { img.onerror = null; img.src = CATEGORY_IMG[p.categoria] || ASSET("fallback.png"); };
          avatar.appendChild(img);
        }

        node.querySelector(".ap-card-title").textContent = p.nombre;
        node.querySelector(".ap-card-desc").textContent  = p.descripcion || "";
        node.querySelector(".ap-price").textContent      = fmt(p.precio);

        const qtyInput = node.querySelector(".ap-qty-input");
        const [btnMinus, btnPlus] = node.querySelectorAll(".ap-qty-btn");
        const addBtn = node.querySelector(".ap-add");

        const notesInput = node.querySelector(".ap-notas-input");
        const notesWrap  = notesInput ? notesInput.closest("label") : null;
        const allow = ALLOW_NOTES.has(p.categoria);
        if (notesWrap) notesWrap.style.display = allow ? "" : "none";

        qtyInput.value = 0;
        const syncQty = ()=>{ btnMinus.disabled = (+qtyInput.value)<=0; addBtn.disabled = (+qtyInput.value)<=0; };
        syncQty();

        btnMinus.onclick = ()=>{ qtyInput.value = Math.max(0, (+qtyInput.value-1)); syncQty(); };
        btnPlus.onclick  = ()=>{ qtyInput.value = (+qtyInput.value+1);             syncQty(); };

        const isEmp = p.categoria === "Empanadas";
        if (isEmp) {
          const findEmp = (matcher) => PRODUCTS.find(x => x.categoria === "Empanadas" && matcher(x.nombre||""));
          const prodUnit  = findEmp(n => /unidad/i.test(n));
          const prodDozen = findEmp(n => /docena/i.test(n));
          const disabledSet = new Set([
            ...(p._saboresOff||[]),
            ...(prodUnit?._saboresOff||[]),
            ...(prodDozen?._saboresOff||[])
          ]);

          node.querySelector(".ap-qty").style.display = "none";
          addBtn.textContent = "Elegir sabores";
          addBtn.disabled = false;
          addBtn.onclick = ()=> openEmpanadaModal({
            mode: /unidad/i.test(p.nombre) ? "unidad" : (/docena/i.test(p.nombre) ? "docena" : "unidad"),
            priceUnit:  (prodUnit || p).precio,
            priceDozen: (prodDozen || p).precio,
            prodUnit, prodDozen,
            disabledFlavors: Array.from(disabledSet)
          });
        } else {
          addBtn.onclick = ()=>{
            const qty = +qtyInput.value || 0;
            if(qty<=0) return;
            let notas = "";
            if (ALLOW_NOTES.has(p.categoria)) {
              const ni = node.querySelector(".ap-notas-input");
              notas = ni ? ni.value.trim() : "";
            }
            addToCart({ id:p.id, nombre:p.nombre, precio:p.precio, qty, notas });
            notifyAdded(`${qty>1? qty+"× " : ""}${p.nombre}`);
            qtyInput.value = 0; syncQty();
            node.querySelectorAll("button, input").forEach(el=>el.blur());
          };
        }
        list.appendChild(node);
      });
  }

  /* =========================================
     10) EMPANADAS: Modal
     ========================================= */
  function openEmpanadaModal({mode, priceUnit, priceDozen, prodUnit, prodDozen, disabledFlavors = []}){
    const disabledKeys = new Set(disabledFlavors.map(normKey));

    const counts = Object.fromEntries(EMPANADA_FLAVORS.map(f=>[f,0]));
    const totalSel   = ()=> Object.values(counts).reduce((a,b)=>a+b,0);
    const flavorsTxt = ()=> Object.entries(counts).filter(([f,n])=>n>0).map(([f,n])=>`${f} x${n}`).join(", ");

    const wrap = document.createElement("div");
    wrap.className = "ap-modal";
    wrap.innerHTML = `
      <div class="ap-modal__card">
        <div class="ap-row ap-row--between">
          <h3>Empanadas ${mode==="docena"?"por docena":"por unidad"}</h3>
          <button class="ap-icon-btn" data-close>✕</button>
        </div>
        <p class="ap-badge">Elegí cantidades por sabor. Ej: 4 Pollo + 4 Carne + 4 Verdura = 12</p>
        <div class="ap-flavors" id="flvList"></div>
        <div class="ap-row ap-row--between ap-total">
          <div>
            <div>Total seleccionadas: <strong id="totSel">0</strong></div>
            <small id="helper" style="color:#a1a1aa"></small>
          </div>
          <div><strong id="calcPrice">$ 0</strong></div>
        </div>
        <div class="ap-modal__foot">
          <button class="ap-btn ap-btn--ghost" data-clear>Limpiar</button>
          <button class="ap-btn ap-btn--primary" data-add disabled>Agregar al carrito</button>
        </div>
      </div>
    `;

    const list = wrap.querySelector("#flvList");
    EMPANADA_FLAVORS.forEach(f=>{
      const off = disabledKeys.has(FLV_KEYS[f]);
      const row = document.createElement("div");
      row.className = "ap-flavor";
      row.innerHTML = `
        <div>${f}${off?` <small style="opacity:.7">(sin stock)</small>`:""}</div>
        <div class="ap-qty">
          <button class="ap-qty-btn" data-f="${f}" data-op="-" ${off?"disabled":""}>−</button>
          <input value="0" disabled class="ap-qty-input" style="width:42px;opacity:.8">
          <button class="ap-qty-btn" data-f="${f}" data-op="+" ${off?"disabled":""}>+</button>
        </div>
      `;
      if (off) row.style.opacity = .5;
      list.appendChild(row);
    });

    const totEl  = wrap.querySelector("#totSel");
    const calcEl = wrap.querySelector("#calcPrice");
    const helper = wrap.querySelector("#helper");
    const addBtn = wrap.querySelector("[data-add]");

    function recalc(){
      const t = totalSel();
      totEl.textContent = t;

      let price = 0;
      if(mode==="docena"){
        const ok = t>0 && t%12===0;
        addBtn.disabled = !ok;
        const faltan = (12 - (t%12)) % 12;
        helper.textContent = ok ? `Listo: ${t/12} docena(s).` : `Te faltan ${faltan} para completar docena.`;
        price = ok ? (t/12)*priceDozen : 0;
      }else{
        addBtn.disabled = t===0;
        const dozens = Math.floor(t/12);
        const rest   = t%12;
        price = (dozens*priceDozen) + (rest*priceUnit);
        helper.textContent = dozens>0 ? `Se cobra ${dozens} docena(s) + ${rest} unidad(es).` : "";
      }
      calcEl.textContent = fmt(price);
    }

    wrap.addEventListener("click",(e)=>{
      const f = e.target.dataset?.f, op = e.target.dataset?.op;
      if(!f || !op) return;
      counts[f] = Math.max(0, counts[f] + (op==="+"?1:-1));
      e.target.closest(".ap-flavor").querySelector("input").value = counts[f];
      recalc();
    });

    wrap.querySelector("[data-clear]").onclick = ()=>{
      Object.keys(counts).forEach(k=>counts[k]=0);
      list.querySelectorAll("input").forEach(i=>i.value=0);
      recalc();
    };
    wrap.querySelector("[data-close]").onclick = ()=> document.body.removeChild(wrap);

    wrap.querySelector("[data-add]").onclick = ()=>{
      const t = totalSel(); if(t<=0) return;
      const notas = flavorsTxt() || "Surtidas";

      if(mode==="docena"){
        const dozens = t/12;
        addToCart({ id: prodDozen?.id || "emp_doc", nombre: prodDozen?.nombre || "Empanadas por docena", precio: priceDozen, qty: dozens, notas });
      }else{
        const dozens = Math.floor(t/12);
        const rest   = t%12;
        if(dozens>0){
          addToCart({ id: prodDozen?.id || "emp_doc", nombre: prodDozen?.nombre || "Empanadas por docena", precio: priceDozen, qty: dozens, notas });
        }
        if(rest>0){
          addToCart({ id: prodUnit?.id || "emp_uni", nombre: prodUnit?.nombre || "Empanadas por unidad", precio: priceUnit, qty: rest, notas });
        }
      }
      document.body.removeChild(wrap);
      notifyAdded("Empanadas");
    };

    document.body.appendChild(wrap);
    recalc();
  }

  /* ==========================
     11) CARRITO
     ========================== */
  function persistCart(){ localStorage.setItem("AP_CART", JSON.stringify(CART)); updateCartBadge(); }
  function updateCartBadge(){ const n = CART.reduce((a,b)=>a+b.qty,0); $("#cartCount") && ($("#cartCount").textContent = n); }
  function addToCart(item){
    const idx = CART.findIndex(x=>x.id===item.id && x.notas===item.notas);
    if(idx>-1) CART[idx].qty += item.qty; else CART.push(item);
    persistCart();
    const qtyx = item.qty>1 ? `${item.qty}× ` : "";
    notifyAdded(`${qtyx}${item.nombre}`);
  }
  function removeFromCart(i){ CART.splice(i,1); persistCart(); renderCart(); }
  function changeQty(i,delta){ CART[i].qty = Math.max(1, CART[i].qty + delta); persistCart(); renderCart(); }

  function isEmpCartItem(it){
    const name = (it.nombre||"").toLowerCase();
    if (name.includes("empanada")) return true;
    const p = PRODUCTS.find(x=>x.id === it.id);
    return (p && p.categoria === "Empanadas") || false;
  }

  function renderCart(){
    const wrap = $("#cartItems"); if (!wrap) return;
    wrap.innerHTML = "";
    CART.forEach((it,i)=>{
      const soloEliminar = isEmpCartItem(it);
      const row=document.createElement("div");
      row.className="ap-cart-item";
      row.innerHTML=`
        <div><strong>${it.qty}× ${it.nombre}</strong>${it.notas?`<br><small>${it.notas}</small>`:""}</div>
        <div><strong>${fmt(it.precio*it.qty)}</strong></div>
        <div>
          ${soloEliminar
            ? `<button class="ap-ghost" aria-label="quitar">🗑️</button>`
            : `<button class="ap-qty-btn" aria-label="menos">−</button>
               <button class="ap-qty-btn" aria-label="más">+</button>
               <button class="ap-ghost" aria-label="quitar">🗑️</button>`}
        </div>`;
      if (soloEliminar){
        row.querySelector(".ap-ghost").onclick = ()=>removeFromCart(i);
      }else{
        const [btnMenos, btnMas, btnDel] = row.querySelectorAll("button");
        btnMenos.onclick = ()=>changeQty(i,-1);
        btnMas.onclick  = ()=>changeQty(i, 1);
        btnDel.onclick  = ()=>removeFromCart(i);
      }
      wrap.appendChild(row);
    });

    const subtotal = CART.reduce((a,b)=>a+b.precio*b.qty,0);
    $("#subtotal") && ($("#subtotal").textContent = fmt(subtotal));
    const envioSel = $("#envioSelect")?.value || "";
    const envio = ENVIO[envioSel] ?? 0;
    $("#total") && ($("#total").textContent = fmt(subtotal + envio));

    const checkoutBtn = $("#checkoutBtn");
    if (checkoutBtn) checkoutBtn.disabled = !envioSel;
  }

  // --- Router hash para el carrito (#carrito) ---
  let _openingFromHash = false;
  function openCart(fromHash=false){
    _openingFromHash = fromHash;
    $("#cartDrawer")?.setAttribute("aria-hidden","false");
    renderCart();
    if (!fromHash && location.hash !== "#carrito") {
      history.pushState({ ap: "carrito" }, "", "#carrito");
    }
  }
  function closeCart(){
    $("#cartDrawer")?.setAttribute("aria-hidden","true");
    if (location.hash === "#carrito") {
      // Si la apertura metió un pushState, volvemos una
      history.back();
    }
  }
  window.addEventListener("hashchange", ()=>{
    if (location.hash === "#carrito") openCart(true);
    else $("#cartDrawer")?.setAttribute("aria-hidden","true");
  });
  window.addEventListener("popstate", ()=>{
    if (location.hash !== "#carrito") $("#cartDrawer")?.setAttribute("aria-hidden","true");
  });

  /* ==========================
     12) TOAST
     ========================== */
  function injectToastCssOnce(){
    if(document.getElementById("ap-toast-style")) return;
    const css = `
      .ap-toast{position:fixed;left:50%;bottom:18px;z-index:90;transform:translateX(-50%);
        display:flex;align-items:center;gap:.75rem;background:#11131b;color:#e6e9f0;
        border:1px solid #262a3d;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);
        padding:.6rem .8rem;animation:apToastIn .15s ease-out}
      .ap-toast.hide{animation:apToastOut .12s ease-in forwards}
      .ap-toast-actions{display:flex;gap:.5rem}
      @keyframes apToastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
      @keyframes apToastOut{to{opacity:0;transform:translate(-50%,6px)}}
      @media (max-width: 480px){
        .ap-toast{left:12px; right:12px; transform:none; justify-content:space-between; flex-wrap:wrap; gap:.6rem;}
        .ap-toast .ap-primary{flex:0 0 auto; min-width:110px; padding:.55rem .8rem; font-size:.92rem;}
      }`;
    const style = document.createElement("style");
    style.id = "ap-toast-style";
    style.textContent = css;
    document.head.appendChild(style);
  }
  function notifyAdded(texto){
    injectToastCssOnce();
    document.querySelectorAll(".ap-toast").forEach(t=>t.remove());
    const t = document.createElement("div");
    t.className = "ap-toast";
    t.innerHTML = `
      <span>${texto} agregado 🛒</span>
      <div class="ap-toast-actions">
        <button class="ap-ghost" data-close>Seguir</button>
        <button class="ap-primary" data-open>Ver pedido</button>
      </div>`;
    document.body.appendChild(t);
    const close = ()=> t.classList.add("hide");
    t.querySelector("[data-close]").onclick = close;
    t.querySelector("[data-open]").onclick  = ()=>{ openCart(); close(); };
    setTimeout(close, 3500);
  }

  /* ==========================
     13) HORARIOS (robustos, sin “1899”)
     ========================== */
  function parseHHmm(str = "00:00"){
    const [h, m] = String(str).split(":").map(n => +n || 0);
    return { h, m, mins: h * 60 + m };
  }
  function openHoursText(){
    const tueClosed = (HOURS.open_days || []).includes(2) ? "" : " (Mar cerrado)";
    return `${HOURS.open}–${HOURS.close}${tueClosed}`;
  }
  function closedReasonFor(dateISO){
    const cd = HOURS.closed_dates;
    if (!cd) return "";
    if (Array.isArray(cd)) {
      if (!cd.length) return "";
      if (typeof cd[0] === "string") return cd.includes(dateISO) ? "cerrado" : "";
      const hit = cd.find(x => (x?.date || x?.day) === dateISO);
      return hit ? (hit.reason || hit.msg || "cerrado") : "";
    }
    if (typeof cd === "object") {
      const v = cd[dateISO];
      return !v ? "" : (typeof v === "string" ? v : (v.reason || v.msg || "cerrado"));
    }
    return "";
  }
  function isOpenNow(now = new Date()){
    const day = now.getDay(); // 0..6
    const openDays = HOURS.open_days && HOURS.open_days.length ? HOURS.open_days : [0,1,3,4,5,6]; // martes fuera
    if (!openDays.includes(day)) return false;

    const base = new Date(now); base.setHours(0,0,0,0);
    if (closedReasonFor(base.toISOString().slice(0,10))) return false;

    const cur = now.getHours() * 60 + now.getMinutes();
    const { mins: openM }  = parseHHmm(HOURS.open || "19:00");
    const { mins: closeM } = parseHHmm(HOURS.close || "23:59");

    if (closeM > openM) return cur >= openM && cur < closeM; // rango normal
    return cur >= openM || cur < closeM; // cruza medianoche
  }
  function setOpenStateBadge(){
    const badge = $("#apOpenBadge") || $("#openState");
    if(!badge) return;
    const open = isOpenNow();
    badge.textContent = open ? "Estamos atendiendo" : "Cerrado";
    badge.classList.toggle("ap-open", open);
    badge.classList.toggle("ap-closed", !open);
    badge.title = "Horario: " + openHoursText();
  }
  let OPEN_BADGE_TIMER = null;
  function queueOpenBadgesRefresh(){
    setOpenStateBadge();
    if (OPEN_BADGE_TIMER) clearInterval(OPEN_BADGE_TIMER);
    OPEN_BADGE_TIMER = setInterval(setOpenStateBadge, 60000);
  }

  /* =================================================
     14) CHECKOUT
     ================================================= */
  function toggleDeliveryRequirements(){
    const envioSel = $("#envioSelect")?.value || "";
    const form = $("#checkoutForm"); if(!form) return;

    const inNombre    = form.querySelector('[name="nombre"]');
    const inApellido  = form.querySelector('[name="apellido"]');
    const inTelefono  = form.querySelector('[name="telefono"]');
    const inLocalidad = form.querySelector('[name="localidad"]');
    const inDomicilio = form.querySelector('[name="domicilio"]');

    if(inNombre)   inNombre.required = true;
    if(inApellido) inApellido.required = true;

    const isRetiro = envioSel === "retiro";
    const isEnvio  = !isRetiro;

    if(inTelefono)  inTelefono.required = isRetiro;
    if(inDomicilio) inDomicilio.required = isEnvio;

    if(inLocalidad){
      inLocalidad.value    = isEnvio ? envioSel : "";
      inLocalidad.disabled = true;
      const lbl = inLocalidad.closest("label");
      if(lbl && lbl.style) lbl.style.display = "none";
    }
  }

  function bindCheckout(){
    if (bindCheckout._bound) return;
    bindCheckout._bound = true;

    // Botones de apertura/cierre
    $("#openCart")?.addEventListener("click", (e)=>{ e.preventDefault(); openCart(); });
    $("#closeCart")?.addEventListener("click", (e)=>{ e.preventDefault(); closeCart(); });
    $("#keepShopping")?.addEventListener('click', (e)=>{ e.preventDefault(); closeCart(); });

    $("#envioSelect")?.addEventListener("change", ()=>{ renderCart(); toggleDeliveryRequirements(); });

    const checkoutBtn  = $("#checkoutBtn");
    const form         = $("#checkoutForm");
    const transferInfo = $("#transferInfo");

    checkoutBtn?.addEventListener("click", ()=>{
      if(CART.length===0){ alert("Tu carrito está vacío."); return; }
      if (!$("#envioSelect")?.value){ alert("Elegí la modalidad de envío."); return; }
      if(form) form.hidden = false; if (checkoutBtn) checkoutBtn.hidden = true;
      toggleDeliveryRequirements();
    });
    $("#cancelCheckout")?.addEventListener("click", ()=>{
      if(form) form.hidden = true;
      if(checkoutBtn) checkoutBtn.hidden = false;
    });
    form?.addEventListener("change", e=>{
      if(e.target.name==="pago"){ if (transferInfo) transferInfo.hidden = (e.target.value!=="Transferencia"); }
    });

    // Copiar alias (por si el botón “copiar” está)
    $("#copyAlias")?.addEventListener("click", async ()=>{
      const txt = $("#apAliasText")?.textContent?.trim() || '';
      if (!txt) return;
      try{
        await navigator.clipboard.writeText(txt);
        const ok = $("#aliasCopied");
        if(ok){ ok.hidden = false; setTimeout(()=> ok.hidden = true, 1500); }
      }catch(_){ alert('No se pudo copiar el alias.'); }
    });

    form?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      if(CART.length===0){ alert("Tu carrito está vacío."); return; }

      // bloqueo por horario
      if (!isOpenNow()){
        alert(`Ahora estamos cerrados. Nuestro horario es ${openHoursText()}.`);
        return;
      }

      if (SUBMITTING_ORDER) return;
      SUBMITTING_ORDER = true;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const fd   = new FormData(form);
        const data = Object.fromEntries(fd.entries());

        const envioSel = $("#envioSelect").value;
        const subtotal = CART.reduce((a,b)=>a+b.precio*b.qty,0);
        const envio    = ENVIO[envioSel] ?? 0;
        const total    = subtotal + envio;

        const errors = [];
        if(!norm(data.nombre))   errors.push("Completá el NOMBRE.");
        if(!norm(data.apellido)) errors.push("Completá el APELLIDO.");

        const isRetiro = envioSel === "retiro";
        if(isRetiro){
          if(!norm(data.telefono)) errors.push("Para RETIRO, el TELÉFONO es obligatorio.");
        }else{
          if(!norm(data.domicilio)) errors.push("Completá el DOMICILIO para el envío.");
        }
        if(errors.length){
          alert("Faltan datos obligatorios:\n• " + errors.join("\n• "));
          return;
        }

        const localidadAuto = isRetiro ? "" : envioSel;

        const TIMES = "×";
        const MDASH = "—";
        const productosTxt = CART.map(it =>
          `* ${it.qty} ${TIMES} ${it.nombre}${it.notas?` (${it.notas})`:""} ${MDASH} ${fmt(it.precio * it.qty)}`
        ).join("\n");
        const modalidad = isRetiro ? "Retiro en local" : `Envío a domicilio (${envioSel})`;

        const lineas = [
          "Pedido – Abuela Perla",
          "",
          "Productos:",
          productosTxt,
          "",
          `Total productos: ${fmt(subtotal)}`,
          `Envío: ${fmt(envio)}`,
          `TOTAL: ${fmt(total)}`,
          "",
          `Modalidad: ${modalidad}`,
          `Pago: ${data.pago}`,
        ];

        if (data.pago === "Transferencia") {
          lineas.push(
            `Alias: ${TRANSFER.alias}`,
            `Titular: ${TRANSFER.titular}`,
            `Comprobantes: +${TRANSFER.compa}`
          );
        }

        if (isRetiro) {
          lineas.push(
            "",
            "Datos de retiro:",
            `* Apellido y nombre: ${safe(data.apellido)} ${safe(data.nombre)}`,
            `* Teléfono: ${safe(data.telefono)}`
          );
        } else {
          lineas.push(
            "",
            "Datos de entrega:",
            `* Localidad: ${localidadAuto}`,
            `* Apellido y nombre: ${safe(data.apellido)} ${safe(data.nombre)}`,
            `* Domicilio: ${safe(data.domicilio)}`
          );
          if (safe(data.referencia)) lineas.push(`* Referencia: ${safe(data.referencia)}`);
          if (safe(data.telefono))   lineas.push(`* Teléfono: ${safe(data.telefono)}`);
        }

        if (safe(data.obsComida)) lineas.push("", `Obs comida: ${safe(data.obsComida)}`);

        const msg   = encodeURIComponent(lineas.join("\n"));
        const waUrl = `https://wa.me/${EMPLOYEE_WA}?text=${msg}`;

        let orderId = `AP-${Date.now()}`;
        try{
          const saved = await api("createOrder", {
            id: orderId,
            cliente: { nombre: data.nombre, apellido: data.apellido, telefono: data.telefono },
            envio: { tipo: envioSel, localidad: localidadAuto, domicilio: data.domicilio||"", referencia: data.referencia||"", costo: ENVIO[envioSel] ?? 0 },
            pago:  { metodo: data.pago, alias: TRANSFER.alias, titular: TRANSFER.titular, compa: "+"+TRANSFER.compa },
            items: CART,
            totales: { subtotal, envio, total },
            obs:   { comida: data.obsComida||"" }
          }, true);
          if(saved?.id){ orderId = saved.id; }
        }catch(err){ console.error("No se pudo guardar en hoja:", err); }

        window.open(waUrl, "_blank");

        CART.length = 0; persistCart(); renderCart();
        alert("¡Pedido enviado! También quedó registrado en el panel de cocina.");
        form.reset(); form.hidden=true; $("#checkoutBtn").hidden=false;
        closeCart();
      } finally {
        SUBMITTING_ORDER = false;
        const submitBtn2 = form.querySelector('button[type="submit"]');
        if (submitBtn2) submitBtn2.disabled = false;
      }
    });
  }

  /* ==========================
     15) ADMIN (CRUD + Config)
     ========================== */
  function renderLoginCard({title="Acceso", onSubmit}){
    const main = document.querySelector("main") || document.body;
    const wrap = document.createElement("div");
    wrap.style.maxWidth="520px";
    wrap.style.margin="3rem auto";
    wrap.style.background="#141414";
    wrap.style.border="1px solid #262626";
    wrap.style.borderRadius="16px";
    wrap.style.padding="1rem";
    wrap.innerHTML = `
      <h2 style="margin:.2rem 0 1rem 0">${title}</h2>
      <form id="apLoginForm" class="ap-grid-2">
        <label>Usuario<input name="user" required placeholder="admin" /></label>
        <label>Contraseña<input name="pass" type="password" required placeholder="••••••••" /></label>
        <div style="grid-column:1/-1;display:flex;gap:.5rem;margin-top:.5rem">
          <button type="submit" class="ap-primary">Ingresar</button>
          <button type="button" class="ap-ghost" id="apLoginReset">Limpiar token</button>
        </div>
      </form>
      <p style="opacity:.7;margin-top:.6rem">Si olvidaste la clave, reseteemos en Apps Script.</p>
    `;
    main.innerHTML = "";
    main.appendChild(wrap);

    const form = wrap.querySelector("#apLoginForm");
    const btnReset = wrap.querySelector("#apLoginReset");
    form.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      await onSubmit(fd.get("user"), fd.get("pass"));
    });
    btnReset.onclick = ()=>{ clearToken(); alert("Token eliminado."); location.reload(); };
  }

  async function renderAdmin(){
    const ok = await ensureAuth("admin.html");
    if(!ok) return;

    await loadProducts();
    await loadConfig();
    applyConfigToUI();

    const cfgForm = document.querySelector("#cfgForm");
    if (cfgForm) setupConfigForm(cfgForm);

    const rowsTbody = document.querySelector("#adminRows");
    const catSel    = document.querySelector("#admCatFilter");
    const searchInp = document.querySelector("#admSearch");
    const newBtn    = document.querySelector("#admNew");
    const hintEl    = document.querySelector("#admHint");

    let FILTER_CAT = "";
    let FILTER_Q   = "";

    const cats = [...new Set(PRODUCTS.map(p=>p.categoria).filter(Boolean))].sort();
    if (catSel) {
      catSel.innerHTML = `<option value="">Todas las categorías</option>` + cats.map(c=>`<option>${c}</option>`).join("");
      catSel.onchange = ()=>{ FILTER_CAT = catSel.value; render(); };
    }
    if (searchInp) searchInp.oninput = ()=>{ FILTER_Q = searchInp.value.trim(); render(); };

    function applyFilter(p){
      if(FILTER_CAT && p.categoria !== FILTER_CAT) return false;
      if(FILTER_Q){
        const q = FILTER_Q.toLowerCase();
        const hay = (p.id||"").toLowerCase().includes(q)
                 || (p.nombre||"").toLowerCase().includes(q)
                 || (p.descripcion||"").toLowerCase().includes(q)
                 || (p.sabores_off||"").toLowerCase().includes(q);
        if(!hay) return false;
      }
      return true;
    }
    const fmtPrice = n => n ? "$ " + Number(n).toLocaleString("es-AR") : "-";
    const chipListFromSabores = p => {
      const text = (p.sabores_off||"").trim();
      if(!text) return "";
      return text.split(/[,;/]+/).map(s=>s.trim()).filter(Boolean)
        .map(s=>`<span class="ap-chip ap-chip--warn" title="Sin stock">${s}</span>`).join(" ");
    };

    function setupConfigForm(form){
      const f = {
        envio_d:  form.querySelector('[name="envio_diamante"]'),
        envio_s:  form.querySelector('[name="envio_strobel"]'),
        envio_r:  form.querySelector('[name="envio_retiro"]'),
        alias:     form.querySelector('[name="transfer_alias"]'),
        titular:   form.querySelector('[name="transfer_titular"]'),
        compa:     form.querySelector('[name="transfer_compa"]'),
        reloadBtn: form.querySelector('#cfgReload')
      };

      async function fillFromBackend(){
        try{
          const r = await api("getConfig", {}, false);
          if (r?.ok){
            const envio = r.envio || {};
            const transfer = r.transfer || {};
            f.envio_d.value = Number(envio.Diamante ?? ENVIO.Diamante) || 0;
            f.envio_s.value = Number(envio.Strobel  ?? ENVIO.Strobel ) || 0;
            f.envio_r.value = Number(envio.retiro   ?? ENVIO.retiro  ) || 0;

            f.alias.value   = transfer.alias   ?? (TRANSFER.alias||"");
            f.titular.value = transfer.titular ?? (TRANSFER.titular||"");
            f.compa.value   = transfer.compa   ?? (TRANSFER.compa||"");
          }else{
            f.envio_d.value = ENVIO.Diamante || 0;
            f.envio_s.value = ENVIO.Strobel  || 0;
            f.envio_r.value = ENVIO.retiro   || 0;
            f.alias.value   = TRANSFER.alias   || "";
            f.titular.value = TRANSFER.titular || "";
            f.compa.value   = TRANSFER.compa   || "";
          }
          applyConfigToUI();
        }catch(e){
          console.warn("[admin cfg] getConfig falló, usando memoria:", e);
          f.envio_d.value = ENVIO.Diamante || 0;
          f.envio_s.value = ENVIO.Strobel  || 0;
          f.envio_r.value = ENVIO.retiro   || 0;
          f.alias.value   = TRANSFER.alias   || "";
          f.titular.value = TRANSFER.titular || "";
          f.compa.value   = TRANSFER.compa   || "";
          applyConfigToUI();
        }
      }

      fillFromBackend();

      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const payload = {
          envio: {
            Diamante: Number(f.envio_d.value || 0),
            Strobel:  Number(f.envio_s.value || 0),
            retiro:   Number(f.envio_r.value || 0),
          },
          transfer: {
            alias:   (f.alias.value||"").trim(),
            titular: (f.titular.value||"").trim(),
            compa:   (f.compa.value||"").trim(),
          }
        };
        try{
          const res = await api("upsertConfig", payload, true);
          if(!res?.ok) throw new Error(res?.error || "No se pudo guardar");
          Object.assign(ENVIO, payload.envio);
          Object.assign(TRANSFER, payload.transfer);
          localStorage.setItem("AP_CFG_PUSH", JSON.stringify({ envio: payload.envio, transfer: payload.transfer, ts: Date.now() }));
          applyConfigToUI();
          alert("Configuración guardada ✔️");
        }catch(err){
          console.error("[admin cfg] upsertConfig", err);
          alert("No autorizado o error guardando configuración.");
          if(/unauthorized|invalid/i.test(String(err?.message||""))) { clearToken(); location.reload(); }
        }
      });

      f.reloadBtn?.addEventListener("click", fillFromBackend);
    }

    function render(){
      const list = PRODUCTS.filter(applyFilter).sort((a,b)=>{
        if(a.categoria!==b.categoria) return a.categoria.localeCompare(b.categoria);
        return a.nombre.localeCompare(b.nombre);
      });
      rowsTbody.innerHTML = "";
      if(hintEl) hintEl.textContent = list.length ? `${list.length} producto(s)` : "Sin resultados";

      list.forEach(p=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><code style="opacity:.85">${p.id||"-"}</code></td>
          <td><span class="ap-chip">${p.categoria||"-"}</span></td>
          <td>
            <div style="display:flex;gap:.6rem;align-items:center">
              <img src="${getProductImage(p)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:1px solid #2a2a2a" onerror="this.style.visibility='hidden'">
              <div>
                <strong>${p.nombre||"-"}</strong>
                <div style="opacity:.75">${p.descripcion||""}</div>
              </div>
            </div>
          </td>
          <td>${chipListFromSabores(p) || "-"}</td>
          <td>${fmtPrice(p.precio)}</td>
          <td>${p.visible!==false ? '<span class="ap-badge-ok">Visible</span>' : '<span class="ap-badge-off">Oculto</span>'}</td>
          <td>${p.img ? `<code style="font-size:.82rem">${p.img}</code>` : "-"}</td>
          <td>
            <div class="ap-actions">
              <button class="ap-btn ap-btn--primary" data-edit>Editar</button>
              <button class="ap-btn" data-vis>${p.visible!==false?'Ocultar':'Mostrar'}</button>
              <button class="ap-btn ap-btn--danger" data-del>Eliminar</button>
            </div>
          </td>
        `;

        tr.querySelector("[data-edit]").onclick = ()=> openProductModal(p);
        tr.querySelector("[data-vis]").onclick  = async ()=>{
          const newVis = !(p.visible!==false);
          try{
            const res = await api("updateVisibility", { id:p.id, visible:newVis }, true);
            if(!res?.ok) throw new Error(res?.error || "No se pudo actualizar");
            p.visible = newVis;
            render();
          }catch(e){
            alert("No autorizado o error al actualizar visibilidad.");
            if(/unauthorized|invalid/i.test(String(e?.message||""))) { clearToken(); location.reload(); }
          }
        };
        tr.querySelector("[data-del]").onclick  = async ()=>{
          if(!confirm(`¿Eliminar "${p.nombre}"?`)) return;
          try{
            const res = await api("deleteProduct", { id:p.id }, true);
            if(!res?.ok) throw new Error(res?.error || "No se pudo eliminar");
            PRODUCTS = PRODUCTS.filter(x=>x.id!==p.id);
            render();
          }catch(e){
            alert("No autorizado o error al eliminar.");
            if(/unauthorized|invalid/i.test(String(e?.message||""))) { clearToken(); location.reload(); }
          }
        };

        rowsTbody.appendChild(tr);
      });
    }

    function openProductModal(prod){
      const isNew = !prod;
      const p = prod ? {...prod} : { id: uid(), categoria:"", nombre:"", descripcion:"", precio:0, visible:true, sabores_off:"", img:"" };

      const wrap = document.createElement("div");
      wrap.className = "ap-modal";
      wrap.innerHTML = `
        <div class="ap-modal__card">
          <div class="ap-row ap-row--between">
            <h3>${isNew?"Nuevo":"Editar"} producto</h3>
            <button class="ap-icon-btn" data-close>✕</button>
          </div>
          <form id="prodForm" class="ap-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
            <label class="full">ID
              <input name="id" value="${p.id}" readonly>
            </label>
            <label>Categoría
              <input name="categoria" value="${p.categoria||""}" required>
            </label>
            <label>Nombre
              <input name="nombre" value="${p.nombre||""}" required>
            </label>
            <label class="full">Descripción
              <input name="descripcion" value="${p.descripcion||""}">
            </label>
            <label>Precio
              <input name="precio" type="number" step="1" min="0" value="${Number(p.precio)||0}" required>
            </label>
            <label>Visible
              <select name="visible">
                <option value="1" ${p.visible!==false?"selected":""}>Sí</option>
                <option value="0" ${p.visible===false?"selected":""}>No</option>
              </select>
            </label>
            <label class="full">Sabores sin stock (separados por coma)
              <input name="sabores_off" value="${p.sabores_off||""}">
            </label>
            <label class="full">Imagen (URL o nombre en /assets)
              <input name="img" value="${p.img||""}">
            </label>
            <div class="ap-modal__foot full">
              <button type="button" class="ap-btn ap-btn--ghost" data-close>Cancelar</button>
              <button type="submit" class="ap-btn ap-btn--primary">${isNew?"Crear":"Guardar"}</button>
            </div>
          </form>
        </div>
      `;
      wrap.addEventListener("click", (ev)=>{ if(ev.target.dataset.close!==undefined){ document.body.removeChild(wrap); }});
      const form = wrap.querySelector("#prodForm");
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const payload = {
          id: fd.get("id"),
          categoria: fd.get("categoria"),
          nombre: fd.get("nombre"),
          descripcion: fd.get("descripcion"),
          precio: Number(fd.get("precio")||0),
          visible: fd.get("visible")==="1",
          sabores_off: fd.get("sabores_off")||"",
          img: fd.get("img")||""
        };
        try{
          const r = await api("upsertProduct", { product: payload }, true);
          if(!r?.ok) throw new Error(r?.error || "No se pudo guardar");
          const idx = PRODUCTS.findIndex(x=>x.id===payload.id);
          if(idx>-1) PRODUCTS[idx] = normalizeProduct(payload);
          else PRODUCTS.push(normalizeProduct(payload));
          render();
          document.body.removeChild(wrap);
        }catch(err){
          alert("No autorizado o error guardando producto.");
          if(/unauthorized|invalid/i.test(String(err?.message||""))) { clearToken(); location.reload(); }
        }
      });

      document.body.appendChild(wrap);
    }

    newBtn && (newBtn.onclick = ()=> openProductModal(null));

    render();
  }

  /* ==========================
     16) PANEL COCINA (3 columnas)
     ========================== */
  let PANEL = {
    date: todayISO(),
    list: [],
    selected: null,
    timer: null,
    auto: true
  };

  function bindPanelControls(){
    const dayPicker = $("#dayPicker");
    if (dayPicker){ dayPicker.value = PANEL.date; dayPicker.onchange = ()=>{ PANEL.date = dayPicker.value || todayISO(); refreshPanel(); }; }
    $("#btnRefresh")?.addEventListener("click", refreshPanel);
    $("#btnCleanDay")?.addEventListener("click", async ()=>{
      if(!confirm("Esto archiva las comandas del día. ¿Continuar?")) return;
      try{
        const r = await api("archiveDay", { day: PANEL.date }, true);
        if(!r?.ok) throw new Error(r?.error || "No se pudo limpiar el día");
        await refreshPanel();
      }catch(e){
        alert("No autorizado o error al archivar día.");
        if(/unauthorized|invalid/i.test(String(e?.message||""))) { clearToken(); location.reload(); }
      }
    });
    const autoBtn = $("#autoRefresh");
    if (autoBtn){
      autoBtn.onclick = ()=>{ PANEL.auto = !PANEL.auto; autoBtn.textContent = PANEL.auto ? "Auto ON" : "Auto OFF"; };
      autoBtn.textContent = PANEL.auto ? "Auto ON" : "Auto OFF";
    }
  }

  function splitOrders(){
    const news = PANEL.list.filter(o => !o.printed);
    const prints = PANEL.list.filter(o => o.printed);
    return { news, prints };
  }

  function rowHtml(o){
    const t = new Date(o.ts || o.created_at || Date.now());
    const hhmm = String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");
    const envioCalc = Number((o?.envio?.costo ?? o?.totales?.envio) || 0);
    const itemsTotal = (o.items||[]).reduce((a,b)=>a + (b.precio*b.qty), 0);
    const total = o?.totales?.total ?? (itemsTotal + envioCalc);
    return `
      <div class="k-row" data-id="${o.id}">
        <div class="k-id">${o.id || "-"}</div>
        <div class="k-time">${hhmm} — ${o?.cliente?.apellido||""} ${o?.cliente?.nombre||""}</div>
        <div class="k-total">${fmt(total)}</div>
      </div>
    `;
  }

  function renderPanelLists(){
    const { news, prints } = splitOrders();
    $("#listNew").innerHTML     = news.map(rowHtml).join("") || `<div class="k-muted">Sin nuevas</div>`;
    $("#listPrinted").innerHTML = prints.map(rowHtml).join("") || `<div class="k-muted">Sin impresas</div>`;
    $("#countNew").textContent = String(news.length);
    $("#countPrinted").textContent = String(prints.length);

    $$("#listNew .k-row, #listPrinted .k-row").forEach(n=>{
      n.onclick = ()=>{ const id = n.getAttribute("data-id"); const o = PANEL.list.find(x=>x.id===id); selectOrder(o); };
    });
  }

  function selectOrder(o){
    PANEL.selected = o || null;
    const box = $("#selectedBox");
    const empty = $("#emptyCenter");
    if(!o){ box.hidden = true; empty.hidden = false; return; }
    empty.hidden = true; box.hidden = false;

    const name = `${o?.cliente?.apellido||""} ${o?.cliente?.nombre||""}`.trim() || "Sin nombre";
    const when = new Date(o.ts || o.created_at || Date.now());
    const hhmm = String(when.getHours()).padStart(2,"0")+":"+String(when.getMinutes()).padStart(2,"0");
    const envioTxt = o?.envio?.tipo === "retiro"
      ? "Retiro en local"
      : `Envío a ${o?.envio?.localidad||"-"} (${o?.envio?.domicilio||"s/domicilio"})`;
    const itemsTxt = (o.items||[]).map(it=>`• ${it.qty}× ${it.nombre}${it.notas?` (${it.notas})`:""} — ${fmt(it.precio*it.qty)}`).join("\n");
    const subtotal = (o.items||[]).reduce((a,b)=>a + (b.precio*b.qty),0);
    const envio    = Number((o?.envio?.costo ?? o?.totales?.envio) || 0);
    const total    = (o?.totales?.total ?? (subtotal+envio));

    $("#selTitle").textContent = `${name} — ${o.id}`;
    $("#selMeta").textContent  = `Hora: ${hhmm} • ${envioTxt}`;
    $("#selItems").textContent = itemsTxt || "(Sin ítems)";
    $("#selTotals").textContent = `Subtotal: ${fmt(subtotal)} • Envío: ${fmt(envio)} • TOTAL: ${fmt(total)}`;
    $("#selObs").textContent   = (o?.obs?.comida) ? `Obs: ${o.obs.comida}` : "";
    $("#selPago").textContent  = o?.pago?.metodo ? `Pago: ${o.pago.metodo}` : "";

    $("#btnPrint").onclick = ()=> printOrder(o, 2, true);
    $("#btnReprint").onclick = ()=> printOrder(o, 1, false);
    $("#btnMarkPrinted").onclick = ()=> markPrinted(o);
  }

  function printOrder(o, copies=2, mark=true){
    const area = document.getElementById("printArea");
    if(!area){ alert("No hay área de impresión (#printArea). Revisá el HTML."); return; }
    area.innerHTML = "";
    for(let i=0;i<copies;i++){
      const ticket = document.createElement("div");
      ticket.className = "print-ticket";
      ticket.innerHTML = buildTicketHTML(o, i===0?"ORIGINAL":"COPIA");
      area.appendChild(ticket);
    }
    requestAnimationFrame(()=> {
      requestAnimationFrame(()=> {
        window.print();
        if (mark) markPrinted(o);
      });
    });
  }

  function buildTicketHTML(o, label="ORIGINAL"){
    const name = `${o?.cliente?.apellido||""} ${o?.cliente?.nombre||""}`.trim() || "Sin nombre";
    const when = new Date(o.ts || o.created_at || Date.now());
    const fecha = isoDate(when) + " " + HHmm(when);
    const envio = o?.envio?.tipo === "retiro"
      ? `RETIRO EN LOCAL`
      : `ENVÍO: ${o?.envio?.localidad||"-"} — ${o?.envio?.domicilio||"-"}`;
    const itemsHtml = (o.items||[]).map(it=>
      `<div>* ${it.qty} × ${it.nombre}${it.notas?` <span class="mono">(${it.notas})</span>`:""} — ${fmt(it.precio*it.qty)}</div>`
    ).join("");
    const subtotal = (o.items||[]).reduce((a,b)=>a + (b.precio*b.qty),0);
    const envioCost= Number((o?.envio?.costo ?? o?.totales?.envio) || 0);
    const total    = (o?.totales?.total ?? (subtotal+envioCost));
    const pago     = o?.pago?.metodo || "";

    const pagosHtml = pago
      ? `<div>Pago: ${pago}</div>${pago==="Transferencia" ? `<div>Comprobantes: ${o?.pago?.compa || ("+"+TRANSFER.compa)}</div>` : ""}`
      : "";

    const obsHtml = o?.obs?.comida ? `<div>Obs comida: ${o.obs.comida}</div>` : "";

    const datosEntrega = (o?.envio?.tipo === "retiro")
      ? `<div>Datos de retiro:</div>
         <div>* Apellido y nombre: ${name}</div>
         ${o?.cliente?.telefono ? `<div>* Teléfono: ${o.cliente.telefono}</div>`:""}`
      : `<div>Datos de entrega:</div>
         <div>* Localidad: ${o?.envio?.localidad||"-"}</div>
         <div>* Apellido y nombre: ${name}</div>
         <div>* Domicilio: ${o?.envio?.domicilio||"-"}</div>
         ${o?.cliente?.telefono ? `<div>* Teléfono: ${o.cliente.telefono}</div>`:""}`;

    return `
      <div class="small">
        <h2>Pedido – Abuela Perla</h2>
        <div class="mono">${o.id} • ${fecha}</div>
        <div class="print-sep"></div>
        <div>Productos:</div>
        ${itemsHtml || "<div>(Sin ítems)</div>"}
        <div class="print-sep"></div>
        <div>Total productos: ${fmt(subtotal)}</div>
        <div>Envío: ${fmt(envioCost)}</div>
        <div><strong>TOTAL: ${fmt(total)}</strong></div>
        <div class="print-sep"></div>
        <div>Modalidad: ${o?.envio?.tipo === "retiro" ? "Retiro en local" : `Envío a domicilio (${o?.envio?.localidad||"-"})`}</div>
        ${pagosHtml}
        <div class="print-sep"></div>
        <div>${envio}</div>
        <div class="print-sep"></div>
        ${datosEntrega}
        ${obsHtml ? `<div class="print-sep"></div>${obsHtml}` : ""}
        <div class="print-sep"></div>
        <div class="mono">${label}</div>
      </div>`;
  }

  async function markPrinted(o){
    try{
      const r = await api("setOrderStatus", { id:o.id, printed:true }, true);
      if(!r?.ok) throw new Error(r?.error || "No se pudo marcar impreso");
      const it = PANEL.list.find(x=>x.id===o.id);
      if (it) it.printed = true;
      renderPanelLists();
    }catch(e){
      alert("No autorizado o error al marcar impreso.");
      if(/unauthorized|invalid/i.test(String(e?.message||""))) { clearToken(); location.reload(); }
    }
  }

  async function refreshPanel(){
    try{
      const r = await api("listOrders", { day: PANEL.date }, true);
      if(!r?.ok) throw new Error(r?.error || "No se pudieron listar comandas");
      PANEL.list = Array.isArray(r.orders) ? r.orders : [];
      renderPanelLists();
      setOpenStateBadge();
      if (PANEL.auto) scheduleAuto();
    }catch(e){
      console.error("listOrders:", e);
      if(/unauthorized|invalid/i.test(String(e?.message||""))) { clearToken(); location.reload(); }
    }
  }

  function scheduleAuto(){
    if (PANEL.timer) clearTimeout(PANEL.timer);
    if (!PANEL.auto) return;
    PANEL.timer = setTimeout(refreshPanel, 10000);
  }

  async function renderPanel(){
    const ok = await ensureAuth("panel.html");
    if(!ok) return;
    await loadConfig();
    setOpenStateBadge();
    bindPanelControls();
    const dayPicker = $("#dayPicker");
    if (dayPicker && !dayPicker.value) dayPicker.value = PANEL.date;
    await refreshPanel();
  }

  /* ==========================
     17) INICIALIZACIÓN (home)
     ========================== */
  async function bootHome(){
    await Promise.all([loadConfig(), loadProducts()]);
    applyConfigToUI();
    renderTabs();
    renderCart();
    bindCheckout();
    queueOpenBadgesRefresh();

    // Abrir directo si la URL viene con #carrito
    if (location.hash === "#carrito") openCart(true);
  }

  // Exponer API
  return {
    login, ensureAuth,
    renderCart,
    renderAdmin, renderPanel,
    applyConfigToUI,
    bootHome,
    isOpenNow
  };
})();

// Global
window.AP = AP;

// Auto-boot según página
document.addEventListener("DOMContentLoaded", ()=>{
  const here = (p)=> location.pathname.endsWith(p);
  if (document.getElementById("productList")) {
    window.AP?.bootHome?.();
  }
  if (here("admin.html")) {
    window.AP?.renderAdmin?.();
  }
  if (here("panel.html")) {
    window.AP?.renderPanel?.();
  }
});
