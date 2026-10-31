(function () {
  'use strict';
  var config = window.KEEPLILY_SUPABASE || {};
  var client = window.supabase && config.url && config.anonKey
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;
  var $ = function (id) { return document.getElementById(id); };
  var categories = [];

  function message(id, text) { var node = $(id); if (node) node.textContent = text || ''; }
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }
  function optionList(options, selected) {
    return options.map(function (value) {
      return '<option value="'+escapeHTML(value)+'"'+(value===selected?' selected':'')+'>'+escapeHTML(value.replace(/_/g,' '))+'</option>';
    }).join('');
  }
  function money(value) { return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(value)||0); }
  function slug(value) { return String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function showLogin() { $('login-view').hidden = false; $('dashboard-view').hidden = true; }
  function showDashboard(email) { $('login-view').hidden = true; $('dashboard-view').hidden = false; $('admin-email').textContent = email || ''; loadOverview(); loadProducts(); loadOrders(); loadRequests(); loadMessages(); }

  async function requireAdmin(session) {
    if (!session) { showLogin(); return; }
    var result = await client.from('profiles').select('role,full_name').eq('id',session.user.id).single();
    if (result.error || !result.data || result.data.role !== 'admin') {
      showLogin();
      message('login-message',result.error ? 'Administrator access could not be verified. Please try again.' : 'This account does not have store administrator access.');
      return;
    }
    showDashboard(session.user.email);
  }

  async function loadOverview() {
    var queries = await Promise.all([
      client.from('products').select('id',{count:'exact',head:true}).eq('status','active'),
      client.from('orders').select('id',{count:'exact',head:true}),
      client.from('custom_gift_requests').select('id',{count:'exact',head:true}).eq('status','new')
    ]);
    $('stat-products').textContent = queries[0].error ? '—' : queries[0].count;
    $('stat-orders').textContent = queries[1].error ? '—' : queries[1].count;
    $('stat-requests').textContent = queries[2].error ? '—' : queries[2].count;
    if (queries.some(function (result) { return result.error; })) {
      message('admin-message','Some overview statistics could not be loaded. Check the Supabase schema and access policies.');
    }
  }

  async function loadCategories() {
    var result = await client.from('categories').select('id,name').eq('is_active',true).order('sort_order');
    if (result.error) throw result.error;
    categories = result.data || [];
    $('product-category').innerHTML = categories.map(function (item) { return '<option value="'+escapeHTML(item.id)+'">'+escapeHTML(item.name)+'</option>'; }).join('');
  }

  async function loadProducts() {
    var body = $('products-table');
    body.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    var result = await client.from('products').select('id,name,price,stock_quantity,status').order('created_at',{ascending:false}).limit(100);
    if (result.error) { body.innerHTML = '<tr><td colspan="4">Could not load products. Check schema setup.</td></tr>'; return; }
    body.innerHTML = (result.data||[]).map(function (p) {
      return '<tr><td><button class="table-link" type="button" data-edit-product="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+'</button></td><td>'+money(p.price)+'</td><td>'+Number(p.stock_quantity)+'</td><td>'+escapeHTML(p.status)+'</td></tr>';
    }).join('') || '<tr><td colspan="4">No products yet. Add the first one.</td></tr>';
  }

  async function loadOrders() {
    var body = $('orders-table');
    var result = await client.from('orders').select('id,order_number,guest_email,user_id,shipping_address,grand_total,payment_status,status,created_at,order_items(name_snapshot,quantity)').order('created_at',{ascending:false}).limit(100);
    if (result.error) { body.innerHTML = '<tr><td colspan="5">Could not load orders.</td></tr>'; return; }
    body.innerHTML = (result.data||[]).map(function (o) {
      var customer = (o.shipping_address || {}).full_name || o.guest_email || (o.user_id ? 'Customer' : 'Guest');
      var items = (o.order_items || []).map(function (item) { return escapeHTML(item.name_snapshot)+' × '+Number(item.quantity); }).join(', ');
      return '<tr><td>'+escapeHTML(o.order_number)+'<br><small>'+items+'</small></td><td>'+escapeHTML(customer)+'<br><small>'+escapeHTML(o.guest_email||'')+'</small></td><td>'+money(o.grand_total)+'</td><td>'+escapeHTML(o.payment_status)+'</td><td><select data-order-status="'+escapeHTML(o.id)+'">'+optionList(['pending_payment','confirmed','preparing','ready_to_ship','shipped','delivered','cancelled','refunded'],o.status)+'</select></td></tr>';
    }).join('') || '<tr><td colspan="5">No orders yet.</td></tr>';
  }

  async function loadRequests() {
    var body = $('requests-table');
    var result = await client.from('custom_gift_requests').select('id,name,email,occasion,status,created_at').order('created_at',{ascending:false}).limit(100);
    if (result.error) { body.innerHTML = '<tr><td colspan="4">Could not load requests.</td></tr>'; return; }
    body.innerHTML = (result.data||[]).map(function (r) {
      return '<tr><td>'+escapeHTML(r.name)+'</td><td>'+escapeHTML(r.email)+'</td><td>'+escapeHTML(r.occasion||'—')+'</td><td><select data-request-status="'+escapeHTML(r.id)+'">'+optionList(['new','reviewing','quoted','accepted','in_production','completed','declined'],r.status)+'</select></td></tr>';
    }).join('') || '<tr><td colspan="4">No requests yet.</td></tr>';
  }

  async function loadMessages() {
    var body = $('messages-table');
    var result = await client.from('contact_messages').select('name,email,subject,message,created_at').order('created_at',{ascending:false}).limit(100);
    if (result.error) { body.innerHTML = '<tr><td colspan="4">Could not load messages. Run the contact-messages migration first.</td></tr>'; return; }
    body.innerHTML = (result.data||[]).map(function (item) {
      var safe = escapeHTML;
      return '<tr><td>'+safe(item.name)+'<br><small>'+safe(item.email)+'</small></td><td>'+safe(item.subject)+'</td><td>'+safe(item.message)+'</td><td>'+new Date(item.created_at).toLocaleString('en-IN')+'</td></tr>';
    }).join('') || '<tr><td colspan="4">No messages yet.</td></tr>';
  }

  function openProductForm(product) {
    var form = $('product-form');
    form.hidden = false;
    form.reset();
    form.elements.id.value = product ? product.id : '';
    $('product-form-title').textContent = product ? 'Edit product' : 'Add a product';
    if (product) ['name','sku','category_id','price','sale_price','stock_quantity','short_description','description','status'].forEach(function (key) {
      if (form.elements[key]) form.elements[key].value = product[key] == null ? '' : product[key];
    });
    if (product) ['is_featured','is_bestseller','is_customisable'].forEach(function (key) { form.elements[key].checked = Boolean(product[key]); });
    form.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function saveProduct(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var id = data.get('id');
    var name = String(data.get('name')||'').trim();
    var payload = {
      name:name, slug:slug(name), sku:String(data.get('sku')||'').trim()||null,
      category_id:data.get('category_id'), price:Number(data.get('price')),
      sale_price:data.get('sale_price') === '' ? null : Number(data.get('sale_price')),
      stock_quantity:Number(data.get('stock_quantity')||0),
      short_description:String(data.get('short_description')||'').trim(),
      description:String(data.get('description')||'').trim(),
      status:data.get('status'), is_featured:data.has('is_featured'),
      is_bestseller:data.has('is_bestseller'), is_customisable:data.has('is_customisable')
    };
    message('product-message','Saving…');
    var saved = id
      ? await client.from('products').update(payload).eq('id',id).select('id').single()
      : await client.from('products').insert(payload).select('id').single();
    if (saved.error) { message('product-message',saved.error.message); return; }
    var file = data.get('image');
    if (file && file.size) {
      var path = saved.data.id+'/'+Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'-');
      var upload = await client.storage.from('product-images').upload(path,file,{upsert:false,contentType:file.type});
      if (upload.error) { message('product-message','Product saved, but image upload failed: '+upload.error.message); return; }
      var cleared = await client.from('product_images').update({is_primary:false}).eq('product_id',saved.data.id);
      if (cleared.error) { message('product-message','Product saved and image uploaded, but the existing primary image could not be updated: '+cleared.error.message); return; }
      var image = await client.from('product_images').insert({product_id:saved.data.id,storage_path:path,alt_text:name,is_primary:true});
      if (image.error) { message('product-message','Product saved, but image record failed: '+image.error.message); return; }
    }
    message('product-message','Saved successfully.');
    form.hidden = true;
    await loadProducts(); await loadOverview();
  }

  function bind() {
    $('login-form').addEventListener('submit',async function(event){
      event.preventDefault();
      if (!client) { message('login-message','Add the Supabase project URL and anon key in js/supabase-config.js first.'); return; }
      var data = new FormData(event.currentTarget);
      message('login-message','Signing in…');
      var result = await client.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});
      if (result.error) { message('login-message',result.error.message); return; }
      await requireAdmin(result.data.session);
    });
    $('signout-button').addEventListener('click',async function(){
      if(!client)return;
      var result=await client.auth.signOut();
      if(result.error)message('admin-message','Could not sign out: '+result.error.message);
    });
    $('new-product-button').addEventListener('click',function(){ openProductForm(null); });
    $('cancel-product-button').addEventListener('click',function(){ $('product-form').hidden=true; });
    $('product-form').addEventListener('submit',saveProduct);
    $('orders-table').addEventListener('change', async function(event) {
      var select = event.target.closest('[data-order-status]');
      if (!select) return;
      select.disabled = true;
      var result = await client.rpc('admin_update_order_status',{p_order_id:select.dataset.orderStatus,p_status:select.value});
      if (result.error) { message('admin-message','Order status was not updated: '+result.error.message); await loadOrders(); }
      else message('admin-message','Order status updated.');
      select.disabled = false;
    });
    $('requests-table').addEventListener('change', async function(event) {
      var select = event.target.closest('[data-request-status]');
      if (!select) return;
      select.disabled = true;
      var result = await client.from('custom_gift_requests').update({status:select.value}).eq('id',select.dataset.requestStatus);
      if (result.error) { message('admin-message','Gift request status was not updated: '+result.error.message); await loadRequests(); }
      else { message('admin-message','Gift request status updated.'); await loadOverview(); }
      select.disabled = false;
    });
    $('products-table').addEventListener('click',async function(event){
      var button=event.target.closest('[data-edit-product]'); if(!button)return;
      var result=await client.from('products').select('*').eq('id',button.dataset.editProduct).single();
      if(result.error){message('admin-message',result.error.message);return;} openProductForm(result.data);
    });
    document.querySelectorAll('[data-panel]').forEach(function(button){
      button.addEventListener('click',function(){
        document.querySelectorAll('[data-panel]').forEach(function(node){node.classList.toggle('active',node===button);});
        document.querySelectorAll('.panel').forEach(function(node){node.classList.toggle('active',node.id==='panel-'+button.dataset.panel);});
      });
    });
  }

  if (!client) {
    showLogin();
  } else {
    bind();
    client.auth.getSession().then(function(result){
      if(result.error){showLogin();message('login-message','The saved session could not be checked. Please sign in again.');return;}
      return requireAdmin(result.data.session);
    });
    client.auth.onAuthStateChange(function(event,session){
      if(!session){showLogin();return;}
      if(event==='SIGNED_IN') setTimeout(function(){requireAdmin(session);},0);
    });
    loadCategories().catch(function(error){message('admin-message','Could not load categories: '+error.message);});
  }
  if (!client) bind();
})();
