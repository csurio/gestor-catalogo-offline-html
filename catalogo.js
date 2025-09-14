// =============================
// Estado y utilidades
// =============================
var $ = function(s){ return document.querySelector(s); };
var listEl = $('#list');
var catalogEl = $('#catalog');

var state = {
  products: [],
  editingId: null,
  showSold: true,
  currency: 'USD',
  brand: { name:'', phone:'', email:'', logo:null, showPct:true },
  ui: { mode:'dark', palette:'blue' } // ← nuevo: modo claro/oscuro y paleta
};

var LS_KEY = 'offlineCatalog.v4'; // bump para preferencias de tema

function load(){
  try{
    var raw = localStorage.getItem(LS_KEY);
    if(raw){
      var data = JSON.parse(raw);
      state.products = data.products||[];
      state.currency = data.currency||'USD';
      state.showSold = !!data.showSold;
      state.brand = data.brand||{name:'',phone:'',email:'',logo:null, showPct:true};
      if(typeof state.brand.showPct !== 'boolean') state.brand.showPct = true;
      state.ui = data.ui||state.ui;
      if(!state.ui || !state.ui.mode){ state.ui = {mode:'dark', palette:'blue'}; }
    } else {
      // migraciones anteriores
      var rawOld = localStorage.getItem('offlineCatalog.v3') || localStorage.getItem('offlineCatalog.v2') || localStorage.getItem('offlineCatalog.v1');
      if(rawOld){
        var old = JSON.parse(rawOld);
        state.products = (old.products||[]).map(function(p){
          p.oldPrice = (typeof p.oldPrice==='number')? p.oldPrice: null;
          p.discountPct = (typeof p.discountPct==='number')? p.discountPct: 0;
          p.discountAmt = (typeof p.discountAmt==='number')? p.discountAmt: 0;
          p.stock = (typeof p.stock==='number')? p.stock: null;
          return p;
        });
        state.currency = old.currency||'USD';
        state.showSold = !!old.showSold;
        state.brand = old.brand||{name:'',phone:'',email:''};
        state.brand.logo = state.brand.logo||null; state.brand.showPct = (typeof state.brand.showPct==='boolean')? state.brand.showPct : true;
        state.ui = {mode:'dark', palette:'blue'};
      }
    }
  }catch(e){ console.warn('load error', e); }
}
function save(){
  localStorage.setItem(LS_KEY, JSON.stringify({
    products: state.products,
    currency: state.currency,
    showSold: state.showSold,
    brand: state.brand,
    ui: state.ui
  }));
}

function fmtPrice(n){
  var map = { USD: {symbol:'$'}, EUR:{symbol:'€'}, SVC:{symbol:'₡'}, MXN:{symbol:'$'} };
  var sym = (map[state.currency] && map[state.currency].symbol) ? map[state.currency].symbol : '$';
  var num = Number.isFinite(Number(n)) ? Number(n) : 0;
  var s = num.toFixed(2); // determinista: siempre punto y 2 decimales
  return sym + s;
}

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

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

function round2(x){ return Math.round((Number(x)||0)*100)/100; }

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

// ============== Render y helpers UI ==============
function applyUiTheme(){
  // Atributos en <body> para CSS variables
  document.body.setAttribute('data-ui', state.ui.mode==='light' ? 'light' : 'dark');
  document.body.setAttribute('data-palette', state.ui.palette || 'blue');

  // Switch modo claro
  var m = $('#uiMode');
  var on = (state.ui.mode==='light');
  m.setAttribute('data-on', String(on));
  m.setAttribute('aria-checked', String(on));

  // Selector de paleta
  var sel = $('#themePalette');
  if(sel && sel.value !== state.ui.palette){ sel.value = state.ui.palette; }
}

function render(){
  // encabezado público
  $('#vhBrand').textContent = state.brand.name||'Mi Emprendimiento';
  $('#vhPhone').textContent = state.brand.phone?('📱 '+state.brand.phone):'';
  $('#vhEmail').textContent = state.brand.email?('✉️ '+state.brand.email):'';
  $('#currency').value = state.currency;

  var toggle = $('#toggleSold');
  toggle.setAttribute('data-on', String(!!state.showSold));
  toggle.setAttribute('aria-checked', String(!!state.showSold));
  var togglePct = $('#togglePct');
  togglePct.setAttribute('data-on', String(!!state.brand.showPct));
  togglePct.setAttribute('aria-checked', String(!!state.brand.showPct));

  if(state.brand.logo){
    $('#brandLogoPreview').src = state.brand.logo; $('#vhLogo').src = state.brand.logo; $('#vhLogo').style.display='inline-block';
  } else {
    $('#brandLogoPreview').removeAttribute('src'); $('#vhLogo').style.display='none';
  }

  // Paleta y modo
  applyUiTheme();

  // Filtro + orden
  var q = (($('#search').value||'').toLowerCase());
  var sort = $('#sort').value;

  var arr = state.products.slice();
  if(q){
    arr = arr.filter(function(p){ return [p.name,p.category,p.sku].some(function(x){ return ((x||'').toLowerCase().indexOf(q) > -1); }); });
  }
  if(!state.showSold){ arr = arr.filter(function(p){ return p.status!=="sold"; }); }

  if(sort==='name'){ arr.sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); }); }
  else if(sort==='priceAsc'){ arr.sort(function(a,b){ return (a.price||0)-(b.price||0); }); }
  else if(sort==='priceDesc'){ arr.sort(function(a,b){ return (b.price||0)-(a.price||0); }); }
  else { arr.sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); }); }

  // render listas
  var htmlList = ''; for(var i=0;i<arr.length;i++){ htmlList += htmlProductCard(arr[i], true); } listEl.innerHTML = htmlList;
  var htmlGrid = ''; for(var j=0;j<arr.length;j++){ if(arr[j].status!=='hidden'){ htmlGrid += htmlProductCard(arr[j], false); } } catalogEl.innerHTML = htmlGrid;

  // wire botones dinámicos
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
  var statusChip = hidden? '<span class="chip">🙈 Oculto</span>' : (sold? '<span class="chip">🔴 Vendido</span>' : '<span class="chip">🟢 Disponible</span>');
  var stockVal = (typeof p.stock==='number')? p.stock : 0;
  var stockChip = '<span class="chip">Stock: '+stockVal+'</span>';
  var html = '';
  html += '<article class="product"'+(sold?' style="opacity:.8"':'')+'>';
  if(sold){ html += '<div class="sold-overlay"><span>VENDIDO</span></div>'; }
  html += '<img src="'+(p.image||placeholder())+'" alt="'+escapeHtml(p.name||'Producto')+'"/>';
  html += '<div class="pbody">';
  html += '<h3>'+escapeHtml(p.name||'')+'</h3>';
  html += priceLineHtml(p, state.brand.showPct);
  if(p.category){ html += '<div class="muted">'+escapeHtml(p.category)+'</div>'; }
  html += '<div class="muted">'+escapeHtml(desc)+'</div>';
  html += '<div class="chips">'+statusChip+stockChip+(p.sku?(' <span class="chip">#'+escapeHtml(p.sku)+'</span>'):'')+'</div>';
  html += '</div>';
  if(editable){
    html += '<div class="actions">';
    html += '<button class="btn btn-ghost" data-action="edit" data-id="'+p.id+'">Editar</button>';
    html += '<button class="btn btn-danger" data-action="del" data-id="'+p.id+'">Eliminar</button>';
    html += '<button class="btn btn-accent" data-action="toggleSold" data-id="'+p.id+'">'+(p.status==='sold'?'Marcar disponible':'Marcar vendido')+'</button>';
    html += '<div style="margin-left:auto; display:flex; gap:6px; align-items:center">'+
            '<span class="muted">Stock</span>'+
            '<button class="btn btn-ghost btn-sm" data-action="stockMinus" data-id="'+p.id+'">−</button>'+
            '<button class="btn btn-ghost btn-sm" data-action="stockPlus" data-id="'+p.id+'">+</button>'+
            '</div>';
    html += '</div>';
  }
  html += '</article>';
  return html;
}

// Placeholder SVG en una sola línea (seguro)
function placeholder(){
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stop-color="#0b1224"/><stop offset="100%" stop-color="#111827"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="Segoe UI, Roboto, Arial" font-size="28">Sin imagen</text></svg>'
  );
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(m){ return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]); });
}

// =============================
// Eventos de UI
// =============================
$('#brandName').addEventListener('input', function(e){ state.brand.name=e.target.value; save(); render(); });
$('#brandPhone').addEventListener('input', function(e){ state.brand.phone=e.target.value; save(); render(); });
$('#brandEmail').addEventListener('input', function(e){ state.brand.email=e.target.value; save(); render(); });
$('#currency').addEventListener('change', function(e){ state.currency=e.target.value; save(); render(); });
$('#toggleSold').addEventListener('click', function(){ state.showSold=!state.showSold; save(); render(); });
$('#togglePct').addEventListener('click', function(){ state.brand.showPct=!state.brand.showPct; save(); render(); });

// Tema: modo claro/oscuro
$('#uiMode').addEventListener('click', function(){
  state.ui.mode = (state.ui.mode==='light')? 'dark':'light';
  save(); render();
});
// Tema: paleta
$('#themePalette').addEventListener('change', function(e){
  var val = (e.target && e.target.value) ? e.target.value : 'blue';
  state.ui.palette = val; save(); render();
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

$('#btnExportJson').addEventListener('click', function(){
  var blob = new Blob([JSON.stringify({
    products: state.products, currency: state.currency, showSold: state.showSold, brand: state.brand, ui: state.ui
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
      state.products = (data.products||[]).map(function(p){
        p.oldPrice = (typeof p.oldPrice==='number')? p.oldPrice: null;
        p.discountPct = (typeof p.discountPct==='number')? p.discountPct: 0;
        p.discountAmt = (typeof p.discountAmt==='number')? p.discountAmt: 0;
        p.stock = (typeof p.stock==='number')? p.stock: null;
        return p;
      });
      state.currency = data.currency||state.currency;
      state.showSold = !!data.showSold;
      state.brand = data.brand||state.brand;
      state.ui = data.ui||state.ui;
      if(state.brand){ if(!('logo' in state.brand)) state.brand.logo = null; if(typeof state.brand.showPct !== 'boolean') state.brand.showPct = true; }
      if(!state.ui || !state.ui.mode){ state.ui = {mode:'dark', palette:'blue'}; }
      save(); render(); alert('Catálogo importado.');
    }catch(err){ alert('Archivo inválido.'); }
    e.target.value='';
  };
  fr.readAsText(file);
});

function doPrint(){ window.print(); }
document.getElementById('btnPrint').addEventListener('click', doPrint);
document.getElementById('btnPrint2').addEventListener('click', doPrint);

// Exportar HTML estático consolidado (sin <script>)
document.getElementById('btnStatic').addEventListener('click', function(){
  var html = buildStaticHtml({ products: state.products, currency: state.currency, brand: state.brand, ui: state.ui });
  var blob = new Blob([html], {type:'text/html'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var safeName = (state.brand.name||'marca').replace(/[^a-z0-9_-]+/gi,'-');
  a.download = 'catalogo-'+safeName+'.html';
  a.click(); URL.revokeObjectURL(a.href);
});

// =============================
// Export estático con tema
// =============================
function buildStaticHtml(data){
  var symMap = {USD:'$',EUR:'€',SVC:'₡',MXN:'$'};
  var SYM = symMap[data.currency] || '$';
  var brandName = data.brand && data.brand.name ? data.brand.name : '';
  var brandPhone = data.brand && data.brand.phone ? data.brand.phone : '';
  var brandEmail = data.brand && data.brand.email ? data.brand.email : '';
  var brandLogo = data.brand && data.brand.logo ? data.brand.logo : '';
  var showPct = data.brand && typeof data.brand.showPct==='boolean' ? data.brand.showPct : true;

  var uiMode = (data.ui && data.ui.mode) ? data.ui.mode : 'dark';
  var palette = (data.ui && data.ui.palette) ? data.ui.palette : 'blue';

  var esc = function(s){ return String(s||'').replace(/[&<>"']/g, function(m){ return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]); }); };
  var placeholder = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#0b1224"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="Segoe UI, Roboto, Arial" font-size="28">Sin imagen</text></svg>');

  var cards = '';
  for(var i=0;i<(data.products||[]).length;i++){
    var p = data.products[i]; if(p.status==='hidden') continue;
    var price = SYM + Number(p.price||0).toFixed(2);
    var oldp = (p.oldPrice!=null && p.oldPrice>p.price)? (SYM + Number(p.oldPrice||0).toFixed(2)) : '';
    var disc = (showPct && p.discountPct && p.discountPct>0)? ('<span class="discount-badge">-'+p.discountPct+'%</span>') : '';
    var ahorro = (p.discountAmt && p.discountAmt>0)? ('<span class="chip">Ahorro: '+SYM+Number(p.discountAmt).toFixed(2)+'</span>') : '';
    var statusChip = (p.status==='sold')? '<span class="chip">🔴 Vendido</span>' : '<span class="chip">🟢 Disponible</span>';
    var stockChip = (typeof p.stock==='number')? (' <span class="chip">Stock: '+p.stock+'</span>') : '';
    cards += "<article class='product'"+(p.status==='sold'?" style='opacity:.8'":'')+">"+
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

  // CSS embebido con mismas variables/temas que la app
  var style = ''
+ ':root{--bg:#0f172a;--panel:#111827;--card:#0b1224;--text:#e5e7eb;--muted:#93a3b8;--border:#1f2937;--chip:#1e293b;--strike:#94a3b8;--brand:#3b82f6;--accent:#60a5fa;--danger:#ef4444;}'
+ 'body[data-ui="light"]{--bg:#f5f7fb;--panel:#ffffff;--card:#ffffff;--text:#0f172a;--muted:#475569;--border:#e2e8f0;--chip:#eef2f7;--strike:#64748b;}'
+ 'body[data-palette="blue"]{--brand:#3b82f6;--accent:#60a5fa;}'
+ 'body[data-palette="green"]{--brand:#22c55e;--accent:#34d399;}'
+ 'body[data-palette="teal"]{--brand:#14b8a6;--accent:#2dd4bf;}'
+ 'body[data-palette="purple"]{--brand:#a78bfa;--accent:#c4b5fd;}'
+ 'body[data-palette="amber"]{--brand:#f59e0b;--accent:#fbbf24;}'
+ 'body[data-palette="coral"]{--brand:#fb7185;--accent:#fda4af;}'
+ 'body[data-palette="slate"]{--brand:#64748b;--accent:#94a3b8;}'
+ 'body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial;background:linear-gradient(180deg,var(--bg),#050816);color:var(--text)}'
+ '.wrap{max-width:1024px;margin:24px auto;padding:0 16px}'
+ '.hdr{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}'
+ '.chip{background:var(--chip);border:1px solid var(--border);padding:6px 10px;border-radius:999px;font-size:12px;color:color-mix(in oklab,var(--text) 85%,#cbd5e1 15%)}'
+ '.logo-preview{width:44px;height:44px;border-radius:12px;border:1px solid var(--border);background:#0a0f1f;object-fit:cover}'
+ '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}'
+ '@media (max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}'
+ '@media (max-width:600px){.grid{grid-template-columns:1fr}}'
+ '.product{position:relative;background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden}'
+ '.product img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#0a0f1f}'
+ '.sold-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}'
+ '.sold-overlay span{font-weight:900;font-size:38px;letter-spacing:4px;color:rgba(239,68,68,.22);transform:rotate(-18deg);border:4px solid rgba(239,68,68,.25);padding:8px 14px;border-radius:12px;backdrop-filter:blur(1px)}'
+ '.pbody{padding:12px}.pbody h3{margin:0 0 6px;font-size:16px}'
+ '.muted{color:var(--muted);font-size:12px}.price{font-weight:800;font-size:18px}'
+ '.price-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
+ '.label-before{color:var(--muted);font-weight:700;font-size:12px}'
+ '.label-now{color:color-mix(in oklab,var(--brand) 85%,white 15%);font-weight:800;font-size:12px}'
+ '.oldprice{color:var(--strike);text-decoration:line-through}'
+ '.discount-badge{background:color-mix(in oklab,var(--brand) 35%,black 65%);color:color-mix(in oklab,var(--brand) 95%,white 5%);border:1px solid color-mix(in oklab,var(--brand) 55%,black 45%);padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700}'
+ '@page{size:Letter;margin:10mm}'
+ '@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.grid{grid-template-columns:repeat(2,1fr)}.product{break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid}.no-print{display:none!important}}';

  var html = ''
  + '<!DOCTYPE html><html lang="es" data-palette="'+esc(palette)+'"><head><meta charset="utf-8"/>'
  + '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
  + '<title>Catálogo – '+esc(brandName)+'</title>'
  + '<style>'+ style +'</style></head>'
  + '<body data-ui="'+esc(uiMode)+'" data-palette="'+esc(palette)+'">'
  + '<div class="wrap">'
  + '<div class="hdr">'+logoHtml+'<div style="font-size:22px;font-weight:800">'+esc(brandName)+'</div>'+chips+'</div>'
  + '<div class="grid">'+cards+'</div>'
  + '<div class="no-print" style="margin-top:12px"><button onclick="window.print()">Imprimir / PDF</button></div>'
  + '</div></body></html>';

  return html;
}

// =============================
// Mini test suite (no intrusivo)
// =============================
function runTests(){
  var results = [];
  try{ state.currency='USD'; if(fmtPrice(10)==='$10.00'){ results.push('✔ fmtPrice USD'); } else { results.push('✘ fmtPrice USD'); } }catch(e){ results.push('✘ fmtPrice USD threw'); }
  try{ state.currency='EUR'; if(fmtPrice(10)==='€10.00'){ results.push('✔ fmtPrice EUR'); } else { results.push('✘ fmtPrice EUR'); } }catch(e){ results.push('✘ fmtPrice EUR threw'); } finally { state.currency='USD'; }
  try{ var pp = normalizePricing(80, 100, null, null); if(pp.oldPrice===100 && pp.discountPct===20 && Math.abs(pp.discountAmt-20)<0.01){ results.push('✔ old+now -> % & amt'); } else { results.push('✘ old+now'); } }catch(e){ results.push('✘ old+now threw'); }
  try{ var pp2 = normalizePricing(80, null, 20, null); if(pp2.oldPrice && Math.abs(pp2.oldPrice-100)<0.01 && pp2.discountPct===20){ results.push('✔ now+% -> old'); } else { results.push('✘ now+%'); } }catch(e){ results.push('✘ now+% threw'); }
  try{ var pp3 = normalizePricing(80, null, null, 20); if(pp3.oldPrice===100 && pp3.discountPct===20 && Math.abs(pp3.discountAmt-20)<0.01){ results.push('✔ now+amt -> old & %'); } else { results.push('✘ now+amt'); } }catch(e){ results.push('✘ now+amt threw'); }
  try{ if(/^data:image\/svg\+xml/.test(placeholder())){ results.push('✔ placeholder data URL'); } else { results.push('✘ placeholder'); } }catch(e){ results.push('✘ placeholder threw'); }
  try{
    var html = buildStaticHtml({products:[], currency:'USD', brand:{name:'X', showPct:true}, ui:{mode:'light', palette:'green'}});
    if(html.indexOf('@page{size:Letter;margin:10mm}')>-1 && html.indexOf('data-ui="light"')>-1 && html.indexOf('data-palette="green"')>-1){
      results.push('✔ buildStaticHtml Carta + tema');
    } else { results.push('✘ buildStaticHtml tema'); }
  }catch(e){ results.push('✘ export threw'); }
  console.log('[Tests]', results.join(' | '));
  var hint = document.createElement('div'); hint.className='hint'; hint.textContent='Autotests: '+results.join(' | ');
  document.body.appendChild(hint); hint.style.position='fixed'; hint.style.left='12px'; hint.style.bottom='8px'; hint.style.opacity='0.6'; hint.classList.add('no-print');
  setTimeout(function(){ if(hint && hint.parentNode){ hint.parentNode.removeChild(hint); } }, 4000);
}

// Boot
load();
$('#brandName').value = state.brand.name||''; $('#brandPhone').value = state.brand.phone||''; $('#brandEmail').value = state.brand.email||'';
render();
runTests();
