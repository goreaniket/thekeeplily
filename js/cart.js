(function () {
  'use strict';

  var CART_KEY = 'keeplily-cart';
  var WISHLIST_KEY = 'keeplily-wishlist';

  function read(key, fallback) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed === null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value, eventName) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(eventName, { detail: value }));
  }

  function productById(id) {
    return window.KEEPLILY_PRODUCTS.find(function (product) { return product.id === id; });
  }

  function unitPrice(line) {
    var product = productById(line.productId);
    if (!product) return 0;
    var base = product.salePrice === null || product.salePrice === undefined ? product.price : product.salePrice;
    var variantPrice = product.variantPricing[line.variant] || 0;
    var customisationPrice = line.customisation ? product.customisationCharge : 0;
    return base + variantPrice + customisationPrice;
  }

  function getCart() {
    var cart = read(CART_KEY, []);
    return Array.isArray(cart) ? cart : [];
  }

  function setCart(cart) {
    write(CART_KEY, cart, 'keeplily:cartchange');
    return cart;
  }

  function add(productId, options) {
    var product = productById(productId);
    if (!product) return getCart();
    var settings = options || {};
    var line = {
      productId: productId,
      variant: settings.variant || product.variants[0],
      personalisation: settings.personalisation || '',
      customisation: Boolean(settings.customisation),
      giftMessage: settings.giftMessage || '',
      quantity: Math.max(1, Number(settings.quantity) || 1)
    };
    line.key = [line.productId, line.variant, line.personalisation, line.customisation, line.giftMessage].join('|');
    var cart = getCart();
    var existing = cart.find(function (item) { return item.key === line.key; });
    if (existing) existing.quantity += line.quantity;
    else cart.push(line);
    return setCart(cart);
  }

  function updateQuantity(key, delta) {
    var cart = getCart().map(function (line) {
      if (line.key === key) line.quantity = Math.max(0, line.quantity + delta);
      return line;
    }).filter(function (line) { return line.quantity > 0; });
    return setCart(cart);
  }

  function remove(key) {
    return setCart(getCart().filter(function (line) { return line.key !== key; }));
  }

  function clear() {
    return setCart([]);
  }

  function count() {
    return getCart().reduce(function (total, line) { return total + line.quantity; }, 0);
  }

  function subtotal() {
    return getCart().reduce(function (total, line) { return total + unitPrice(line) * line.quantity; }, 0);
  }

  function getWishlist() {
    var list = read(WISHLIST_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function toggleWishlist(productId) {
    var list = getWishlist();
    list = list.indexOf(productId) >= 0
      ? list.filter(function (id) { return id !== productId; })
      : list.concat(productId);
    write(WISHLIST_KEY, list, 'keeplily:wishlistchange');
    return list;
  }

  window.KeeplilyCart = {
    getCart: getCart,
    setCart: setCart,
    add: add,
    updateQuantity: updateQuantity,
    remove: remove,
    clear: clear,
    count: count,
    subtotal: subtotal,
    unitPrice: unitPrice,
    productById: productById,
    getWishlist: getWishlist,
    toggleWishlist: toggleWishlist
  };
})();
