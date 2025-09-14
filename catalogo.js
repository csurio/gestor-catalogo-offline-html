// ================ Utils & state ================
var $ = function(s){ return document.querySelector(s); };
var listEl = $('#list');
var catalogEl = $('#catalog');

var state = {
  products: [],
  editingId: null,
  showSold: true,
  currency: 'USD',
  brand: { name:'', phone:'', email:'', logo:null, showPct:true },
  ui: { mode:'light' },           // ahora claro por defecto
  catalogTheme: 'cielo'
};

var LS_KEY = 'offlineCatalog.v6';

function load(){
  try{
    var raw = localStorage.getItem(LS_KEY);
    if(raw){
      var data = JSON.parse(raw);
      state.products = data.products||[];
      state.currency = data.currency||'USD';
      state.showSold = !!data.showSold;
      state.brand = data.brand||state.brand;
      if(typeof state.brand.showPct !== 'boolean') state.brand.showPct = true;
      state.ui = data.ui || state.ui;
      state.catalogTheme = data.catalogTheme || state.catalogTheme;
    }
  }catch(e){ console.warn('load error', e); }
}
function save(){
  localStorage.setItem(LS_KEY, JSON.stringify({
    products: state.products,
    currency: state.currency,
    showSold: state.showSold,
    brand: state.brand,
    ui: state.ui,
    catalogTheme: state.catalogTheme
  }));
}

function fmtPrice(n){
  var map = { USD: {symbol:'$'}, EUR:{symbol:'€'}, SVC:{symbol:'₡'}, MXN:{symbol:'$'} };
  var sym = (map[state.currency] && map[state.currency].symbol) ? map[state.currency].symbol : '$';
  var num = Number.isFinite(Number(n)) ? Number(n) : 0;
  return sym + num.toFixed(2);
}
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function round2(x){ return Math.round((Number(x)||0)*100)/100; }

function clearForm(){
  state.editingId = null;
  $('#pName').value='';
  $('#pCategory').value='';
  $('#pPrice').value='';
  $('#pOldPrice').value='';
  $('#pDiscount').value='';
  $('#pDiscountAmt').value='';
  $('#pStock').value='';
  $('#pStatus').value='available';
  $('#pSku').value='';
  $('#pDesc').value='';
  $('#pImage').value='';
  $('#formHint').textContent='';
  $('#btnAdd').textContent='Guardar producto';
}

function fileToDataUrl(file, max, cb, errCb){
  if(typeof max !== 'number'){ max = 1280; }
  var reader = new FileReader();
  reader.onerror = function(){ if(errCb) errCb('read_error'); };
  reader.onload = function(){
    var img = new Image();
    img.onerror = function(){ if(errCb) errCb('image_error'); };
    img.onload = function(){
      var scale = Math.min(1, max/Math.max(img.width,img.height));
      var w = Math.round(img.width*scale);
      var h = Math.round(img.height*scale);
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img,0,0,w,h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if(cb) cb(dataUrl);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function normalizePricing(price, oldPrice, discountPct, discountAmt){
  var p = isFinite(price)? Number(price): 0;
  var op = isFinite(oldPrice)? Number(oldPrice): null;
  var d = isFinite(discountPct)? Number(discountPct): null;
  var a = isFinite(discountAmt)? Number(discountAmt): null;

  if(d!=null && (d<0 || d>95)) d = Math.max(0, Math.min(95, d));
  if(a!=null && a<0) a = 0;
  if(op!=null && op<=0) op = null;

  if(op!=null && op>p){ d = Math.round((1 - (p/op))*100); a = round2(op - p); }
  else if(d!=null && d>0){ op = round2(p / (1 - d/100)); a = round2(op - p); }
  else if(a!=null && a>0){ op = round2(p + a); d = Math.round((a / op) * 100); }
  else { op = null; d = 0; a = 0; }

  if(op!=null && op<=p){ op = null; d = 0; a = 0; }
  return { price: round2(p), oldPrice: op!=null? round2(op): null, discountPct: d||0, discountAmt: a||0 };
}

function onSave(){
  var name = ($('#pName').value||'').trim();
  var price = parseFloat($('#pPrice').value||'0');
  var oldPrice = parseFloat($('#pOldPrice').value||'');
  var discount = parseFloat($('#pDiscount').value||'');
  var discountAmt = parseFloat($('#pDiscountAmt').value||'');
  var category = ($('#pCategory').value||'').trim();
  var status = $('#pStatus').value;
  var stock = parseInt($('#pStock').value||'');
  var sku = ($('#pSku').value||'').trim();
  var desc = ($('#pDesc').value||'').trim();
  var file = ($('#pImage').files && $('#pImage').files[0]) ? $('#pImage').files[0] : null;

  if(!name){ return msg('El nombre es obligatorio'); }
  if(!(price>=0)){ return msg('Precio inválido'); }

  var norm = normalizePricing(price, oldPrice, discount, discountAmt);
  if(isFinite(stock) && stock<=0 && status!=='hidden'){ status = 'sold'; }

  function persist(imgData){
    if(state.editingId){
      var idx = -1;
      for(var i=0;i<state.products.length;i++){ if(state.products[i].id===state.editingId){ idx=i; break; } }
      if(idx>-1){
        var old = state.products[idx];
        state.products[idx] = {
          id: old.id,
          name: name,
          price: norm.price,
          oldPrice: norm.oldPrice,
          discountPct: norm.discountPct,
          discountAmt: norm.discountAmt,
          stock: isFinite(stock)? Number(stock): null,
          category: category,
          status: status,
          sku: sku,
          desc: desc,
          image: (imgData || old.image),
          createdAt: old.createdAt,
          updatedAt: Date.now()
        };
      }
      msg('Producto actualizado');
    }else{
      state.products.unshift({
        id: uid(), name: name, price: norm.price, oldPrice: norm.oldPrice, discountPct: norm.discountPct, discountAmt: norm.discountAmt,
        stock: isFinite(stock)? Number(stock): null,
        category: category, status: status, sku: sku, desc: desc,
        image: (imgData || null), createdAt: Date.now(), updatedAt: Date.now()
      });
      msg('Producto agregado');
    }
    save(); render(); clearForm();
  }

  if(file){ fileToDataUrl(file, 1280, function(url){ persist(url); }, function(){ msg('No se pudo procesar la imagen'); }); }
  else { persist(null); }
}

function msg(t){ $('#formHint').textContent=t; setTimeout(function(){ $('#formHint').textContent=''; }, 2500); }

function adjustStockById(id, delta){
  var p=null, idx=-1; for(var i=0;i<state.products.length;i++){ if(state.products[i].id===id){ p=state.products[i]; idx=i; break; } }
  if(!p) return;
  var s = (typeof p.stock==='number')? p.stock : 0;
  s = s + delta; if(s<0) s=0; p.stock = s;
  if(p.status!=='hidden'){
    if(s<=0) p.status='sold'; else if(p.status==='sold') p.status='available';
  }
  p.updatedAt = Date.now(); state.products[idx] = p; save(); render();
}

// ============ Render & theming ============
function applyUiMode(){
  // switch encendido = oscuro
  var isDark = (state.ui.mode==='dark');
  document.body.setAttribute('data-ui', isDark ? 'dark' : 'light');
  var sw = $('#uiMode');
  sw.setAttribute('data-on', String(isDark));
  sw.setAttribute('aria-checked', String(isDark));
}
function applyCatalogTheme(){
  var v = document.getElementById('viewer');
  if(v) v.setAttribute('data-theme', state.catalogTheme || 'cielo');
}

function render(){
  // header público
  $('#vhBrand').textContent = state.brand.name||'Mi Emprendimiento';
  $('#vhPhone').textContent = state.brand.phone?('📱 '+state.brand.phone):'';
  $('#vhEmail').textContent = state.brand.email?('✉️ '+state.brand.email):'';
  $('#currency').value = state.currency;

  // toggles
  $('#toggleSold').setAttribute('data-on', String(!!state.showSold));
  $('#togglePct').setAttribute('data-on', String(!!state.brand.showPct));
  if(state.brand.logo){
    $('#brandLogoPreview').src = state.brand.logo; $('#vhLogo').src = state.brand.logo; $('#vhLogo').style.display='inline-block';
  } else {
    $('#brandLogoPreview').removeAttribute('src'); $('#vhLogo').style.display='none';
  }

  applyUiMode();
  applyCatalogTheme();

  // Buscar / ordenar
  var q = (($('#search').value||'').toLowerCase());
  var sort = $('#sort').value;

  var arr = state.products.slice();
  if(q){ arr = arr.filter(function(p){ return [p.name,p.category,p.sku].some(function(x){ return ((x||'').toLowerCase().indexOf(q) > -1); }); }); }
  if(!state.showSold){ arr = arr.filter(function(p){ return p.status!=="sold"; }); }

  if(sort==='name'){ arr.sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); }); }
  else if(sort==='priceAsc'){ arr.sort(function(a,b){ return (a.price||0)-(b.price||0); }); }
  else if(sort==='priceDesc'){ arr.sort(function(a,b){ return (b.price||0)-(a.price||0); }); }
  else { arr.sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); }); }

  // Render admin list + catálogo
  var htmlList = ''; for(var i=0;i<arr.length;i++){ htmlList += htmlProductCard(arr[i], true); } listEl.innerHTML = htmlList;
  var htmlGrid = ''; for(var j=0;j<arr.length;j++){ if(arr[j].status!=='hidden'){ htmlGrid += htmlProductCard(arr[j], false); } } catalogEl.innerHTML = htmlGrid;

  // Eventos dinámicos
  var edits = document.querySelectorAll('[data-action="edit"]');
  for(var e=0;e<edits.length;e++){
    edits[e].addEventListener('click', function(){
      var id = this.getAttribute('data-id');
      var p = null; for(var k=0;k<state.products.length;k++){ if(state.products[k].id===id){ p=state.products[k]; break; } }
      if(!p) return;
      state.editingId = id;
      $('#pName').value=p.name||'';
      $('#pCategory').value=p.category||'';
      $('#pPrice').value=p.price||'';
      $('#pOldPrice').value=p.oldPrice!=null?p.oldPrice:'';
      $('#pDiscount').value=p.discountPct||'';
      $('#pDiscountAmt').value=p.discountAmt||'';
      $('#pStock').value=(p.stock!=null)?p.stock:'';
      $('#pStatus').value=p.status||'available';
      $('#pSku').value=p.sku||'';
      $('#pDesc').value=p.desc||'';
      $('#btnAdd').textContent='Actualizar producto';
      window.scrollTo({top:0, behavior:'smooth'});
    });
  }
  var dels = document.querySelectorAll('[data-action="del"]');
  for(var d=0; d<dels.length; d++){
    dels[d].addEventListener('click', function(){
      var id = this.getAttribute('data-id');
      if(!confirm('¿Eliminar este producto?')) return;
      state.products = state.products.filter(function(x){ return x.id!==id; });
      save(); render();
    });
  }
  var toggles = document.querySelectorAll('[data-action="toggleSold"]');
  for(var t=0;t<toggles.length;t++){
    toggles[t].addEventListener('click', function(){
      var id = this.getAttribute('data-id');
      var p=null; for(var k=0;k<state.products.length;k++){ if(state.products[k].id===id){ p=state.products[k]; break; } }
      if(!p) return; p.status = (p.status==='sold'?'available':'sold'); p.updatedAt=Date.now();
      save(); render();
    });
  }
  var minusBtns = document.querySelectorAll('[data-action="stockMinus"]');
  for(var m=0;m<minusBtns.length;m++){ minusBtns[m].addEventListener('click', function(){ adjustStockById(this.getAttribute('data-id'), -1); }); }
  var plusBtns = document.querySelectorAll('[data-action="stockPlus"]');
  for(var pz=0;pz<plusBtns.length;pz++){ plusBtns[pz].addEventListener('click', function(){ adjustStockById(this.getAttribute('data-id'), +1); }); }
}

function priceLineHtml(p, showPct){
  var line = '<div class="price-line">';
  if(p.oldPrice!=null && p.oldPrice>p.price){ line += '<span class="label-before">Antes</span><span class="oldprice">'+fmtPrice(p.oldPrice)+'</span>'; }
  line += '<span class="label-now">Ahora</span><span class="price">'+fmtPrice(p.price)+'</span>';
  if(showPct && p.discountPct && p.discountPct>0){ line += '<span class="discount-badge">-'+p.discountPct+'%</span>'; }
  if(p.discountAmt && p.discountAmt>0){ line += '<span class="chip">Ahorro: '+fmtPrice(p.discountAmt)+'</span>'; }
  line += '</div>';
  return line;
}

function htmlProductCard(p, editable){
  var desc = String(p.desc||'').slice(0,120);
  var sold = p.status==='sold';
  var hidden = p.status==='hidden';
  var statusChip = hidden? '<span class="chip chip-muted">🙈 Oculto</span>' : (sold? '<span class="chip chip-danger">Vendido</span>' : '<span class="chip chip-success">Disponible</span>');
  var stockVal = (typeof p.stock==='number')? p.stock : 0;
  var stockChip = '<span class="chip chip-muted">Stock: '+stockVal+'</span>';
  var html = '';
  html += '<article class="product"'+(sold?' style="opacity:.9"':'')+'>';
  if(sold){ html += '<div class="sold-overlay"><span>VENDIDO</span></div>'; }
  html += '<img src="'+(p.image||placeholder())+'" alt="'+escapeHtml(p.name||'Producto')+'"/>';
  html += '<div class="pbody">';
  html += '<h3>'+escapeHtml(p.name||'')+'</h3>';
  html += priceLineHtml(p, state.brand.showPct);
  if(p.category){ html += '<div class="muted">'+escapeHtml(p.category)+'</div>'; }
  html += '<div class="muted">'+escapeHtml(desc)+'</div>';
  html += '<div class="chips">'+statusChip+stockChip+(p.sku?(' <span class="chip chip-muted">#'+escapeHtml(p.sku)+'</span>'):'')+'</div>';
  html += '</div>';
  if(editable){
    html += '<div class="actions">';
    html += '<button class="btn btn-ghost btn-sm" data-action="edit" data-id="'+p.id+'">Editar</button>';
    html += '<button class="btn btn-danger btn-sm" data-action="del" data-id="'+p.id+'">Eliminar</button>';
    html += '<button class="btn btn-accent btn-sm" data-action="toggleSold" data-id="'+p.id+'">'+(p.status==='sold'?'Marcar disponible':'Marcar vendido')+'</button>';
    html += '<div style="margin-left:auto; display:flex; gap:6px; align-items:center">'+
            '<span class="chip chip-muted">Stock</span>'+
            '<button class="btn btn-ghost btn-xs" data-action="stockMinus" data-id="'+p.id+'">−</button>'+
            '<button class="btn btn-ghost btn-xs" data-action="stockPlus" data-id="'+p.id+'">+</button>'+
            '</div>';
    html += '</div>';
  }
  html += '</article>';
  return html;
}

function placeholder(){
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stop-color="#eaeff7"/><stop offset="100%" stop-color="#f7f9fd"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="Segoe UI, Roboto, Arial" font-size="28">Sin imagen</text></svg>'
  );
}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(m){ return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]); });
}

// =============== UI events ===============
$('#brandName').addEventListener('input', function(e){ state.brand.name=e.target.value; save(); render(); });
$('#brandPhone').addEventListener('input', function(e){ state.brand.phone=e.target.value; save(); render(); });
$('#brandEmail').addEventListener('input', function(e){ state.brand.email=e.target.value; save(); render(); });
$('#currency').addEventListener('change', function(e){ state.currency=e.target.value; save(); render(); });
$('#toggleSold').addEventListener('click', function(){ state.showSold=!state.showSold; save(); render(); });
$('#togglePct').addEventListener('click', function(){ state.brand.showPct=!state.brand.showPct; save(); render(); });

/* Switch = modo oscuro: ON → dark, OFF → light */
$('#uiMode').addEventListener('click', function(){
  var on = this.getAttribute('data-on') === 'true';
  state.ui.mode = on ? 'light' : 'dark';
  save(); render();
});

document.getElementById('catalogTheme').addEventListener('change', function(e){
  state.catalogTheme = (e.target && e.target.value) ? e.target.value : 'cielo';
  save(); render();
});

$('#brandLogo').addEventListener('change', function(e){
  var f = (e.target.files && e.target.files[0])? e.target.files[0]: null; if(!f) return;
  fileToDataUrl(f, 512, function(url){ state.brand.logo = url; save(); render(); }, function(){ alert('No se pudo procesar el logo'); });
  e.target.value='';
});
$('#btnClearLogo').addEventListener('click', function(){ state.brand.logo=null; save(); render(); });

$('#btnAdd').addEventListener('click', onSave);
$('#btnClear').addEventListener('click', clearForm);

$('#search').addEventListener('input', render);
$('#sort').addEventListener('change', render);

/* Export / Import */
$('#btnExportJson').addEventListener('click', function(){
  var blob = new Blob([JSON.stringify({
    products: state.products, currency: state.currency, showSold: state.showSold, brand: state.brand, ui: state.ui, catalogTheme: state.catalogTheme
  }, null, 2)], {type:'application/json'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'catalogo-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href);
});
document.getElementById('btnImportJson').addEventListener('click', function(){
  document.getElementById('hiddenFile').click();
});
document.getElementById('hiddenFile').addEventListener('change', function(e){
  var file = (e.target.files && e.target.files[0]) ? e.target.files[0] : null; if(!file) return;
  var fr = new FileReader();
  fr.onload = function(){
    try{
      var data = JSON.parse(fr.result);
      state.products = data.products||[];
      state.currency = data.currency||state.currency;
      state.showSold = !!data.showSold;
      state.brand = data.brand||state.brand;
      state.ui = data.ui||state.ui;
      state.catalogTheme = data.catalogTheme||state.catalogTheme;
      if(state.brand){ if(!('logo' in state.brand)) state.brand.logo = null; if(typeof state.brand.showPct !== 'boolean') state.brand.showPct = true; }
      save(); render(); alert('Catálogo importado.');
    }catch(err){ alert('Archivo inválido.'); }
    e.target.value='';
  };
  fr.readAsText(file);
});

function doPrint(){ window.print(); }
document.getElementById('btnPrint').addEventListener('click', doPrint);
document.getElementById('btnPrint2').addEventListener('click', doPrint);

/* Export HTML estático con tema del catálogo */
document.getElementById('btnStatic').addEventListener('click', function(){
  var html = buildStaticHtml({
    products: state.products, currency: state.currency, brand: state.brand,
    catalogTheme: state.catalogTheme
  });
  var blob = new Blob([html], {type:'text/html'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var safeName = (state.brand.name||'marca').replace(/[^a-z0-9_-]+/gi,'-');
  a.download = 'catalogo-'+safeName+'.html';
  a.click(); URL.revokeObjectURL(a.href);
});

function buildStaticHtml(data){
  var symMap = {USD:'$',EUR:'€',SVC:'₡',MXN:'$'};
  var SYM = symMap[data.currency] || '$';
  var brandName = data.brand && data.brand.name ? data.brand.name : '';
  var brandPhone = data.brand && data.brand.phone ? data.brand.phone : '';
  var brandEmail = data.brand && data.brand.email ? data.brand.email : '';
  var brandLogo = data.brand && data.brand.logo ? data.brand.logo : '';
  var showPct = data.brand && typeof data.brand.showPct==='boolean' ? data.brand.showPct : true;
  var theme = data.catalogTheme || 'cielo';

  var esc = function(s){ return String(s||'').replace(/[&<>"']/g, function(m){ return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]); }); };
  var placeholder = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#f0f4fa"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="Segoe UI, Roboto, Arial" font-size="28">Sin imagen</text></svg>');

  var cards = '';
  for(var i=0;i<(data.products||[]).length;i++){
    var p = data.products[i]; if(p.status==='hidden') continue;
    var price = SYM + Number(p.price||0).toFixed(2);
    var oldp = (p.oldPrice!=null && p.oldPrice>p.price)? (SYM + Number(p.oldPrice||0).toFixed(2)) : '';
    var disc = (showPct && p.discountPct && p.discountPct>0)? ('<span class="discount-badge">-'+p.discountPct+'%</span>') : '';
    var ahorro = (p.discountAmt && p.discountAmt>0)? ('<span class="chip">Ahorro: '+SYM+Number(p.discountAmt).toFixed(2)+'</span>') : '';
    var statusChip = (p.status==='sold')? '<span class="chip">Vendido</span>' : '<span class="chip">Disponible</span>';
    var stockChip = (typeof p.stock==='number')? (' <span class="chip">Stock: '+p.stock+'</span>') : '';
    cards += "<article class='product'"+(p.status==='sold'?" style='opacity:.9'":'')+">"+
             (p.status==='sold'?"<div class='sold-overlay'><span>VENDIDO</span></div>":'')+
             "<img src='"+(p.image||placeholder)+"' alt='"+esc(p.name||'')+"'/>"+
             "<div class='pbody'>"+
             "<h3>"+esc(p.name||'')+"</h3>"+
             "<div class='price-line'>"+(oldp?"<span class='label-before'>Antes</span><span class='oldprice'>"+oldp+"</span>":'')+"<span class='label-now'>Ahora</span><span class='price'>"+price+"</span>"+disc+ahorro+"</div>"+
             (p.category?"<div class='muted'>"+esc(p.category)+"</div>":'')+
             (p.desc?"<div class='muted'>"+esc(String(p.desc).slice(0,120))+"</div>":'')+
             (p.sku?"<div class='muted'>#"+esc(p.sku)+"</div>":'')+
             "<div class='chips'>"+statusChip+stockChip+"</div>"+
             "</div></article>";
  }

  var chips = '';
  if(brandPhone){ chips += "<div class='chip'>📱 "+esc(brandPhone)+"</div>"; }
  if(brandEmail){ chips += "<div class='chip'>✉️ "+esc(brandEmail)+"</div>"; }
  var logoHtml = brandLogo? ("<img src='"+brandLogo+"' class='logo-preview' alt='logo' style='display:inline-block' />") : '';

  // CSS embebido (solo catálogo, con contraste de chips/badges por tema)
  var style =
'body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial;background:var(--cat-bg);color:var(--cat-text)}'+
'.wrap{max-width:1024px;margin:24px auto;padding:0 16px}'+
'.hdr{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}'+
'.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}'+
'@media (max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}'+
'@media (max-width:600px){.grid{grid-template-columns:1fr}}'+
'.product{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--cat-border);background:var(--cat-card)}'+
'.product img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#eef2f7}'+
'.pbody{padding:12px}.pbody h3{margin:0 0 6px;font-size:16px;color:var(--cat-text)}'+
'.muted{color:var(--cat-muted);font-size:12px} .price{font-weight:800;font-size:18px;color:var(--cat-text)}'+
'.price-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'+
'.oldprice{color:var(--cat-strike);text-decoration:line-through}'+
'.chip{background:var(--cat-chip-bg);color:var(--cat-chip-fg);padding:4px 8px;border-radius:999px;font-size:12px;border:1px solid var(--cat-border)}'+
'.logo-preview{width:44px;height:44px;border-radius:12px;border:1px solid var(--cat-border);background:#0a0f1f;object-fit:cover}'+
'.sold-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}'+
'.sold-overlay span{font-weight:900;font-size:38px;letter-spacing:4px;color:rgba(239,68,68,.22);transform:rotate(-18deg);border:4px solid rgba(239,68,68,.25);padding:8px 14px;border-radius:12px;backdrop-filter:blur(1px)}'+
'.label-now{color:var(--cat-brand);font-weight:800;font-size:12px}'+
'.label-before{color:var(--cat-muted);font-weight:700;font-size:12px}'+
'.discount-badge{background:var(--cat-badge-bg);color:var(--cat-badge-fg);border:1px solid var(--cat-badge-border);padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700}'+
'.hdr .chip{background:var(--cat-chip-bg);border:1px solid var(--cat-border)}'+
'@page{size:Letter;margin:10mm}'+
'@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.grid{grid-template-columns:repeat(2,1fr)}.product{break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid}.no-print{display:none!important}}'+
/* Variables por tema (solo catálogo) */
'body[data-theme="blanco"]{--cat-bg:#ffffff;--cat-card:#ffffff;--cat-text:#0f172a;--cat-muted:#475569;--cat-border:#e2e8f0;--cat-chip-bg:#eef2f7;--cat-chip-fg:#1f2937;--cat-strike:#64748b;--cat-brand:#111827;--cat-badge-bg:#e6f6ea;--cat-badge-fg:#166534;--cat-badge-border:#a7e0b6;}'+
'body[data-theme="rosado"]{--cat-bg:#fff1f5;--cat-card:#ffe4e6;--cat-text:#4a044e;--cat-muted:#6b7280;--cat-border:#fecdd3;--cat-chip-bg:#ffe1e6;--cat-chip-fg:#7a102c;--cat-strike:#9d174d;--cat-brand:#e11d48;--cat-badge-bg:#ffe6ed;--cat-badge-fg:#9d174d;--cat-badge-border:#fecdd3;}'+
'body[data-theme="lavanda"]{--cat-bg:#f5f3ff;--cat-card:#ede9fe;--cat-text:#312e81;--cat-muted:#6b7280;--cat-border:#ddd6fe;--cat-chip-bg:#ece8ff;--cat-chip-fg:#3f2b96;--cat-strike:#6d28d9;--cat-brand:#7c3aed;--cat-badge-bg:#ebe6ff;--cat-badge-fg:#5b21b6;--cat-badge-border:#ddd6fe;}'+
'body[data-theme="menta"]{--cat-bg:#ecfdf5;--cat-card:#d1fae5;--cat-text:#064e3b;--cat-muted:#4b5563;--cat-border:#a7f3d0;--cat-chip-bg:#d7f7e8;--cat-chip-fg:#065f46;--cat-strike:#047857;--cat-brand:#10b981;--cat-badge-bg:#cdeedb;--cat-badge-fg:#065f46;--cat-badge-border:#a7f3d0;}'+
'body[data-theme="cielo"]{--cat-bg:#eff6ff;--cat-card:#dbeafe;--cat-text:#0f172a;--cat-muted:#475569;--cat-border:#bfdbfe;--cat-chip-bg:#e7f1ff;--cat-chip-fg:#0f172a;--cat-strike:#1d4ed8;--cat-brand:#2563eb;--cat-badge-bg:#deebff;--cat-badge-fg:#1d4ed8;--cat-badge-border:#bfdbfe;}'+
'body[data-theme="arena"]{--cat-bg:#fff7ed;--cat-card:#ffedd5;--cat-text:#431407;--cat-muted:#6b7280;--cat-border:#fed7aa;--cat-chip-bg:#fff0dc;--cat-chip-fg:#431407;--cat-strike:#c2410c;--cat-brand:#f59e0b;--cat-badge-bg:#ffe9cc;--cat-badge-fg:#b45309;--cat-badge-border:#fed7aa;}'+
'body[data-theme="coral"]{--cat-bg:#fff1f2;--cat-card:#ffe4e6;--cat-text:#881337;--cat-muted:#6b7280;--cat-border:#fecdd3;--cat-chip-bg:#ffe1e6;--cat-chip-fg:#7a102c;--cat-strike:#be123c;--cat-brand:#fb7185;--cat-badge-bg:#ffe6ea;--cat-badge-fg:#9f1239;--cat-badge-border:#fecdd3;}'+
'body[data-theme="lima"]{--cat-bg:#f7fee7;--cat-card:#ecfccb;--cat-text:#1a2e05;--cat-muted:#4b5563;--cat-border:#d9f99d;--cat-chip-bg:#eefad1;--cat-chip-fg:#1a2e05;--cat-strike:#4d7c0f;--cat-brand:#65a30d;--cat-badge-bg:#e2f3c0;--cat-badge-fg:#3f6212;--cat-badge-border:#d9f99d;}'+
'body[data-theme="uva"]{--cat-bg:#faf5ff;--cat-card:#f3e8ff;--cat-text:#312e81;--cat-muted:#6b7280;--cat-border:#e9d5ff;--cat-chip-bg:#efe2ff;--cat-chip-fg:#3f2b96;--cat-strike:#7e22ce;--cat-brand:#9333ea;--cat-badge-bg:#ecdcff;--cat-badge-fg:#6b21a8;--cat-badge-border:#e9d5ff;}'+
'body[data-theme="pizarra"]{--cat-bg:#f1f5f9;--cat-card:#e2e8f0;--cat-text:#0f172a;--cat-muted:#475569;--cat-border:#cbd5e1;--cat-chip-bg:#e9eef4;--cat-chip-fg:#0f172a;--cat-strike:#475569;--cat-brand:#64748b;--cat-badge-bg:#dde6f0;--cat-badge-fg:#334155;--cat-badge-border:#cbd5e1;}'+
'body[data-theme="vibrante"]{--cat-bg:#0b0f1a;--cat-card:#0f172a;--cat-text:#e5e7eb;--cat-muted:#93a3b8;--cat-border:#1f2937;--cat-chip-bg:#111827;--cat-chip-fg:#e5e7eb;--cat-strike:#94a3b8;--cat-brand:#22d3ee;--cat-badge-bg:#14532d;--cat-badge-fg:#bbf7d0;--cat-badge-border:#166534;}';

  var html = ''
  + '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>'
  + '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
  + '<title>Catálogo – '+esc(brandName)+'</title>'
  + '<style>'+ style +'</style></head>'
  + '<body data-theme="'+esc(theme)+'">'
  + '<div class="wrap">'
  + '<div class="hdr">'+logoHtml+'<div style="font-size:22px;font-weight:800">'+esc(brandName)+'</div>'+chips+'</div>'
  + '<div class="grid">'+cards+'</div>'
  + '<div class="no-print" style="margin-top:12px"><button onclick="window.print()">Imprimir / PDF</button></div>'
  + '</div></body></html>';

  return html;
}

// ============== Tests mínimos ==============
function runTests(){
  var results = [];
  try{ state.currency='USD'; if(fmtPrice(10)==='$10.00'){ results.push('✔ fmtPrice USD'); } else { results.push('✘ fmtPrice USD'); } }catch(e){ results.push('✘ fmtPrice USD threw'); }
  try{ state.currency='EUR'; if(fmtPrice(10)==='€10.00'){ results.push('✔ fmtPrice EUR'); } else { results.push('✘ fmtPrice EUR'); } }catch(e){ results.push('✘ fmtPrice EUR threw'); } finally { state.currency='USD'; }
  try{
    var html = buildStaticHtml({products:[], currency:'USD', brand:{name:'X', showPct:true}, catalogTheme:'rosado'});
    if(html.indexOf('data-theme="rosado"')>-1 && html.indexOf('--cat-chip-bg')>-1){ results.push('✔ export incluye tema + contraste'); } else { results.push('✘ export tema'); }
  }catch(e){ results.push('✘ export threw'); }
  console.log('[Tests]', results.join(' | '));
  var hint = document.createElement('div'); hint.className='hint'; hint.textContent='Autotests: '+results.join(' | ');
  document.body.appendChild(hint); hint.style.position='fixed'; hint.style.left='12px'; hint.style.bottom='8px'; hint.style.opacity='0.6'; hint.classList.add('no-print');
  setTimeout(function(){ if(hint && hint.parentNode){ hint.parentNode.removeChild(hint); } }, 4000);
}

// ============== Boot ==============
load();
$('#brandName').value = state.brand.name||''; $('#brandPhone').value = state.brand.phone||''; $('#brandEmail').value = state.brand.email||'';
document.getElementById('catalogTheme').value = state.catalogTheme || 'cielo';
render();
runTests();
