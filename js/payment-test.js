(function () {
  'use strict';

  var cart = window.KeeplilyCart;
  if (!cart) {
    window.alert('Payment test could not load. Please refresh and try again.');
    return;
  }

  var lines = cart.getCart();
  var alreadyOnlyTest = lines.length === 1 && lines[0].productId === 'kl-live-test';

  if (lines.length > 0 && !alreadyOnlyTest) {
    window.alert('Your existing bag was left unchanged. Empty your bag first, then reopen the ₹1 payment test link.');
    window.location.replace('shop.html');
    return;
  }

  if (!alreadyOnlyTest) {
    cart.add('kl-live-test', { variant: 'Payment test', quantity: 1 });
  }
})();
