(function () {
  'use strict';

  window.KEEPLILY_PRODUCTS = [];
  window.KEEPLILY_CATEGORIES = [];
  window.formatINR = function (value) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Product data is served from the live database; static/demo rows are never shown.
  var backendConfig = window.KEEPLILY_SUPABASE || {};
  window.KEEPLILY_LIVE_CATALOGUE = false;
  window.KEEPLILY_CATALOGUE_ERROR = null;
  window.KEEPLILY_PRODUCTS_READY = Promise.resolve().then(async function () {
    if (!backendConfig.url || !backendConfig.anonKey) {
      window.KEEPLILY_CATALOGUE_ERROR = 'The shop is temporarily unavailable.';
      return;
    }
    if (!window.supabase) throw new Error('The Supabase client library did not load.');
    var client = window.KEEPLILY_SUPABASE_CLIENT || window.supabase.createClient(backendConfig.url, backendConfig.anonKey);
    window.KEEPLILY_SUPABASE_CLIENT = client;
    var result = await client.from('products')
      .select('*, categories(name), product_images(storage_path,alt_text,is_primary,sort_order)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (result.error) throw result.error;
    window.KEEPLILY_LIVE_CATALOGUE = true;
    window.KEEPLILY_PRODUCTS = (result.data || []).map(function (row) {
      var images = (row.product_images || []).slice().sort(function (a,b) {
        return Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || a.sort_order - b.sort_order;
      });
      var primary = images[0];
      var imageUrl = primary
        ? client.storage.from('product-images').getPublicUrl(primary.storage_path).data.publicUrl
        : '';
      var variants = Array.isArray(row.variants) && row.variants.length
        ? row.variants.map(function (item) { return typeof item === 'string' ? item : item.name; }).filter(Boolean)
        : ['One size'];
      var variantPricing = {};
      (row.variants || []).forEach(function (item) {
        if (item && typeof item === 'object' && item.name) {
          variantPricing[item.name] = Number(item.price_adjustment || 0);
        }
      });
      return {
        id: row.id, sku: row.sku || '', name: row.name, slug: row.slug,
        category: row.categories && row.categories.name ? row.categories.name : 'Gifts',
        price: Number(row.price), salePrice: row.sale_price === null ? null : Number(row.sale_price),
        shortDescription: row.short_description || '', description: row.description || '',
        image: imageUrl, imagePosition: 'center', additionalImages: images.slice(1).map(function (item) {
          return client.storage.from('product-images').getPublicUrl(item.storage_path).data.publicUrl;
        }),
        materials: row.materials || '', dimensions: row.dimensions || '', colours: [],
        sizes: variants, variants: variants, variantPricing: variantPricing,
        customisable: Boolean(row.is_customisable), customisationCharge: Number(row.customisation_charge || 0),
        customisationNotes: '', stock: row.track_inventory ? Number(row.stock_quantity) : null,
        availability: !row.track_inventory || row.stock_quantity > 0 || row.allow_backorder ? 'available' : 'unavailable',
        madeToOrder: false, preparationTime: row.preparation_days == null ? '' : row.preparation_days + ' day preparation',
        careInstructions: row.care_instructions || '', badges: [row.is_bestseller ? 'BESTSELLER' : '', row.is_new_arrival ? 'NEW' : ''].filter(Boolean),
        tags: row.tags || [], visible: true, featured: Boolean(row.is_featured),
        bestseller: Boolean(row.is_bestseller), newArrival: Boolean(row.is_new_arrival),
        createdAt: row.created_at || ''
      };
    });
    var categoryResult = await client.from('categories').select('name').eq('is_active', true).order('sort_order');
    if (!categoryResult.error && categoryResult.data && categoryResult.data.length) {
      window.KEEPLILY_CATEGORIES = categoryResult.data.map(function (item) { return item.name; });
    }
  }).catch(function (error) {
    if (!backendConfig.url || !backendConfig.anonKey) throw error;
    window.KEEPLILY_LIVE_CATALOGUE = false;
    window.KEEPLILY_PRODUCTS = [];
    window.KEEPLILY_CATALOGUE_ERROR = 'The shop is temporarily unavailable.';
    console.error('Keeplily live catalogue could not be loaded.', error);
  });

})();
