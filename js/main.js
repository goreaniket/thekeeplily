(function () {
  'use strict';

  var products = window.KEEPLILY_PRODUCTS || [];
  var categories = window.KEEPLILY_CATEGORIES || [];
  var cart = window.KeeplilyCart;

  function escapeHTML(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slugify(value) {
    return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function productPrice(product) {
    return product.salePrice === null || product.salePrice === undefined ? product.price : product.salePrice;
  }

  function icon(name) {
    var paths = {
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      bag: '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
      minus: '<path d="M5 12h14"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
      camera: '<rect x="3" y="5" width="18" height="16" rx="3"/><circle cx="12" cy="13" r="4"/><path d="m8 5 1-2h6l1 2"/>',
      package: '<path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
  }

  function shell() {
    var header = document.getElementById('site-header');
    var footer = document.getElementById('site-footer');
    if (header) header.innerHTML =
      '<a class="skip-link" href="#main">Skip to content</a>' +
      '<p class="announcement">Little gifts, big feelings. ♡</p>' +
      '<header class="site-header">' +
        '<button class="mobile-menu-button" type="button" data-menu-open aria-label="Open menu">' + icon('menu') + '</button>' +
        '<a class="wordmark" href="index.html" aria-label="TheKeeplily Co. home"><span class="wordmark-flower">✿</span><span>TheKeeplily Co.</span></a>' +
        '<nav class="desktop-nav" aria-label="Primary navigation"><a href="index.html">Home</a><a href="shop.html">Shop</a><a href="shop.html#filters">Categories</a><a href="custom-gifts.html">Custom Gifts</a><a href="about.html">About</a><a href="owner.html">Owner</a><a href="contact.html">Contact</a><a href="auth.html">My Account</a></nav>' +
        '<div class="header-actions"><form class="header-search" id="header-search"><label class="sr-only" for="header-search-input">Search products</label>' + icon('search') + '<input id="header-search-input" name="q" placeholder="Search" autocomplete="off"></form><a class="icon-button heart-link" href="shop.html?wishlist=1" aria-label="View wishlist">♡</a><button class="icon-button bag-button" type="button" data-cart-open aria-label="Open shopping bag">' + icon('bag') + '<span data-cart-count>0</span></button></div>' +
      '</header>';
    if (footer) footer.innerHTML =
      '<footer><div class="footer-brand"><a class="wordmark" href="index.html"><span class="wordmark-flower">✿</span>TheKeeplily Co.</a><p>Little gifts, big feelings. ♡</p><p>Handmade in Vapi, Gujarat, India.</p></div>' +
      '<div><h3>Explore</h3><a href="shop.html">Shop</a><a href="custom-gifts.html">Custom Gifts</a><a href="about.html">About</a><a href="owner.html">Owner</a><a href="contact.html">Contact</a></div>' +
      '<div><h3>Helpful</h3><a href="shipping.html">Shipping</a><a href="returns.html">Returns</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="copyright.html">Copyright</a></div>' +
      '<div><h3>Keep in touch</h3><a href="https://instagram.com/the_keeplily.co" target="_blank" rel="noreferrer">@the_keeplily.co</a><a href="mailto:luniyasejal50@gmail.com">luniyasejal50@gmail.com</a></div>' +
      '<p class="copyright">© 2026 TheKeeplily Co. · Made with a little love ♡</p></footer>';

    document.body.insertAdjacentHTML('beforeend',
      '<div class="drawer-layer" id="menu-drawer" hidden><button class="drawer-backdrop" type="button" data-drawer-close aria-label="Close menu"></button><aside class="drawer-panel menu-sheet" role="dialog" aria-modal="true" aria-label="Navigation menu"><button class="drawer-close" type="button" data-drawer-close aria-label="Close menu">' + icon('close') + '</button><div class="drawer-heading"><strong>TheKeeplily Co.</strong><span>Little gifts, big feelings. ♡</span></div><nav class="mobile-nav"><a href="index.html">Home</a><a href="shop.html">Shop all</a>' + categories.map(function (category) { return '<a href="shop.html?category=' + encodeURIComponent(category) + '">' + escapeHTML(category) + '</a>'; }).join('') + '<a href="custom-gifts.html">Custom gifts</a><a href="about.html">About</a><a href="contact.html">Contact</a></nav></aside></div>' +
      '<div class="drawer-layer" id="cart-drawer" hidden><button class="drawer-backdrop" type="button" data-drawer-close aria-label="Close cart"></button><aside class="drawer-panel cart-sheet" role="dialog" aria-modal="true" aria-label="Shopping cart"><button class="drawer-close" type="button" data-drawer-close aria-label="Close cart">' + icon('close') + '</button><div class="drawer-heading"><strong>Your little bag ♡</strong><span data-cart-caption></span></div><div id="cart-drawer-content" class="cart-drawer-content"></div></aside></div>' +
      '<div class="toast" id="site-toast" role="status" aria-live="polite" hidden></div>');
    updateCartCount();
  }

  function sectionHeading(kicker, title, action, href) {
    return '<div class="section-heading"><div><p class="eyebrow">' + kicker + '</p><h2>' + title + '</h2></div>' + (action ? '<a class="text-link" href="' + href + '">' + action + ' ' + icon('arrow') + '</a>' : '') + '</div>';
  }

  function productCard(product) {
    var wished = cart.getWishlist().indexOf(product.id) >= 0;
    return '<article class="product-card" data-product-card="' + escapeHTML(product.id) + '"><div class="product-image-wrap"><a href="product.html?product=' + encodeURIComponent(product.slug) + '"><img src="' + product.image + '" alt="' + escapeHTML(product.name) + '" style="object-position:' + escapeHTML(product.imagePosition) + '" loading="lazy"></a><div class="badge-row">' + product.badges.slice(0, 2).map(function (badge) { return '<span>' + escapeHTML(badge) + '</span>'; }).join('') + '</div><button class="wish-button' + (wished ? ' active' : '') + '" type="button" data-wish="' + escapeHTML(product.id) + '" aria-label="' + (wished ? 'Remove from' : 'Add to') + ' wishlist">' + (wished ? '♥' : '♡') + '</button></div><div class="product-info"><p>' + escapeHTML(product.category) + '</p><a href="product.html?product=' + encodeURIComponent(product.slug) + '"><h3>' + escapeHTML(product.name) + '</h3></a><div class="price-row"><strong>' + window.formatINR(productPrice(product)) + '</strong>' + (product.salePrice ? '<del>' + window.formatINR(product.price) + '</del>' : '') + '</div><div class="card-actions"><button type="button" data-add="' + escapeHTML(product.id) + '">' + (product.variants.length > 1 ? 'Quick add' : 'Add to bag') + ' ' + icon('bag') + '</button><a href="product.html?product=' + encodeURIComponent(product.slug) + '" aria-label="View ' + escapeHTML(product.name) + '">' + icon('arrow') + '</a></div></div></article>';
  }

  function renderProductGrid(target, list) {
    if (!target) return;
    target.innerHTML = list.length
      ? list.map(productCard).join('')
      : '<div class="empty-state"><span class="empty-icon">✦</span><h3>No little finds here yet</h3><p>Try another category or clear the filters.</p><a href="shop.html" class="button secondary">View all gifts</a></div>';
  }

  function renderHome() {
    document.getElementById('main').innerHTML =
      '<section class="hero"><div class="hero-copy"><p class="eyebrow">HANDMADE IN VAPI, WITH LOVE</p><h1>Little keepsakes for <em>big feelings.</em></h1><p class="hero-lead">Handmade little things for your favourite people—thoughtfully created to celebrate tiny joys and everything worth keeping.</p><div class="hero-buttons"><a class="button primary" href="shop.html">Shop now ' + icon('arrow') + '</a><a class="button secondary" href="custom-gifts.html">Custom gifts</a></div><div class="hero-notes"><span>♡ Handmade with care</span><span>✦ Personalised for you</span></div></div><div class="hero-art"><div class="hero-image-shell"><img class="hero-image" src="assets/keeplily-collection.png" alt="A candle, clay heart charm, beaded phone charm, handmade card and floral wax sachet arranged on a warm cream surface"><span class="floating-note">made to be kept ♡</span></div><span class="sparkle sparkle-one">✦</span><span class="sparkle sparkle-two">✧</span></div></section>' +
      '<section class="section categories-section">' + sectionHeading('A LITTLE SOMETHING FOR EVERY FEELING', 'Find Your Little Favourite ♡') + '<div class="category-grid">' + categories.map(function (name, index) { return '<a class="category-card category-' + index + '" href="shop.html?category=' + encodeURIComponent(name) + '"><img src="assets/keeplily-collection.png" alt="" loading="lazy"><div><span>0' + (index + 1) + '</span><h3>' + escapeHTML(name) + '</h3>' + icon('arrow') + '</div></a>'; }).join('') + '</div></section>' +
      '<section class="section products-section">' + sectionHeading('CHOSEN WITH LOVE', 'Our Little Favourites ♡', 'Shop all', 'shop.html') + '<div class="product-grid" id="home-favourites"></div></section>' +
      '<section class="custom-banner"><div class="custom-copy"><span class="mini-script">your idea, made little</span><h2>Have something special in mind?<br><em>Let’s create it together. ♡</em></h2><p>Tell us the person, the moment and your favourite colours. We’ll help turn the feeling into a keepsake.</p><a class="button primary" href="custom-gifts.html">Customise your gift ' + icon('arrow') + '</a></div><div class="custom-gift-card"><span class="gift-symbol">♡</span><strong>Made especially for you</strong><span>One thoughtful detail at a time</span></div></section>' +
      '<section class="story-section"><div class="story-image"><img src="assets/keeplily-collection.png" alt="Close view of handmade Keeplily pieces" loading="lazy"><span class="story-stamp">made by hand<br>with love ♡</span></div><div class="story-copy"><p class="eyebrow">OUR LITTLE STORY</p><h2>For moments that deserve more than an ordinary gift.</h2><p>TheKeeplily Co. creates little handmade pieces with love and care, made to turn everyday moments into something worth keeping.</p><p class="story-signoff">Handmade with love. Made to be kept. ♡</p><a class="text-link" href="about.html">Meet TheKeeplily Co. ' + icon('arrow') + '</a></div></section>' +
      '<section class="section products-section blush-section">' + sectionHeading('FRESH FROM OUR HANDS', 'New &amp; Noteworthy') + '<div class="product-grid" id="home-featured"></div></section>' +
      '<section class="section occasions">' + sectionHeading('GIFT BY MOMENT', 'A little love, for every occasion') + '<div class="occasion-row">' + [['Birthday','Tiny ways to make their day'],['Friendship','For your favourite human'],['Anniversary','A little piece of your story'],['Festive','Warmth, wrapped beautifully'],['Self-gifting','Because you count too']].map(function (occasion) { return '<a href="shop.html?q=' + encodeURIComponent(occasion[0]) + '"><span>♡</span><strong>' + occasion[0] + '</strong><small>' + occasion[1] + '</small></a>'; }).join('') + '</div></section>' +
      '<section class="why-section">' + sectionHeading('THE KEEPLILY TOUCH', 'Why it feels special ♡') + '<div class="trust-grid"><div class="trust-card"><span>♡</span><h3>Handmade With Care</h3><p>Every little piece gets patient hands and thoughtful finishing.</p></div><div class="trust-card"><span>✦</span><h3>Made Personal</h3><p>Details that help your gift feel unmistakably theirs.</p></div><div class="trust-card"><span>♡</span><h3>Thoughtful Gifting</h3><p>Sweet, useful and meaningful—without feeling overdone.</p></div><div class="trust-card"><span>⌂</span><h3>Packed With Love</h3><p>A warm unboxing moment, ready for someone special.</p></div></div></section>' +
      '<section class="instagram-section"><div><p class="eyebrow">LITTLE THINGS, IN THE MAKING</p><h2>Find us on Instagram ♡</h2><p>Follow the tiny details, new drops and behind-the-scenes moments.</p><a class="button secondary" href="https://instagram.com/the_keeplily.co" target="_blank" rel="noreferrer">' + icon('camera') + '@the_keeplily.co</a></div><div class="insta-collage"><img src="assets/keeplily-collection.png" alt="Keeplily handmade gifting collection" loading="lazy"><span>♥ little details, daily</span></div></section>' +
      '<section class="newsletter"><div><p class="eyebrow">A LITTLE LOVE LETTER, SOMETIMES</p><h2>New keepsakes, gifting ideas &amp; sweet little updates.</h2></div><form id="newsletter-form"><label class="sr-only" for="newsletter-email">Email address</label><input id="newsletter-email" required type="email" placeholder="Your email address"><button aria-label="Join newsletter">' + icon('arrow') + '</button></form></section>';
    renderProductGrid(document.getElementById('home-favourites'), products.filter(function (product) { return product.visible && product.bestseller; }).slice(0, 4));
    renderProductGrid(document.getElementById('home-featured'), products.filter(function (product) { return product.visible && product.featured; }).slice(0, 4));
    var newsletter = document.getElementById('newsletter-form');
    newsletter.addEventListener('submit', function (event) {
      event.preventDefault();
      newsletter.outerHTML = '<p class="newsletter-done">' + icon('check') + ' You’re on the little preview list. ♡</p>';
    });
  }

  function renderShop() {
    var params = new URLSearchParams(window.location.search);
    var selectedCategory = params.get('category') || 'All';
    var wishlistOnly = params.get('wishlist') === '1';
    var query = params.get('q') || '';
    document.getElementById('main').innerHTML =
      '<section class="page-hero"><p class="eyebrow">THE LITTLE GIFT SHOP</p><h1>Find something worth keeping.</h1><p>Handmade pieces for birthdays, best friends, soft moments and just because.</p></section>' +
      '<section class="shop-layout"><aside class="filters" id="filters"><h2>Filter little finds</h2><label>Search<input id="shop-search" value="' + escapeHTML(query) + '" placeholder="Charm, candle, card…"></label><fieldset><legend>Category</legend><div id="category-filters"></div></fieldset><label>Availability<select id="availability-filter"><option value="all">All products</option><option value="available">Available</option></select></label><label class="check-line"><input id="custom-filter" type="checkbox"><span>Customisable only</span></label><label class="check-line"><input id="wishlist-filter" type="checkbox"' + (wishlistOnly ? ' checked' : '') + '><span>Wishlist only</span></label></aside>' +
      '<div class="shop-results"><div class="results-toolbar"><p><strong id="result-count">0</strong> little finds</p><label>Sort by<select id="sort-products"><option value="featured">Featured</option><option value="new">Newest</option><option value="low">Price: Low to High</option><option value="high">Price: High to Low</option></select></label></div><details class="mobile-filters"><summary>Filters <span>⌄</span></summary><div><label>Search<input id="mobile-shop-search" value="' + escapeHTML(query) + '"></label><label>Category<select id="mobile-category-filter"></select></label><label>Availability<select id="mobile-availability-filter"><option value="all">All products</option><option value="available">Available</option></select></label><label class="check-line"><input id="mobile-custom-filter" type="checkbox">Customisable only</label><label class="check-line"><input id="mobile-wishlist-filter" type="checkbox"' + (wishlistOnly ? ' checked' : '') + '>Wishlist only</label></div></details><div class="product-grid" id="shop-grid"></div></div></section>';
    var categoryMarkup = ['All'].concat(categories).map(function (category) { return '<label class="radio-line"><input type="radio" name="category" value="' + escapeHTML(category) + '"' + (category === selectedCategory ? ' checked' : '') + '><span>' + escapeHTML(category) + '</span></label>'; }).join('');
    document.getElementById('category-filters').innerHTML = categoryMarkup;
    document.getElementById('mobile-category-filter').innerHTML = ['All'].concat(categories).map(function (category) { return '<option' + (category === selectedCategory ? ' selected' : '') + '>' + escapeHTML(category) + '</option>'; }).join('');

    function filterProducts() {
      var search = document.getElementById('shop-search').value.trim().toLowerCase();
      var categoryNode = document.querySelector('input[name="category"]:checked');
      var category = categoryNode ? categoryNode.value : 'All';
      var availability = document.getElementById('availability-filter').value;
      var customOnly = document.getElementById('custom-filter').checked;
      var wishOnly = document.getElementById('wishlist-filter').checked;
      var sort = document.getElementById('sort-products').value;
      var wishlist = cart.getWishlist();
      var filtered = products.filter(function (product) {
        var haystack = (product.name + ' ' + product.category + ' ' + product.tags.join(' ')).toLowerCase();
        return product.visible && (!search || haystack.indexOf(search) >= 0) && (category === 'All' || product.category === category) && (availability === 'all' || product.availability === availability) && (!customOnly || product.customisable) && (!wishOnly || wishlist.indexOf(product.id) >= 0);
      });
      filtered.sort(function (a, b) {
        if (sort === 'low') return productPrice(a) - productPrice(b);
        if (sort === 'high') return productPrice(b) - productPrice(a);
        if (sort === 'new') return b.createdAt.localeCompare(a.createdAt);
        return Number(b.featured) - Number(a.featured);
      });
      document.getElementById('result-count').textContent = filtered.length;
      renderProductGrid(document.getElementById('shop-grid'), filtered);
    }

    document.getElementById('shop-search').addEventListener('input', function (event) { document.getElementById('mobile-shop-search').value = event.target.value; filterProducts(); });
    document.getElementById('mobile-shop-search').addEventListener('input', function (event) { document.getElementById('shop-search').value = event.target.value; filterProducts(); });
    document.getElementById('category-filters').addEventListener('change', function () { document.getElementById('mobile-category-filter').value = document.querySelector('input[name="category"]:checked').value; filterProducts(); });
    document.getElementById('mobile-category-filter').addEventListener('change', function (event) { var radio = document.querySelector('input[name="category"][value="' + CSS.escape(event.target.value) + '"]'); if (radio) radio.checked = true; filterProducts(); });
    [['availability-filter','mobile-availability-filter'],['custom-filter','mobile-custom-filter'],['wishlist-filter','mobile-wishlist-filter']].forEach(function (pair) {
      pair.forEach(function (id, index) { document.getElementById(id).addEventListener('change', function (event) { var other = document.getElementById(pair[index ? 0 : 1]); if (other.type === 'checkbox') other.checked = event.target.checked; else other.value = event.target.value; filterProducts(); }); });
    });
    document.getElementById('sort-products').addEventListener('change', filterProducts);
    window.addEventListener('keeplily:wishlistchange', filterProducts);
    filterProducts();
  }

  function renderProduct() {
    var slug = new URLSearchParams(window.location.search).get('product');
    var product = products.find(function (item) { return item.slug === slug; });
    if (!product) { renderNotFound(); return; }
    document.title = product.name + ' | TheKeeplily Co.';
    var state = { variant: product.variants[0], quantity: 1 };
    document.getElementById('main').innerHTML =
      '<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="shop.html">Shop</a><span>/</span><span>' + escapeHTML(product.name) + '</span></nav>' +
      '<section class="product-page"><div class="product-gallery"><div class="main-product-image"><img src="' + product.image + '" alt="' + escapeHTML(product.name) + '" style="object-position:' + escapeHTML(product.imagePosition) + '"><span class="zoom-note">' + icon('search') + ' A closer look</span></div><div class="thumb-row"><button class="active" type="button"><img src="' + product.image + '" alt="' + escapeHTML(product.name) + ', front view" style="object-position:' + escapeHTML(product.imagePosition) + '"></button><button type="button"><img src="' + product.image + '" alt="' + escapeHTML(product.name) + ', styled view" style="object-position:68% 50%"></button></div></div>' +
      '<div class="product-panel"><p class="eyebrow">' + escapeHTML(product.category.toUpperCase()) + '</p><div class="product-title-row"><h1>' + escapeHTML(product.name) + '</h1><button class="wish-button' + (cart.getWishlist().indexOf(product.id) >= 0 ? ' active' : '') + '" type="button" data-wish="' + product.id + '" aria-label="Toggle wishlist">' + (cart.getWishlist().indexOf(product.id) >= 0 ? '♥' : '♡') + '</button></div><div class="detail-price"><strong id="product-price"></strong>' + (product.madeToOrder ? '<span>Made to order</span>' : '<span>Available</span>') + '</div><p class="detail-lead">' + escapeHTML(product.shortDescription) + '</p><div class="stock-note">' + (product.stock === null ? 'Availability confirmed with your order' : product.stock + ' in stock') + '</div>' +
      '<div class="choice-block"><span>Choose an option</span><div class="variant-row">' + product.variants.map(function (variant, index) { return '<button class="' + (index === 0 ? 'active' : '') + '" type="button" data-variant="' + escapeHTML(variant) + '">' + escapeHTML(variant) + (product.variantPricing[variant] ? ' +' + window.formatINR(product.variantPricing[variant]) : '') + '</button>'; }).join('') + '</div></div>' +
      (product.customisable ? '<div class="personalise-box"><label class="check-line"><input id="customisation-toggle" type="checkbox"><span><strong>Make it personal</strong>' + (product.customisationCharge ? ' +' + window.formatINR(product.customisationCharge) : ' Included') + '</span></label><label id="personalisation-field" hidden>Personalisation details<textarea id="personalisation" maxlength="180" placeholder="' + escapeHTML(product.customisationNotes) + '"></textarea><small><span id="personalisation-count">0</span>/180 characters</small></label></div>' : '') +
      '<label class="gift-message">Optional gift message<textarea id="gift-message" placeholder="A little note for someone special…" maxlength="200"></textarea></label><div class="purchase-row"><div class="quantity"><button id="product-decrease" type="button" aria-label="Decrease quantity">' + icon('minus') + '</button><span id="product-quantity">1</span><button id="product-increase" type="button" aria-label="Increase quantity">' + icon('plus') + '</button></div><button class="button primary grow" id="product-add" type="button">Add to bag ' + icon('bag') + '</button></div><button class="button secondary full" id="buy-now" type="button">Buy now</button><div class="micro-trust"><span>' + icon('package') + 'Carefully packed</span><span>♡<br>Made with love</span><span>✦<br>Preview mode</span></div></div></section>' +
      '<section class="detail-sections"><details open><summary>Description</summary><p>' + escapeHTML(product.description) + '</p></details><details><summary>Details</summary><p><strong>Materials:</strong> ' + escapeHTML(product.materials) + '<br><strong>Dimensions:</strong> ' + escapeHTML(product.dimensions) + '<br><strong>Colours:</strong> ' + escapeHTML(product.colours.join(', ')) + '<br><strong>Stock:</strong> ' + (product.stock === null ? 'Made to order / confirmed before dispatch' : product.stock) + '<br><strong>Preparation:</strong> ' + escapeHTML(product.preparationTime) + '</p></details><details><summary>Care Instructions</summary><p>' + escapeHTML(product.careInstructions) + '</p></details><details><summary>Shipping information</summary><p>Shipping charges and the estimated delivery timeline are shown before an order is confirmed.</p></details></section>' +
      '<section class="section products-section">' + sectionHeading('MORE TO KEEP', 'You May Also Like ♡') + '<div class="product-grid" id="related-products"></div></section>';

    function currentPrice() {
      return productPrice(product) + (product.variantPricing[state.variant] || 0) + ((document.getElementById('customisation-toggle') || {}).checked ? product.customisationCharge : 0);
    }
    function updatePrice() { document.getElementById('product-price').textContent = window.formatINR(currentPrice()); }
    function options() { return { variant: state.variant, quantity: state.quantity, customisation: Boolean((document.getElementById('customisation-toggle') || {}).checked), personalisation: (document.getElementById('personalisation') || {}).value || '', giftMessage: document.getElementById('gift-message').value }; }
    document.querySelectorAll('[data-variant]').forEach(function (button) { button.addEventListener('click', function () { document.querySelectorAll('[data-variant]').forEach(function (item) { item.classList.remove('active'); }); button.classList.add('active'); state.variant = button.dataset.variant; updatePrice(); }); });
    var customToggle = document.getElementById('customisation-toggle');
    if (customToggle) customToggle.addEventListener('change', function () { document.getElementById('personalisation-field').hidden = !customToggle.checked; updatePrice(); });
    var personalisation = document.getElementById('personalisation');
    if (personalisation) personalisation.addEventListener('input', function () { document.getElementById('personalisation-count').textContent = personalisation.value.length; });
    document.getElementById('product-decrease').addEventListener('click', function () { state.quantity = Math.max(1, state.quantity - 1); document.getElementById('product-quantity').textContent = state.quantity; });
    document.getElementById('product-increase').addEventListener('click', function () { state.quantity += 1; document.getElementById('product-quantity').textContent = state.quantity; });
    document.getElementById('product-add').addEventListener('click', function () { cart.add(product.id, options()); openDrawer('cart-drawer'); showToast('Added to your little bag ♡'); });
    document.getElementById('buy-now').addEventListener('click', function () { cart.add(product.id, options()); window.location.href = 'checkout.html'; });
    renderProductGrid(document.getElementById('related-products'), products.filter(function (item) { return item.id !== product.id; }).slice(0, 4));
    updatePrice();
  }

  function renderAbout() {
    document.getElementById('main').innerHTML = '<section class="page-hero"><p class="eyebrow">A LITTLE NOTE FROM KEEPLILY</p><h1>Made slowly. Gifted warmly. Kept closely.</h1><p>TheKeeplily Co. creates handmade gifts with love and care, made to make special moments more memorable.</p></section><section class="editorial-about"><div><img src="assets/keeplily-collection.png" alt="Handmade pieces from TheKeeplily Co."></div><article><span class="mini-script">our story is still unfolding</span><h2>Small pieces, real feeling.</h2><p>We believe a gift doesn’t need to be grand to feel meaningful. It can be a tiny charm, a warm candle or a handwritten card—made thoughtfully and chosen with someone in mind.</p><blockquote>“Handmade with love. Made to be kept. ♡”</blockquote><div class="story-placeholders"><details><summary>The meaning behind Keeplily</summary><p>This space is ready for Sejal’s own words.</p></details><details><summary>Meet the founder</summary><p>Founder story to be added when provided by Sejal.</p></details><details><summary>Our making process</summary><p>Process notes and studio photos can be added here later.</p></details></div></article></section>';
  }


  function renderOwner() {
    document.getElementById('main').innerHTML = '<section class="page-hero"><p class="eyebrow">THE PERSON BEHIND THE KEEPLILY CO.</p><h1>Meet the Owner</h1><p>A small business built around thoughtful gifting, handmade details and the feeling behind every little keepsake.</p></section><section class="editorial-about"><div><img src="assets/keeplily-collection.png" alt="A selection of handmade pieces from TheKeeplily Co."></div><article><span class="mini-script">the owner & founder</span><h2>Sejal Luniya</h2><p>Sejal Luniya is the owner of TheKeeplily Co., a gifting brand based in Vapi, Gujarat, India.</p><p>TheKeeplily Co. brings together carefully considered gifts and personal touches for moments worth remembering. The focus is on making each order feel thoughtful, personal and special.</p><p>This page is the official owner information page. A personal founder note and portrait can be added after Sejal approves the final wording and photograph.</p><p><a class="text-link" href="contact.html">Contact TheKeeplily Co. ' + icon('arrow') + '</a></p></article></section>';
  }

  function renderContact() {
    document.getElementById('main').innerHTML = '<section class="page-hero"><p class="eyebrow">SAY A LITTLE HELLO</p><h1>We’d love to hear from you. ♡</h1><p>Questions, gifting ideas or a note about an order—send it our way.</p></section><section class="contact-layout"><div class="contact-details"><h2>Come say hello</h2><a href="mailto:luniyasejal50@gmail.com">' + icon('mail') + '<span><small>Email</small>luniyasejal50@gmail.com</span></a><a href="https://instagram.com/the_keeplily.co" target="_blank" rel="noreferrer">' + icon('camera') + '<span><small>Instagram</small>@the_keeplily.co</span></a><div><span class="place-icon">♡</span><span><small>Based in</small>Vapi, Gujarat, India</span></div></div><form class="contact-form" id="contact-form"><p class="form-preview-note">Preview only: this form validates locally and does not send email.</p><label>Name<input name="name" required autocomplete="name"></label><label>Email<input name="email" required type="email" autocomplete="email"></label><label>Phone <small>Optional</small><input name="phone" inputmode="tel" autocomplete="tel"></label><label>Subject<input name="subject" required></label><label>Message<textarea name="message" required></textarea></label><button class="button primary" type="submit">Save preview message ' + icon('arrow') + '</button></form></section>';
    document.getElementById('contact-form').addEventListener('submit', function (event) { event.preventDefault(); event.currentTarget.outerHTML = '<div class="form-success"><span class="success-icon">' + icon('check') + '</span><h2>Thanks for reaching out ♡</h2><p>Live messaging will be enabled at launch.</p></div>'; });
  }

  function renderCustomGifts() {
    document.getElementById('main').innerHTML = '<section class="page-hero custom-page-hero"><p class="eyebrow">FROM YOUR HEART, MADE BY OUR HANDS</p><h1>Made Especially for You ♡</h1><p>Have something special in mind? Tell us your idea and let’s turn it into a little keepsake.</p></section><section class="custom-form-layout"><div class="process-card"><p class="eyebrow">HOW IT WORKS</p><h2>From idea to keepsake</h2><ol><li><span>1</span><div><strong>Share your idea</strong><p>Tell us the moment, mood and details.</p></div></li><li><span>2</span><div><strong>Review together</strong><p>At launch, we’ll confirm feasibility, timeline and quote.</p></div></li><li><span>3</span><div><strong>Approve the plan</strong><p>Nothing is charged automatically.</p></div></li></ol><p class="soft-note">Preview only: this form does not send a live request.</p></div><form class="custom-form" id="custom-form"><div class="form-grid"><label>Name<input name="name" required autocomplete="name"></label><label>Email<input name="email" required type="email" autocomplete="email"></label><label>Phone<input name="phone" required inputmode="tel" autocomplete="tel"></label><label>Occasion<select name="occasion" required><option value="">Choose an occasion</option><option>Birthday</option><option>Friendship</option><option>Anniversary</option><option>Festive</option><option>Just because</option></select></label><label>Product type<select name="productType" required><option value="">What would you like?</option>' + categories.concat(['Gift Set','Something else']).map(function (name) { return '<option>' + escapeHTML(name) + '</option>'; }).join('') + '</select></label><label>Budget<input name="budget" required inputmode="numeric" placeholder="₹"></label><label>Required date<input name="requiredDate" type="date"></label><label>Quantity<input name="quantity" type="number" min="1" value="1"></label></div><label>Colours / theme<input name="theme" placeholder="Blush pink, daisies, warm neutrals…"></label><label>Customisation details<textarea name="details" required placeholder="Tell us the idea, names, initials and the feeling behind the gift…"></textarea></label><label>Gift message<textarea name="giftMessage" placeholder="Optional message for the recipient"></textarea></label><label>Notes<textarea name="notes"></textarea></label><button class="button primary full" type="submit">Preview my custom request ' + icon('arrow') + '</button></form></section>';
    document.getElementById('custom-form').addEventListener('submit', function (event) { event.preventDefault(); document.getElementById('main').innerHTML = '<section class="confirmation"><span class="success-icon">' + icon('check') + '</span><p class="eyebrow">PREVIEW READY</p><h1>Your custom gift request looks ready ♡</h1><p>Live submissions will be enabled at launch.</p><a class="button primary" href="shop.html">Browse the collection</a></section>'; });
  }

  function renderCheckout() {
    var lines = cart.getCart();
    if (!lines.length) { document.getElementById('main').innerHTML = '<section class="empty-page"><span class="empty-icon">♡</span><h1>Your bag is empty</h1><p>Add something thoughtful before heading to checkout.</p><a class="button primary" href="shop.html">Shop little gifts</a></section>'; return; }
    document.getElementById('main').innerHTML = '<section class="checkout-page"><div><a class="back-link" href="shop.html">← Continue shopping</a><p class="eyebrow">CHECKOUT PREVIEW</p><h1>Where should we send the little joy?</h1><form class="checkout-form" id="checkout-form"><fieldset><legend>Your details</legend><div class="form-grid"><label>Full name<input required name="name" autocomplete="name"></label><label>Email<input required name="email" type="email" autocomplete="email"></label><label>Phone number<input required name="phone" inputmode="tel" autocomplete="tel"></label></div></fieldset><fieldset><legend>Delivery address</legend><div class="form-grid"><label>House / Flat<input required name="house" autocomplete="address-line1"></label><label>Street / Area<input required name="address" autocomplete="address-line2"></label><label>City<input required name="city" autocomplete="address-level2"></label><label>State<input required name="state" value="Gujarat" autocomplete="address-level1"></label><label>PIN code<input required name="pin" inputmode="numeric" pattern="[0-9]{6}" autocomplete="postal-code"></label></div></fieldset><label>Order notes <small>Optional</small><textarea name="notes" placeholder="Anything we should know?"></textarea></label><div class="payment-notice"><span>✦</span><div><strong>This is a client-preview checkout</strong><p>No payment is collected, no stock is reserved and no order is sent to the shop.</p></div></div><button class="button primary full" type="submit">Preview order ' + icon('arrow') + '</button></form></div><aside class="order-summary" id="checkout-summary"></aside></section>';
    renderOrderSummary(document.getElementById('checkout-summary'));
    document.getElementById('checkout-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var total = cart.subtotal();
      document.getElementById('main').innerHTML = '<section class="confirmation"><span class="success-icon">' + icon('check') + '</span><p class="eyebrow">CLIENT PREVIEW</p><h1>Online ordering will be enabled at launch. ♡</h1><p>No payment was taken and no order was sent. Your cart remains saved in this browser.</p><div class="confirmation-card"><span>Preview total</span><strong>' + window.formatINR(total) + '</strong><span>Payment status</span><strong>Not available</strong></div><a class="button primary" href="shop.html">Keep browsing</a></section>';
    });
  }

  function renderOrderSummary(target) {
    var lines = cart.getCart();
    target.innerHTML = '<h2>Your order</h2>' + lines.map(function (line) { var product = cart.productById(line.productId); if (!product) return ''; return '<div class="summary-line"><img src="' + product.image + '" alt="" style="object-position:' + escapeHTML(product.imagePosition) + '"><div><strong>' + escapeHTML(product.name) + '</strong><small>' + escapeHTML(line.variant) + ' · Qty ' + line.quantity + (line.personalisation ? ' · ' + escapeHTML(line.personalisation) : '') + (line.giftMessage ? ' · Gift note: ' + escapeHTML(line.giftMessage) : '') + '</small></div><span>' + window.formatINR(cart.unitPrice(line) * line.quantity) + '</span></div>'; }).join('') + '<dl><div><dt>Subtotal</dt><dd>' + window.formatINR(cart.subtotal()) + '</dd></div><div><dt>Customisation</dt><dd>Included above</dd></div><div><dt>Shipping</dt><dd>To be confirmed</dd></div><div class="total"><dt>Total</dt><dd>' + window.formatINR(cart.subtotal()) + '</dd></div></dl>';
  }

  var policies = {
    shipping: { title: 'Shipping Policy', intro: 'A clear home for dispatch, delivery and shipping information.', items: ['[SHIPPING FEE TO BE CONFIRMED]', '[DELIVERY TIMELINES TO BE CONFIRMED]', 'Made-to-order preparation times will be confirmed before an order is accepted.'] },
    returns: { title: 'Returns & Refunds', intro: 'This policy will be finalised after the owner approves the terms.', items: ['[RETURN WINDOW TO BE CONFIRMED]', '[ELIGIBILITY FOR RETURNS TO BE CONFIRMED]', '[CANCELLATION POLICY TO BE CONFIRMED]'] },
    privacy: { title: 'Privacy Policy', intro: 'The final privacy notice will explain how customer information is handled.', items: ['This static preview stores cart and wishlist data only in your browser.', '[DATA RETENTION TERMS TO BE CONFIRMED]', 'Contact: luniyasejal50@gmail.com'] },
    terms: { title: 'Terms & Conditions', intro: 'The final store terms will be published once reviewed and approved.', items: ['[ORDER ACCEPTANCE TERMS TO BE CONFIRMED]', '[CUSTOM PRODUCT TERMS TO BE CONFIRMED]', '[DISPUTE AND GOVERNING LAW TERMS TO BE CONFIRMED]'] },
    copyright: { title: 'Copyright & Intellectual Property', intro: 'The original creative work and materials published by TheKeeplily Co. are protected by applicable intellectual property laws.', items: ['© 2026 TheKeeplily Co. All rights reserved. TheKeeplily Co. is owned by Sejal Luniya.', 'Website text, product descriptions, original product designs, photographs, graphics, logos, branding and other original creative materials are the property of TheKeeplily Co. or their respective rights holders.', 'You may view and share links to this website for personal, non-commercial purposes. You may not copy, reproduce, republish, modify, distribute, sell, commercially exploit or create derivative works from our content, photographs, designs or branding without prior written permission from the relevant rights holder.', 'Product names, images and descriptions are provided for the purpose of presenting TheKeeplily Co. products. Product photographs and designs may not be reused to advertise or sell another product without permission.', 'To request permission or report a suspected infringement, contact luniyasejal50@gmail.com.', 'Nothing on this page transfers ownership of intellectual property to a visitor. Any third-party names or materials remain the property of their respective owners.'] }
  };

  function renderPolicy(name) {
    var policy = policies[name];
    document.getElementById('main').innerHTML = '<section class="policy-page"><p class="eyebrow">STORE INFORMATION</p><h1>' + policy.title + '</h1><p class="policy-intro">' + policy.intro + '</p><div class="policy-card"><p class="placeholder-notice">✦ Editable owner-approved terms</p>' + policy.items.map(function (item) { return '<p>' + escapeHTML(item) + '</p>'; }).join('') + '<p>Last updated: to be confirmed by TheKeeplily Co.</p></div><a class="text-link" href="contact.html">Need help? Contact us ' + icon('arrow') + '</a></section>';
  }

  function renderNotFound() {
    document.getElementById('main').innerHTML = '<section class="empty-page"><span class="big-404">404</span><h1>This little page wandered away.</h1><p>Let’s take you back to something lovely.</p><a href="shop.html" class="button primary">Visit the shop</a></section>';
  }

  function renderCart() {
    var target = document.getElementById('cart-drawer-content');
    if (!target) return;
    var lines = cart.getCart();
    document.querySelector('[data-cart-caption]').textContent = lines.length ? 'Saved here while you keep looking.' : 'A lovely little thing could live here.';
    if (!lines.length) {
      target.innerHTML = '<div class="cart-empty"><span class="empty-icon">♡</span><h3>Your bag feels a little light</h3><p>Find a handmade piece for someone special—or for you.</p><a href="shop.html" class="button primary">Find a little favourite</a></div>';
      return;
    }
    target.innerHTML = '<div class="cart-lines">' + lines.map(function (line) { var product = cart.productById(line.productId); if (!product) return ''; return '<article><img src="' + product.image + '" alt="" style="object-position:' + escapeHTML(product.imagePosition) + '"><div><strong>' + escapeHTML(product.name) + '</strong><small>' + escapeHTML(line.variant) + (line.personalisation ? ' · ' + escapeHTML(line.personalisation) : '') + (line.giftMessage ? ' · Gift note: ' + escapeHTML(line.giftMessage) : '') + '</small><span>' + window.formatINR(cart.unitPrice(line)) + '</span><div class="mini-quantity"><button type="button" data-cart-delta="-1" data-cart-key="' + escapeHTML(line.key) + '" aria-label="Decrease">' + icon('minus') + '</button><span>' + line.quantity + '</span><button type="button" data-cart-delta="1" data-cart-key="' + escapeHTML(line.key) + '" aria-label="Increase">' + icon('plus') + '</button></div></div><button class="remove-line" type="button" data-cart-remove="' + escapeHTML(line.key) + '" aria-label="Remove ' + escapeHTML(product.name) + '">' + icon('close') + '</button></article>'; }).join('') + '</div><div class="cart-footer"><div><span>Subtotal</span><strong>' + window.formatINR(cart.subtotal()) + '</strong></div><p>Shipping is confirmed before ordering.</p><a href="checkout.html" class="button primary full">Checkout preview ' + icon('arrow') + '</a><button type="button" class="continue-button" data-drawer-close>Continue shopping</button></div>';
  }

  function updateCartCount() {
    document.querySelectorAll('[data-cart-count]').forEach(function (node) { node.textContent = cart.count(); });
  }

  function refreshWishlistButtons() {
    var wishlist = cart.getWishlist();
    document.querySelectorAll('[data-wish]').forEach(function (button) { var active = wishlist.indexOf(button.dataset.wish) >= 0; button.classList.toggle('active', active); button.textContent = active ? '♥' : '♡'; button.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist'); });
  }

  function openDrawer(id) {
    closeDrawers();
    var drawer = document.getElementById(id);
    if (id === 'cart-drawer') renderCart();
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    var closeButton = drawer.querySelector('.drawer-close');
    if (closeButton) closeButton.focus();
  }

  function closeDrawers() {
    document.querySelectorAll('.drawer-layer').forEach(function (drawer) { drawer.hidden = true; });
    document.body.classList.remove('drawer-open');
  }

  function showToast(message) {
    var toast = document.getElementById('site-toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function bindGlobalEvents() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-menu-open],[data-cart-open],[data-drawer-close],[data-add],[data-wish],[data-cart-delta],[data-cart-remove]');
      if (!button) return;
      if (button.hasAttribute('data-menu-open')) openDrawer('menu-drawer');
      if (button.hasAttribute('data-cart-open')) openDrawer('cart-drawer');
      if (button.hasAttribute('data-drawer-close')) closeDrawers();
      if (button.dataset.add) { cart.add(button.dataset.add); openDrawer('cart-drawer'); showToast('Added to your little bag ♡'); }
      if (button.dataset.wish) { cart.toggleWishlist(button.dataset.wish); refreshWishlistButtons(); showToast(button.classList.contains('active') ? 'Saved to your wishlist ♡' : 'Removed from wishlist'); }
      if (button.dataset.cartDelta) cart.updateQuantity(button.dataset.cartKey, Number(button.dataset.cartDelta));
      if (button.dataset.cartRemove) cart.remove(button.dataset.cartRemove);
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeDrawers(); });
    document.getElementById('header-search').addEventListener('submit', function (event) { event.preventDefault(); var value = document.getElementById('header-search-input').value.trim(); if (value) window.location.href = 'shop.html?q=' + encodeURIComponent(value); });
    window.addEventListener('keeplily:cartchange', function () { updateCartCount(); renderCart(); });
    window.addEventListener('storage', function () { updateCartCount(); renderCart(); refreshWishlistButtons(); });
  }

  function init() {
    shell();
    bindGlobalEvents();
    var page = document.body.dataset.page || 'home';
    var titles = { home: 'TheKeeplily Co. | Little gifts, big feelings.', shop: 'Shop | TheKeeplily Co.', about: 'About | TheKeeplily Co.', owner: 'Owner | TheKeeplily Co.', contact: 'Contact | TheKeeplily Co.', custom: 'Custom Gifts | TheKeeplily Co.', checkout: 'Checkout Preview | TheKeeplily Co.', shipping: 'Shipping Policy | TheKeeplily Co.', returns: 'Returns & Refunds | TheKeeplily Co.', privacy: 'Privacy Policy | TheKeeplily Co.', terms: 'Terms & Conditions | TheKeeplily Co.', 'not-found': 'Page not found | TheKeeplily Co.' };
    if (titles[page]) document.title = titles[page];
    if (page === 'home') renderHome();
    else if (page === 'shop') renderShop();
    else if (page === 'product') renderProduct();
    else if (page === 'about') renderAbout();
    else if (page === 'owner') renderOwner();
    else if (page === 'contact') renderContact();
    else if (page === 'custom') renderCustomGifts();
    else if (page === 'checkout') renderCheckout();
    else if (policies[page]) renderPolicy(page);
    else renderNotFound();
    refreshWishlistButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
