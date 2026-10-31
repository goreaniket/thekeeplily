(function () {
  'use strict';
  var config = window.KEEPLILY_SUPABASE || {};
  var client = window.supabase && config.url && config.anonKey
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;
  var $ = function (id) { return document.getElementById(id); };
  var categories = [];
  var orders = [];
  var customers = [];
  var subscribers = [];
  var shipments = [];

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
  async function fetchAllRows(buildQuery) {
    var rows = [];
    for (var offset = 0; ; offset += 1000) {
      var result = await buildQuery().range(offset,offset+999);
      if (result.error) throw result.error;
      rows = rows.concat(result.data || []);
      if (!result.data || result.data.length < 1000) return rows;
    }
  }
  function showLogin() { $('login-view').hidden = false; $('dashboard-view').hidden = true; }
  function showDashboard(email) {
    $('login-view').hidden = true;
    $('dashboard-view').hidden = false;
    $('admin-email').textContent = email || '';
    Promise.all([
      loadOverview(),loadCategories(),loadProducts(),loadOrders(),loadRequests(),
      loadMessages(),loadCustomers(),loadPayments(),loadShipments(),loadNewsletter(),loadSettings()
    ]).catch(function(error){
      message('admin-message','Some dashboard data could not be loaded: '+(error.message||'Unexpected error.'));
    });
  }

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
    var result = await client.rpc('admin_dashboard_overview');
    if (result.error || !result.data) {
      ['stat-revenue','stat-orders','stat-pending','stat-processing','stat-shipped','stat-delivered',
        'stat-cancelled','stat-customers','stat-products','stat-low-stock','stat-requests',
        'stat-messages','stat-newsletter'].forEach(function(id){$(id).textContent='—';});
      message('admin-message','Dashboard metrics could not be verified: '+(result.error && result.error.message||'No metrics were returned.'));
      return;
    }
    var overview = result.data;
    var counts = {
      'stat-revenue': overview.paid_revenue,
      'stat-orders': overview.total_orders,
      'stat-pending': overview.pending_orders,
      'stat-processing': overview.processing_orders,
      'stat-shipped': overview.shipped_orders,
      'stat-delivered': overview.delivered_orders,
      'stat-cancelled': overview.cancelled_refunded_orders,
      'stat-customers': overview.total_customers,
      'stat-products': overview.active_products,
      'stat-low-stock': overview.low_stock_products,
      'stat-requests': overview.new_gift_requests,
      'stat-messages': overview.new_contact_messages,
      'stat-newsletter': overview.active_newsletter_subscribers
    };
    Object.keys(counts).forEach(function (id) {
      var node = $(id);
      if (!node) return;
      var value = counts[id];
      node.textContent = value === null ? '—' : id === 'stat-revenue' ? money(value) : String(value);
    });
    $('stat-low-stock').title = overview.low_stock_threshold === null
      ? 'Configure the low_stock_threshold store setting to count low-stock products.'
      : 'Based on the configured low_stock_threshold setting.';
  }

  async function loadCategories() {
    var result = await client.from('categories').select('id,name,slug,is_active,sort_order').order('sort_order');
    if (result.error) throw result.error;
    categories = result.data || [];
    $('product-category').innerHTML = categories.filter(function(item){return item.is_active;}).map(function (item) { return '<option value="'+escapeHTML(item.id)+'">'+escapeHTML(item.name)+'</option>'; }).join('');
    $('categories-table').innerHTML = categories.map(function(item){
      return '<tr><td>'+escapeHTML(item.name)+'<br><small>'+escapeHTML(item.slug)+'</small></td><td>'+ (item.is_active?'Active':'Inactive')+'</td><td><button class="table-link" type="button" data-category-status="'+escapeHTML(item.id)+'" data-active="'+String(item.is_active)+'">'+(item.is_active?'Deactivate':'Activate')+'</button></td></tr>';
    }).join('') || '<tr><td colspan="3">No categories yet.</td></tr>';
    if (!categories.length) message('product-message','Add a category before creating products.');
  }

  async function loadProducts() {
    var body = $('products-table');
    body.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    var result;
    try {
      result = await fetchAllRows(function () {
        return client.from('products').select('id,name,price,stock_quantity,status,is_new_arrival').order('created_at',{ascending:false});
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="4">Could not load products: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    body.innerHTML = result.map(function (p) {
      return '<tr><td><button class="table-link" type="button" data-edit-product="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+'</button></td><td>'+money(p.price)+'</td><td>'+Number(p.stock_quantity)+'</td><td>'+escapeHTML(p.status)+'</td></tr>';
    }).join('') || '<tr><td colspan="4">No products yet. Add the first one.</td></tr>';
  }

  async function loadOrders() {
    var body = $('orders-table');
    try {
      orders = await fetchAllRows(function () {
        return client.from('orders').select('id,order_number,guest_email,guest_phone,user_id,billing_address,shipping_address,subtotal,discount_total,shipping_total,tax_total,grand_total,currency,payment_status,status,created_at,admin_notes,invoice_number,invoice_storage_path,order_items(name_snapshot,quantity,variant_snapshot,personalisation,gift_message,unit_price,line_total),payments(provider,amount,currency,status,provider_order_id,provider_payment_id,paid_at),shipments(provider,awb_number,tracking_url,status)').order('created_at',{ascending:false});
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="6">Could not load orders: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    renderOrders();
  }

  function renderOrders() {
    var body = $('orders-table');
    var query = String($('order-search').value || '').trim().toLowerCase();
    var from = $('order-from').value;
    var to = $('order-to').value;
    var paymentFilter = $('order-payment-filter').value;
    var statusFilter = $('order-status-filter').value;
    var filtered = orders.filter(function (order) {
      var address = order.shipping_address || {};
      var haystack = [order.order_number,order.guest_email,order.guest_phone,address.full_name,address.phone]
        .join(' ').toLowerCase();
      var day = String(order.created_at || '').slice(0,10);
      return (!query || haystack.indexOf(query) >= 0) &&
        (!from || day >= from) && (!to || day <= to) &&
        (!paymentFilter || order.payment_status === paymentFilter) &&
        (!statusFilter || order.status === statusFilter);
    });
    body.innerHTML = filtered.map(function (order) {
      var customer = (order.shipping_address || {}).full_name || order.guest_email || 'Customer';
      var items = (order.order_items || []).map(function (item) {
        return escapeHTML(item.name_snapshot)+' × '+Number(item.quantity);
      }).join(', ');
      return '<tr><td>'+escapeHTML(order.order_number)+'<br><small>'+items+'</small></td><td>'+escapeHTML(customer)+'<br><small>'+escapeHTML(order.guest_email||order.guest_phone||'')+'</small></td><td>'+money(order.grand_total)+'</td><td>'+escapeHTML(order.payment_status)+'</td><td><select data-order-status="'+escapeHTML(order.id)+'">'+optionList(['pending_payment','payment_review','confirmed','preparing','ready_to_ship','shipped','delivered','cancelled','refunded'],order.status)+'</select></td><td><button class="table-link" type="button" data-order-details="'+escapeHTML(order.id)+'">View</button></td></tr>';
    }).join('') || '<tr><td colspan="6">'+(orders.length ? 'No orders match these filters.' : 'No orders yet.')+'</td></tr>';
  }

  function appendDetail(parent, label, value) {
    var row = document.createElement('p');
    var title = document.createElement('strong');
    title.textContent = label + ': ';
    row.append(title, document.createTextNode(value == null || value === '' ? '—' : String(value)));
    parent.appendChild(row);
  }

  function appendAddress(parent, title, address) {
    var section = document.createElement('section');
    var heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    var fields = ['full_name','phone','address_line_1','address_line_2','landmark','city','state','postal_code','country'];
    appendDetail(section, title, fields.map(function (field) { return address && address[field]; }).filter(Boolean).join(' · '));
    parent.appendChild(section);
  }

  function showOrderDetails(id) {
    var order = orders.find(function (item) { return item.id === id; });
    if (!order) return;
    var container = $('order-details-content');
    container.replaceChildren();
    appendDetail(container,'Order',order.order_number);
    appendDetail(container,'Created',new Date(order.created_at).toLocaleString('en-IN'));
    appendDetail(container,'Customer email',order.guest_email);
    appendDetail(container,'Customer phone',order.guest_phone);
    appendAddress(container,'Billing address',order.billing_address);
    appendAddress(container,'Shipping address',order.shipping_address);
    appendDetail(container,'Totals','Subtotal '+money(order.subtotal)+' · Discount '+money(order.discount_total)+' · Shipping '+money(order.shipping_total)+' · Tax '+money(order.tax_total)+' · Total '+money(order.grand_total)+' '+order.currency);
    (order.order_items || []).forEach(function (item) {
      appendDetail(container,'Item',item.name_snapshot+' × '+item.quantity+' · Variant: '+(item.variant_snapshot||'—')+' · Personalisation: '+(item.personalisation||'—')+' · Gift message: '+(item.gift_message||'—')+' · '+money(item.line_total));
    });
    (order.payments || []).forEach(function (payment) {
      appendDetail(container,'Payment',payment.provider+' · '+payment.status+' · '+money(payment.amount)+' '+payment.currency+' · Razorpay order '+(payment.provider_order_id||'—')+' · Transaction '+(payment.provider_payment_id||'—')+' · Paid '+(payment.paid_at||'—'));
    });
    (order.shipments || []).forEach(function (shipment) {
      appendDetail(container,'Shipment',shipment.provider+' · '+shipment.status+' · AWB '+(shipment.awb_number||'—')+' · '+(shipment.tracking_url||''));
    });
    appendDetail(container,'Invoice',order.invoice_number||order.invoice_storage_path||'Not issued');
    $('order-admin-notes').value = order.admin_notes || '';
    $('save-order-notes').dataset.orderId = order.id;
    $('order-details').hidden = false;
  }

  async function loadCustomers() {
    var body = $('customers-table');
    try {
      customers = await fetchAllRows(function () {
        return client.from('customers')
          .select('user_id,email,profiles(full_name,phone)')
          .order('created_at',{ascending:false});
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="5">Could not load customers: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    var ids = customers.map(function (customer) { return customer.user_id; }).filter(Boolean);
    var paidOrders=[];
    try {
      for(var batchStart=0;batchStart<ids.length;batchStart+=100){
        var batch=ids.slice(batchStart,batchStart+100);
        var batchRows=await fetchAllRows(function () {
          return client.from('orders').select('user_id,grand_total,payment_status')
            .in('user_id',batch).eq('payment_status','paid');
        });
        paidOrders=paidOrders.concat(batchRows);
      }
    } catch (error) {
      body.innerHTML = '<tr><td colspan="5">Customer records loaded, but paid order totals could not be verified: '+escapeHTML(error.message)+'</td></tr>';
      message('admin-message','Customer spending was not shown because paid order records could not be loaded.');
      return;
    }
    customers.forEach(function (customer) {
      var customerOrders = paidOrders.filter(function (order) { return order.user_id === customer.user_id; });
      customer.paidOrderCount = customerOrders.length;
      customer.paidSpend = customerOrders.reduce(function (sum, order) { return sum + Number(order.grand_total || 0); }, 0);
    });
    renderCustomers();
  }

  function renderCustomers() {
    var query = String($('customer-search').value || '').trim().toLowerCase();
    var rows = customers.filter(function (customer) {
      var profile = customer.profiles || {};
      return [profile.full_name,customer.email,profile.phone].join(' ').toLowerCase().indexOf(query) >= 0;
    });
    $('customers-table').innerHTML = rows.map(function (customer) {
      var profile = customer.profiles || {};
      return '<tr><td><button class="table-link" type="button" data-view-customer="'+escapeHTML(customer.user_id)+'">'+escapeHTML(profile.full_name||'—')+'</button></td><td>'+escapeHTML(customer.email)+'</td><td>'+escapeHTML(profile.phone||'—')+'</td><td>'+Number(customer.paidOrderCount||0)+'</td><td>'+money(customer.paidSpend||0)+'</td></tr>';
    }).join('') || '<tr><td colspan="5">No customers match this search.</td></tr>';
  }

  async function showCustomerDetails(userId) {
    var section = $('customer-details');
    var content = $('customer-details-content');
    section.hidden = false;
    content.textContent = 'Loading customer profile and order history…';
    try {
      var customer = customers.find(function (item) { return item.user_id === userId; });
      var result = await client.from('orders')
        .select('id,order_number,status,payment_status,grand_total,currency,created_at,order_items(name_snapshot,quantity,variant_snapshot)')
        .eq('user_id', userId)
        .order('created_at', {ascending:false});
      if (result.error) throw result.error;
      var profile = customer && customer.profiles || {};
      var contentParts = [
        '<p><strong>'+escapeHTML(profile.full_name || 'Customer')+'</strong></p>',
        '<p>'+escapeHTML(customer && customer.email || '—')+' · '+escapeHTML(profile.phone || '—')+'</p>',
        '<h3>Order history</h3>'
      ];
      var history = result.data || [];
      if (history.length) {
        contentParts.push('<div class="table-wrap"><table><thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>Items</th><th>Total</th><th>Placed</th></tr></thead><tbody>');
        history.forEach(function (order) {
          var items = (order.order_items || []).map(function (item) {
            return (item.name_snapshot || 'Item')+' × '+Number(item.quantity)+(item.variant_snapshot ? ' ('+item.variant_snapshot+')' : '');
          }).join(', ');
          contentParts.push('<tr><td>'+escapeHTML(order.order_number || order.id)+'</td><td>'+escapeHTML(order.status)+'</td><td>'+escapeHTML(order.payment_status)+'</td><td>'+escapeHTML(items || '—')+'</td><td>'+money(order.grand_total)+' '+escapeHTML(order.currency || '')+'</td><td>'+escapeHTML(order.created_at)+'</td></tr>');
        });
        contentParts.push('</tbody></table></div>');
      } else {
        contentParts.push('<p>No orders found.</p>');
      }
      content.innerHTML = contentParts.join('');
      section.scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) {
      content.textContent = 'Could not load customer details: '+error.message;
    }
  }

  async function loadPayments() {
    var body = $('payments-table');
    var result;
    try {
      result = await fetchAllRows(function () {
        return client.from('payments')
          .select('provider,amount,currency,status,provider_order_id,provider_payment_id,paid_at,orders(order_number)')
          .order('created_at',{ascending:false});
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="7">Could not load payment records: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    body.innerHTML = result.map(function (payment) {
      var order = Array.isArray(payment.orders) ? payment.orders[0] : payment.orders;
      return '<tr><td>'+escapeHTML(order && order.order_number||'—')+'</td><td>'+escapeHTML(payment.provider)+'</td><td>'+money(payment.amount)+' '+escapeHTML(payment.currency)+'</td><td>'+escapeHTML(payment.status)+'</td><td>'+escapeHTML(payment.provider_order_id||'—')+'</td><td>'+escapeHTML(payment.provider_payment_id||'—')+'</td><td>'+escapeHTML(payment.paid_at||'—')+'</td></tr>';
    }).join('') || '<tr><td colspan="7">No payment records yet.</td></tr>';
  }

  async function loadShipments() {
    var body = $('shipments-table');
    var result;
    try {
      shipments = await fetchAllRows(function () {
        return client.from('shipments')
          .select('id,provider,provider_shipment_id,awb_number,status,tracking_url,shipped_at,delivered_at,orders(order_number)')
          .order('created_at',{ascending:false});
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="5">Could not load shipments: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    body.innerHTML = shipments.map(function (shipment) {
      var order = Array.isArray(shipment.orders) ? shipment.orders[0] : shipment.orders;
      return '<tr><td>'+escapeHTML(order && order.order_number||'—')+'</td><td>'+escapeHTML(shipment.provider)+'</td><td><select data-shipment-status="'+escapeHTML(shipment.id)+'">'+optionList(['pending','ready_to_ship','pickup_scheduled','picked_up','in_transit','out_for_delivery','delivered','exception','rto_initiated','rto_delivered','cancelled'],shipment.status)+'</select></td><td><label class="sr-only">AWB number<input data-shipment-awb="'+escapeHTML(shipment.id)+'" value="'+escapeHTML(shipment.awb_number||'')+'" maxlength="120" placeholder="AWB number"></label><label class="sr-only">Tracking URL<input data-shipment-url="'+escapeHTML(shipment.id)+'" type="url" value="'+escapeHTML(shipment.tracking_url||'')+'" maxlength="1000" placeholder="https://tracking URL"></label></td><td><button class="table-link" type="button" data-save-shipment="'+escapeHTML(shipment.id)+'">Save</button></td></tr>';
    }).join('') || '<tr><td colspan="5">No shipment records yet.</td></tr>';
  }

  async function loadNewsletter() {
    try {
      subscribers = await fetchAllRows(function () {
        return client.from('newsletter_subscribers')
          .select('email,is_active,created_at')
          .order('created_at',{ascending:false});
      });
    } catch (error) {
      $('newsletter-table').innerHTML = '<tr><td colspan="3">Could not load subscribers: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    renderNewsletter();
  }

  function renderNewsletter() {
    var query = String($('newsletter-search').value || '').trim().toLowerCase();
    var activeFilter = $('newsletter-filter').value;
    var rows = subscribers.filter(function (subscriber) {
      return subscriber.email.toLowerCase().indexOf(query) >= 0 &&
        (!activeFilter || String(subscriber.is_active) === activeFilter);
    });
    $('newsletter-table').innerHTML = rows.map(function (subscriber) {
      return '<tr><td>'+escapeHTML(subscriber.email)+'</td><td><select data-subscriber-status="'+escapeHTML(subscriber.email)+'"><option value="true"'+(subscriber.is_active?' selected':'')+'>Active</option><option value="false"'+(!subscriber.is_active?' selected':'')+'>Inactive</option></select></td><td>'+escapeHTML(subscriber.created_at)+'</td></tr>';
    }).join('') || '<tr><td colspan="3">No subscribers match this filter.</td></tr>';
  }

  async function loadSettings() {
    var body = $('settings-table');
    var result = await client.from('store_settings').select('key,value,updated_at').order('key');
    if (result.error) {
      body.innerHTML = '<tr><td colspan="3">Could not load settings: '+escapeHTML(result.error.message)+'</td></tr>';
      return;
    }
    var settings = {};
    (result.data || []).forEach(function (setting) { settings[setting.key] = setting.value; });
    var form = $('store-settings-form');
    function setValue(name, value) { form.elements[name].value = value == null ? '' : String(value); }
    setValue('store_name', settings.store_name);
    setValue('store_contact_email', settings.store_contact_email);
    setValue('store_contact_phone', settings.store_contact_phone);
    setValue('store_contact_address', settings.store_contact_address);
    setValue('notification_email', settings.notification_email);
    setValue('store_status', ['active','paused'].indexOf(settings.store_status) >= 0 ? settings.store_status : 'unconfigured');
    form.elements.owner_notifications_enabled.checked = settings.owner_notifications_enabled === true;
    var shipping = settings.shipping_config && typeof settings.shipping_config === 'object' ? settings.shipping_config : {};
    setValue('shipping_mode', shipping.mode === 'flat_rate' ? 'flat_rate' : 'unconfigured');
    setValue('shipping_amount', shipping.amount);
    var tax = settings.tax_config && typeof settings.tax_config === 'object' ? settings.tax_config : {};
    setValue('tax_mode', ['inclusive','exclusive'].indexOf(tax.mode) >= 0 ? tax.mode : 'unconfigured');
    setValue('tax_rate', tax.rate);
    var safeSettings = (result.data || []).filter(function (setting) {
      return !/(secret|password|token|service.?role|private.?key)/i.test(setting.key);
    });
    body.innerHTML = safeSettings.map(function (setting) {
      var value;
      try { value = JSON.stringify(setting.value); } catch (error) { value = '[unavailable]'; }
      return '<tr><td>'+escapeHTML(setting.key)+'</td><td>'+escapeHTML(value)+'</td><td>'+escapeHTML(setting.updated_at)+'</td></tr>';
    }).join('') || '<tr><td colspan="3">No non-secret settings are configured.</td></tr>';
  }

  async function saveStoreSettings(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var shippingMode = String(data.get('shipping_mode') || 'unconfigured');
    var shippingAmount = String(data.get('shipping_amount') || '').trim();
    var taxMode = String(data.get('tax_mode') || 'unconfigured');
    var taxRate = String(data.get('tax_rate') || '').trim();
    var amount = shippingAmount === '' ? null : Number(shippingAmount);
    var rate = taxRate === '' ? null : Number(taxRate);
    if ((shippingMode === 'flat_rate' && (amount === null || !Number.isFinite(amount) || amount < 0)) ||
        (taxMode !== 'unconfigured' && (rate === null || !Number.isFinite(rate) || rate < 0 || rate > 100)) ||
        (taxMode === 'unconfigured' && rate !== null)) {
      message('settings-message','Choose a valid shipping amount and tax treatment/rate. Saving these values will not enable checkout.');
      return;
    }
    var payload = {
      store_name:String(data.get('store_name') || '').trim() || null,
      store_contact_email:String(data.get('store_contact_email') || '').trim().toLowerCase() || null,
      store_contact_phone:String(data.get('store_contact_phone') || '').trim() || null,
      store_contact_address:String(data.get('store_contact_address') || '').trim() || null,
      notification_email:String(data.get('notification_email') || '').trim().toLowerCase() || null,
      owner_notifications_enabled:data.has('owner_notifications_enabled'),
      store_status:String(data.get('store_status') || 'unconfigured'),
      shipping_config:{mode:shippingMode,amount:shippingMode === 'flat_rate' ? amount : null},
      tax_config:{mode:taxMode,rate:taxMode === 'unconfigured' ? null : rate}
    };
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message('settings-message','Saving settings…');
    try {
      var result = await client.rpc('admin_update_store_settings',{p_settings:payload});
      if (result.error) throw result.error;
      message('settings-message','Store settings saved. Checkout remains subject to the separate pricing approval gate.');
      await loadSettings();
    } catch (error) {
      message('settings-message','Store settings were not saved: '+error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function loadRequests() {
    var body = $('requests-table');
    var result;
    try {
      result = await fetchAllRows(function () {
        return client.from('custom_gift_requests').select('id,name,email,phone,occasion,gift_type,budget_min,budget_max,required_by,quantity,preferred_colours,description,gift_message,reference_storage_paths,status,admin_notes,quoted_amount,quote_notes,created_at').order('created_at',{ascending:false});
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="4">Could not load requests: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    body.innerHTML = result.map(function (r) {
      var detail = [r.gift_type,'Quantity '+r.quantity,'Budget '+(r.budget_min==null?'—':money(r.budget_min))+'–'+(r.budget_max==null?'—':money(r.budget_max)),'Required '+(r.required_by||'—'),r.preferred_colours,r.description,r.gift_message].filter(Boolean).join(' · ');
      var paths = Array.isArray(r.reference_storage_paths) ? r.reference_storage_paths : [];
      var referenceButton = paths.length
        ? '<button class="table-link" type="button" data-view-request-references="'+escapeHTML(JSON.stringify(paths))+'">View reference images ('+paths.length+')</button><span data-request-reference-links="'+escapeHTML(r.id)+'"></span>'
        : '';
      return '<tr><td>'+escapeHTML(r.name)+'<br><small>'+escapeHTML(detail)+'</small><br>'+referenceButton+'</td><td>'+escapeHTML(r.email)+'<br><small>'+escapeHTML(r.phone||'')+'</small></td><td>'+escapeHTML(r.occasion||'—')+'</td><td><select data-request-status="'+escapeHTML(r.id)+'">'+optionList(['new','reviewing','quoted','accepted','in_production','completed','declined'],r.status)+'</select><label>Quote (₹)<input data-request-quote="'+escapeHTML(r.id)+'" type="number" min="0" step="0.01" value="'+escapeHTML(r.quoted_amount==null?'':r.quoted_amount)+'"></label><label>Quote notes<textarea data-request-quote-notes="'+escapeHTML(r.id)+'" maxlength="2000">'+escapeHTML(r.quote_notes||'')+'</textarea></label><label>Internal notes<textarea data-request-notes="'+escapeHTML(r.id)+'" maxlength="5000">'+escapeHTML(r.admin_notes||'')+'</textarea></label><button class="table-link" type="button" data-save-request="'+escapeHTML(r.id)+'">Save request</button></td></tr>';
    }).join('') || '<tr><td colspan="4">No requests yet.</td></tr>';
  }

  async function loadMessages() {
    var body = $('messages-table');
    var result;
    try {
      result = await fetchAllRows(function () {
        return client.from('contact_messages').select('id,name,email,subject,message,status,admin_notes,created_at').order('created_at',{ascending:false});
      });
    } catch (error) {
      body.innerHTML = '<tr><td colspan="5">Could not load messages: '+escapeHTML(error.message)+'</td></tr>';
      return;
    }
    body.innerHTML = result.map(function (item) {
      var safe = escapeHTML;
      return '<tr><td>'+safe(item.name)+'<br><small>'+safe(item.email)+'</small></td><td>'+safe(item.subject)+'</td><td>'+safe(item.message)+'</td><td><select data-message-status="'+safe(item.id)+'">'+optionList(['new','read','replied','archived'],item.status)+'</select><textarea data-message-notes="'+safe(item.id)+'" maxlength="3000" placeholder="Internal notes">'+safe(item.admin_notes||'')+'</textarea><button class="table-link" type="button" data-save-message="'+safe(item.id)+'">Save</button></td><td>'+new Date(item.created_at).toLocaleString('en-IN')+'</td></tr>';
    }).join('') || '<tr><td colspan="5">No messages yet.</td></tr>';
  }

  function openProductForm(product) {
    var form = $('product-form');
    form.hidden = false;
    form.reset();
    form.elements.id.value = product ? product.id : '';
    $('product-form-title').textContent = product ? 'Edit product' : 'Add a product';
    if (product) ['name','sku','category_id','price','sale_price','stock_quantity','customisation_charge','short_description','description','status'].forEach(function (key) {
      if (form.elements[key]) form.elements[key].value = product[key] == null ? '' : product[key];
    });
    form.elements.variants.value = product ? JSON.stringify(product.variants || [], null, 2) : '[]';
    if (product) ['is_featured','is_bestseller','is_new_arrival','is_customisable'].forEach(function (key) { form.elements[key].checked = Boolean(product[key]); });
    form.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function saveProduct(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var id = data.get('id');
    var name = String(data.get('name')||'').trim();
    var variants;
    try {
      variants = JSON.parse(String(data.get('variants') || '[]'));
      if (!Array.isArray(variants)) throw new Error('Variants must be a JSON array.');
    } catch (error) {
      message('product-message','Variants must be valid JSON containing an array.');
      return;
    }
    var payload = {
      name:name, slug:slug(name), sku:String(data.get('sku')||'').trim()||null,
      category_id:data.get('category_id'), price:Number(data.get('price')),
      sale_price:data.get('sale_price') === '' ? null : Number(data.get('sale_price')),
      stock_quantity:Number(data.get('stock_quantity')||0),
      customisation_charge:Number(data.get('customisation_charge')||0),
      variants:variants,
      short_description:String(data.get('short_description')||'').trim(),
      description:String(data.get('description')||'').trim(),
      status:data.get('status'), is_featured:data.has('is_featured'),
      is_bestseller:data.has('is_bestseller'), is_new_arrival:data.has('is_new_arrival'),
      is_customisable:data.has('is_customisable')
    };
    if (!name || !Number.isFinite(payload.price) || payload.price < 0 ||
        (payload.sale_price !== null && (!Number.isFinite(payload.sale_price) || payload.sale_price < 0 || payload.sale_price > payload.price)) ||
        !Number.isInteger(payload.stock_quantity) || payload.stock_quantity < 0 ||
        !Number.isFinite(payload.customisation_charge) || payload.customisation_charge < 0) {
      message('product-message','Check the product name, price, sale price, stock, and customisation charge.');
      return;
    }
    message('product-message','Saving…');
    var saved = id
      ? await client.from('products').update(payload).eq('id',id).select('id').single()
      : await client.from('products').insert(payload).select('id').single();
    if (saved.error) { message('product-message',saved.error.message); return; }
    var file = data.get('image');
    if (file && file.size) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
        message('product-message','Image must be PNG, JPEG, or WebP and no larger than 8 MB.');
        return;
      }
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

  async function saveCategory(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var name = String(data.get('name') || '').trim();
    var categorySlug = slug(name);
    if (!name || !categorySlug) {
      message('category-message','Enter a category name using letters or numbers.');
      return;
    }
    var result = await client.from('categories').insert({
      name:name,
      slug:categorySlug,
      description:String(data.get('description') || '').trim() || null,
      is_active:true
    });
    if (result.error) {
      message('category-message','Category was not saved: '+result.error.message);
      return;
    }
    form.reset();
    message('category-message','Category added.');
    await loadCategories();
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g,'""') + '"';
  }

  function bind() {
    $('login-form').addEventListener('submit',async function(event){
      event.preventDefault();
      if (!client) { message('login-message','Supabase could not initialize. Check the connection and try again.'); return; }
      var data = new FormData(event.currentTarget);
      message('login-message','Signing in…');
      var result;
      try {
        result = await client.auth.signInWithPassword({
          email:String(data.get('email') || '').trim().toLowerCase(),
          password:data.get('password')
        });
      } catch (error) {
        message('login-message','Sign-in failed: '+(error && error.message ? error.message : 'Please try again.'));
        return;
      }
      if (result.error) { message('login-message',result.error.message); return; }
      await requireAdmin(result.data.session);
    });
    $('signout-button').addEventListener('click',async function(){
      if(!client){message('admin-message','Supabase could not initialize. Check the connection and try again.');return;}
      var result;
      try {
        result=await client.auth.signOut();
      } catch (error) {
        message('admin-message','Could not sign out: '+(error && error.message ? error.message : 'Please try again.'));
        return;
      }
      if(result.error)message('admin-message','Could not sign out: '+result.error.message);
    });
    $('new-product-button').addEventListener('click',function(){ openProductForm(null); });
    $('cancel-product-button').addEventListener('click',function(){ $('product-form').hidden=true; });
    $('product-form').addEventListener('submit',saveProduct);
    $('category-form').addEventListener('submit',saveCategory);
    $('categories-table').addEventListener('click',async function(event){
      var button=event.target.closest('[data-category-status]');
      if(!button)return;
      button.disabled=true;
      var result=await client.from('categories')
        .update({is_active:button.dataset.active!=='true'})
        .eq('id',button.dataset.categoryStatus);
      if(result.error)message('admin-message','Category visibility was not updated: '+result.error.message);
      else {message('admin-message','Category visibility updated.');await loadCategories();}
      button.disabled=false;
    });
    $('order-search').addEventListener('input',renderOrders);
    ['order-from','order-to','order-payment-filter','order-status-filter'].forEach(function (id) {
      $(id).addEventListener('change',renderOrders);
    });
    $('customer-search').addEventListener('input',renderCustomers);
    $('customers-table').addEventListener('click',function(event){
      var button=event.target.closest('[data-view-customer]');
      if(button)showCustomerDetails(button.dataset.viewCustomer);
    });
    $('close-customer-details').addEventListener('click',function(){ $('customer-details').hidden=true; });
    $('newsletter-search').addEventListener('input',renderNewsletter);
    $('newsletter-filter').addEventListener('change',renderNewsletter);
    $('store-settings-form').addEventListener('submit',saveStoreSettings);
    $('close-order-details').addEventListener('click',function(){ $('order-details').hidden=true; });
    $('orders-table').addEventListener('click',function(event){
      var button=event.target.closest('[data-order-details]');
      if(button)showOrderDetails(button.dataset.orderDetails);
    });
    $('save-order-notes').addEventListener('click',async function(){
      var button=this;
      button.disabled=true;
      var result=await client.rpc('admin_update_order_notes',{
        p_order_id:button.dataset.orderId,
        p_admin_notes:$('order-admin-notes').value
      });
      if(result.error)message('admin-message','Internal order notes were not saved: '+result.error.message);
      else {
        var order=orders.find(function(item){return item.id===button.dataset.orderId;});
        if(order)order.admin_notes=$('order-admin-notes').value;
        message('admin-message','Internal order notes saved.');
      }
      button.disabled=false;
    });
    $('orders-table').addEventListener('change', async function(event) {
      var select = event.target.closest('[data-order-status]');
      if (!select) return;
      select.disabled = true;
      var result = await client.rpc('admin_update_order_status',{p_order_id:select.dataset.orderStatus,p_status:select.value});
      if (result.error) { message('admin-message','Order status was not updated: '+result.error.message); await loadOrders(); }
      else {
        var order=orders.find(function(item){return item.id===select.dataset.orderStatus;});
        if(order)order.status=select.value;
        message('admin-message','Order status updated.');
        await loadOverview();
      }
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
    $('requests-table').addEventListener('click',async function(event){
      var referencesButton=event.target.closest('[data-view-request-references]');
      if(referencesButton){
        referencesButton.disabled=true;
        try {
          var paths=JSON.parse(referencesButton.dataset.viewRequestReferences);
          if(!Array.isArray(paths)||paths.length>3||paths.some(function(path){return typeof path!=='string'||path.length>500;}))throw new Error('Stored reference image paths are invalid.');
          var links=[];
          for(var index=0;index<paths.length;index++){
            var signed=await client.storage.from('custom-gift-uploads').createSignedUrl(paths[index],300);
            if(signed.error)throw signed.error;
            links.push(signed.data.signedUrl);
          }
          var target=$('[data-request-reference-links="'+referencesButton.closest('tr').querySelector('[data-request-status]').dataset.requestStatus+'"]');
          target.replaceChildren();
          links.forEach(function(url,index){
            var link=document.createElement('a');
            link.href=url;
            link.target='_blank';
            link.rel='noopener noreferrer';
            link.textContent=' Open image '+(index+1);
            target.appendChild(link);
          });
        } catch(error) {
          message('admin-message','Reference images could not be opened: '+error.message);
        } finally {
          referencesButton.disabled=false;
        }
        return;
      }
      var button=event.target.closest('[data-save-request]');
      if(!button)return;
      var id=button.dataset.saveRequest;
      var quoteValue=$('[data-request-quote="'+id+'"]').value;
      var amount=quoteValue===''?null:Number(quoteValue);
      if(amount!==null&&(!Number.isFinite(amount)||amount<0)){
        message('admin-message','Quote must be a non-negative amount.');
        return;
      }
      button.disabled=true;
      var result=await client.from('custom_gift_requests').update({
        quoted_amount:amount,
        quote_notes:$('[data-request-quote-notes="'+id+'"]').value.trim()||null,
        admin_notes:$('[data-request-notes="'+id+'"]').value.trim()||null
      }).eq('id',id);
      if(result.error)message('admin-message','Gift request notes or quote were not saved: '+result.error.message);
      else message('admin-message','Gift request quote and internal notes saved.');
      button.disabled=false;
    });
    $('messages-table').addEventListener('click',async function(event){
      var button=event.target.closest('[data-save-message]');
      if(!button)return;
      var id=button.dataset.saveMessage;
      var row=button.closest('tr');
      var status=row.querySelector('[data-message-status]').value;
      var notes=row.querySelector('[data-message-notes]').value.trim();
      button.disabled=true;
      var result=await client.from('contact_messages').update({status:status,admin_notes:notes||null}).eq('id',id);
      if(result.error)message('admin-message','Contact message update failed: '+result.error.message);
      else {message('admin-message','Contact message status and notes saved.');await loadOverview();}
      button.disabled=false;
    });
    $('shipments-table').addEventListener('click',async function(event){
      var button=event.target.closest('[data-save-shipment]');
      if(!button)return;
      var id=button.dataset.saveShipment;
      var awb=$('[data-shipment-awb="'+id+'"]').value.trim();
      var trackingUrl=$('[data-shipment-url="'+id+'"]').value.trim();
      var status=$('[data-shipment-status="'+id+'"]').value;
      var shipment=shipments.find(function(item){return item.id===id;});
      if(trackingUrl){
        try {
          var parsed=new URL(trackingUrl);
          if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw new Error('Unsupported URL scheme');
        } catch(error) {
          message('admin-message','Enter a valid HTTP or HTTPS tracking URL.');
          return;
        }
      }
      button.disabled=true;
      var shipmentUpdate={
        awb_number:awb||null,
        tracking_url:trackingUrl||null,
        status:status
      };
      var now=new Date().toISOString();
      if(shipment&&!shipment.shipped_at&&['in_transit','out_for_delivery','delivered'].indexOf(status)>=0)shipmentUpdate.shipped_at=now;
      if(shipment&&!shipment.delivered_at&&status==='delivered')shipmentUpdate.delivered_at=now;
      var result=await client.from('shipments').update(shipmentUpdate).eq('id',id);
      if(result.error)message('admin-message','Shipment was not updated: '+result.error.message);
      else {
        if(shipment)Object.assign(shipment,shipmentUpdate);
        message('admin-message','Shipment details updated.');
      }
      button.disabled=false;
    });
    $('newsletter-table').addEventListener('change',async function(event){
      var select=event.target.closest('[data-subscriber-status]');
      if(!select)return;
      select.disabled=true;
      var result=await client.from('newsletter_subscribers')
        .update({is_active:select.value==='true'})
        .eq('email',select.dataset.subscriberStatus);
      if(result.error)message('admin-message','Subscriber status was not updated: '+result.error.message);
      else {
        var subscriber=subscribers.find(function(item){return item.email===select.dataset.subscriberStatus;});
        if(subscriber)subscriber.is_active=select.value==='true';
        renderNewsletter();
      }
      select.disabled=false;
    });
    $('export-newsletter').addEventListener('click',function(){
      var csv=['email,status,subscribed_at'].concat(subscribers.map(function(subscriber){
        return [csvCell(subscriber.email),csvCell(subscriber.is_active?'active':'inactive'),csvCell(subscriber.created_at)].join(',');
      })).join('\r\n');
      var blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
      var url=URL.createObjectURL(blob);
      var link=document.createElement('a');
      link.href=url;
      link.download='thekeeplily-newsletter-subscribers.csv';
      link.click();
      URL.revokeObjectURL(url);
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
  }
  if (!client) bind();
})();
