(function () {
  'use strict';

  var config = window.KEEPLILY_SUPABASE || {};
  var client = window.KEEPLILY_SUPABASE_CLIENT ||
    (window.supabase && config.url && config.anonKey
      ? window.supabase.createClient(config.url, config.anonKey)
      : null);
  if (client) window.KEEPLILY_SUPABASE_CLIENT = client;

  var $ = function (selector) { return document.querySelector(selector); };
  var authView = $('#account-auth');
  var dashboard = $('#account-dashboard');
  var messageNode = $('#account-message');
  var currentUser = null;
  var otpSentAt = 0;
  var otpCooldownTimer = null;
  var pageUrl = new URL(window.location.href);
  var recoveryMode = pageUrl.searchParams.get('mode') === 'update';
  var returnToCheckout = pageUrl.searchParams.get('return') === 'checkout.html';
  var removedCredentials = false;
  Array.from(pageUrl.searchParams.keys()).forEach(function (key) {
    if (key.toLowerCase() === 'email' || key.toLowerCase() === 'password') {
      pageUrl.searchParams.delete(key);
      removedCredentials = true;
    }
  });
  if (removedCredentials) {
    try {
      window.history.replaceState(null, '', pageUrl.pathname + pageUrl.search + pageUrl.hash);
    } catch (error) {
      console.warn('Sensitive sign-in query parameters could not be removed from browser history.');
    }
  }

  function message(text, isError) {
    messageNode.textContent = text || '';
    messageNode.classList.toggle('error', Boolean(isError));
  }

  function showAuthError(action, error) {
    var detail = error && typeof error.message === 'string' ? error.message.trim() : '';
    message(action + (detail ? ': ' + detail : '. Please try again.'), true);
  }

  function authClientAvailable() {
    if (window.location.protocol === 'file:') {
      message('Sign-in needs the hosted HTTPS site or a local HTTP server whose origin is allowed in Supabase Auth.', true);
      return false;
    }
    if (client) return true;
    message('Supabase Auth could not initialize. Check the connection and try again.', true);
    return false;
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function setAuthMode(mode) {
    document.querySelectorAll('[data-auth-mode]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.authMode === mode);
    });
    $('#signin-form').hidden = mode !== 'signin';
    $('#otp-form').hidden = mode !== 'otp';
    $('#signup-form').hidden = mode !== 'signup';
    $('#reset-form').hidden = mode !== 'reset';
    $('#password-form').hidden = true;
    if (mode !== 'otp') {
      $('#otp-code-label').hidden = true;
      $('#verify-otp-button').hidden = true;
      $('#otp-form').elements.token.required = false;
      $('#otp-form').elements.token.value = '';
    }
    if (client) message('');
    else authClientAvailable();
  }

  function redirectAfterSignIn() {
    if (returnToCheckout) {
      window.location.replace('checkout.html');
      return true;
    }
    return false;
  }

  function signupRedirectUrl() {
    var redirectUrl = new URL(window.location.pathname, window.location.origin);
    if (returnToCheckout) redirectUrl.searchParams.set('return', 'checkout.html');
    return redirectUrl.toString();
  }

  function startOtpCooldown() {
    var button = $('#send-otp-button');
    if (otpCooldownTimer) window.clearInterval(otpCooldownTimer);
    function updateCooldown() {
      var remaining = Math.ceil((otpSentAt + 60000 - Date.now()) / 1000);
      if (remaining <= 0) {
        window.clearInterval(otpCooldownTimer);
        otpCooldownTimer = null;
        button.disabled = false;
        button.textContent = 'Resend one-time code';
        return;
      }
      button.disabled = true;
      button.textContent = 'Resend code in ' + remaining + 's';
    }
    updateCooldown();
    otpCooldownTimer = window.setInterval(updateCooldown, 1000);
  }

  async function loadAddresses() {
    var result = await client.from('customer_addresses')
      .select('id,label,full_name,phone,address_line_1,address_line_2,landmark,city,state,postal_code,country,is_default')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (result.error) throw result.error;
    var list = $('#address-list');
    list.replaceChildren();
    if (!result.data.length) {
      list.textContent = 'No saved addresses yet.';
      return;
    }
    result.data.forEach(function (address) {
      var article = document.createElement('article');
      article.className = 'account-list-item';
      var text = document.createElement('p');
      text.textContent = [
        address.full_name, address.phone, address.address_line_1, address.address_line_2,
        address.landmark, address.city, address.state, address.postal_code, address.country
      ].filter(Boolean).join(' · ');
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button secondary';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async function () {
        if (!authClientAvailable()) return;
        remove.disabled = true;
        try {
          var deleted = await client.from('customer_addresses').delete()
            .eq('id', address.id).eq('user_id', currentUser.id);
          if (deleted.error) throw deleted.error;
          await loadAddresses();
          message('Address removed.');
        } catch (error) {
          showAuthError('The address could not be removed', error);
          remove.disabled = false;
        }
      });
      article.append(text, remove);
      list.appendChild(article);
    });
  }

  async function loadOrders() {
    var result = await client.from('orders')
      .select('id,order_number,status,payment_status,grand_total,created_at,order_items(name_snapshot,quantity,line_total)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (result.error) throw result.error;
    var list = $('#order-list');
    list.replaceChildren();
    if (!result.data.length) {
      list.textContent = 'Your order history will appear here.';
      return;
    }
    result.data.forEach(function (order) {
      var article = document.createElement('article');
      article.className = 'account-list-item account-order';
      var heading = document.createElement('strong');
      heading.textContent = order.order_number;
      var status = document.createElement('p');
      status.textContent = (order.status === 'payment_review'
        ? 'Payment received; order confirmation needs stock review'
        : 'Order: ' + order.status.replace(/_/g, ' ')) +
        ' · Payment: ' + order.payment_status.replace(/_/g, ' ') +
        ' · ' + new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(order.grand_total));
      var items = document.createElement('p');
      items.textContent = (order.order_items || []).map(function (item) {
        return item.name_snapshot + ' × ' + item.quantity;
      }).join(', ');
      article.append(heading, status, items);
      list.appendChild(article);
    });
  }

  async function loadDashboard(user) {
    currentUser = user;
    authView.hidden = true;
    dashboard.hidden = false;
    var results = await Promise.all([
      client.from('profiles').select('full_name,phone,role').eq('id', user.id).single(),
      client.from('customers').select('marketing_consent').eq('user_id', user.id).single()
    ]);
    if (results[0].error) throw results[0].error;
    $('#profile-form').elements.full_name.value = results[0].data.full_name || '';
    $('#profile-form').elements.phone.value = results[0].data.phone || '';
    var adminLink = $('#admin-dashboard-link');
    if (adminLink) adminLink.hidden = results[0].data.role !== 'admin';
    $('#profile-form').elements.marketing_consent.checked =
      !results[1].error && Boolean(results[1].data && results[1].data.marketing_consent);
    await Promise.all([loadAddresses(), loadOrders()]);
  }

  function showSignInForMissingConfiguration() {
    authView.hidden = false;
    dashboard.hidden = true;
    message('Supabase Auth could not initialize. Check the connection and try again.', true);
  }

  if (!client) {
    showSignInForMissingConfiguration();
  }

  document.querySelectorAll('[data-auth-mode]').forEach(function (button) {
    button.addEventListener('click', function () { setAuthMode(button.dataset.authMode); });
  });

  $('#send-otp-button').addEventListener('click', async function () {
    if (!authClientAvailable()) return;
    var button = this;
    var email = String($('#otp-form').elements.email.value || '').trim().toLowerCase();
    if (!email || !$('#otp-form').elements.email.reportValidity()) return;
    if (Date.now() < otpSentAt + 60000) {
      startOtpCooldown();
      return;
    }
    button.disabled = true;
    message('Sending a sign-in code…');
    try {
      var result = await client.auth.signInWithOtp({
        email: email,
        options: { shouldCreateUser: false }
      });
      if (result.error) throw result.error;
      otpSentAt = Date.now();
      $('#otp-code-label').hidden = false;
      $('#verify-otp-button').hidden = false;
      $('#otp-form').elements.token.required = true;
      message('If an account exists for this email, a sign-in code has been sent.');
      startOtpCooldown();
    } catch (error) {
      button.disabled = false;
      showAuthError('A sign-in code could not be sent', error);
    }
  });

  $('#otp-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!authClientAvailable()) return;
    var form = event.currentTarget;
    var button = $('#verify-otp-button');
    var email = String(form.elements.email.value || '').trim().toLowerCase();
    var token = String(form.elements.token.value || '').trim();
    button.disabled = true;
    message('Verifying your code…');
    try {
      var result = await client.auth.verifyOtp({ email: email, token: token, type: 'email' });
      if (result.error) throw result.error;
      if (!result.data.user) throw new Error('The verified account was not returned by Supabase.');
      if (!redirectAfterSignIn()) {
        await loadDashboard(result.data.user);
        message('You’re signed in.');
      }
    } catch (error) {
      showAuthError('Email code verification failed', error);
    } finally {
      button.disabled = false;
    }
  });

  $('#signin-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!authClientAvailable()) return;
    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var data = new FormData(form);
    button.disabled = true;
    message('Signing in…');
    var result;
    try {
      result = await client.auth.signInWithPassword({
        email: String(data.get('email')).trim().toLowerCase(),
        password: data.get('password')
      });
    } catch (error) {
      showAuthError('Sign-in failed', error);
      button.disabled = false;
      return;
    }
    if (result.error) {
      showAuthError('Sign-in failed', result.error);
      button.disabled = false;
      return;
    }
    if (!redirectAfterSignIn()) {
      try {
        await loadDashboard(result.data.user);
        message('You’re signed in.');
      } catch (error) {
        showAuthError('You’re signed in, but account details could not be loaded', error);
      }
    }
    button.disabled = false;
  });

  $('#signup-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!authClientAvailable()) return;
    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var data = new FormData(form);
    button.disabled = true;
    message('Creating your account…');
    try {
      var result = await client.auth.signUp({
        email: String(data.get('email')).trim().toLowerCase(),
        password: data.get('password'),
        options: {
          data: { full_name: String(data.get('full_name')).trim() },
          emailRedirectTo: signupRedirectUrl()
        }
      });
      if (result.error) {
        showAuthError('Account creation failed', result.error);
        return;
      }
      if (result.data.session) {
        if (redirectAfterSignIn()) return;
        try {
          await loadDashboard(result.data.user);
          message('Your account is ready.');
        } catch (error) {
          showAuthError('Your account was created, but account details could not be loaded', error);
        }
        return;
      }
      setAuthMode('signin');
      message('Check your email for the confirmation link. After confirming, you can sign in and continue to checkout.');
    } catch (error) {
      showAuthError('Account creation failed', error);
    } finally {
      button.disabled = false;
    }
  });

  $('#reset-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!authClientAvailable()) return;
    var email = String(new FormData(event.currentTarget).get('email')).trim().toLowerCase();
    message('Sending password reset link…');
    var resetRedirect = new URL(window.location.pathname, window.location.origin);
    resetRedirect.searchParams.set('mode', 'update');
    if (returnToCheckout) resetRedirect.searchParams.set('return', 'checkout.html');
    var result;
    try {
      result = await client.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirect.toString()
      });
    } catch (error) {
      showAuthError('Password reset failed', error);
      return;
    }
    if (result.error) {
      showAuthError('Password reset failed', result.error);
      return;
    }
    message('If an account exists for that email, a password reset link is on its way.');
  });

  $('#password-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!authClientAvailable()) return;
    var password = new FormData(event.currentTarget).get('password');
    var result;
    try {
      result = await client.auth.updateUser({ password: password });
    } catch (error) {
      showAuthError('Password update failed', error);
      return;
    }
    if (result.error) {
      showAuthError('Password update failed', result.error);
      return;
    }
    recoveryMode = false;
    var signInUrl = new URL(window.location.pathname, window.location.origin);
    if (returnToCheckout) signInUrl.searchParams.set('return', 'checkout.html');
    history.replaceState(null, '', signInUrl.pathname + signInUrl.search);
    setAuthMode('signin');
    message('Your password has been updated. Please sign in.');
  });

  $('#profile-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!authClientAvailable() || !currentUser) return;
    var data = new FormData(event.currentTarget);
    try {
      var updated = await client.from('profiles').update({
        full_name: String(data.get('full_name')).trim(),
        phone: String(data.get('phone') || '').trim() || null
      }).eq('id', currentUser.id);
      if (updated.error) throw updated.error;
      var preference = await client.from('customers').update({
        marketing_consent: data.has('marketing_consent')
      }).eq('user_id', currentUser.id);
      if (preference.error) throw preference.error;
      message('Your details have been saved.');
    } catch (error) {
      showAuthError('Your details could not be saved', error);
    }
  });

  $('#address-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!authClientAvailable() || !currentUser) return;
    var data = new FormData(event.currentTarget);
    try {
      var inserted = await client.from('customer_addresses').insert({
        user_id: currentUser.id,
        full_name: String(data.get('full_name')).trim(),
        phone: String(data.get('phone')).trim(),
        address_line_1: String(data.get('address_line_1')).trim(),
        address_line_2: String(data.get('address_line_2')).trim() || null,
        landmark: String(data.get('landmark')).trim() || null,
        city: String(data.get('city')).trim(),
        state: String(data.get('state')).trim(),
        postal_code: String(data.get('postal_code')).trim(),
        country: 'India'
      });
      if (inserted.error) throw inserted.error;
      event.currentTarget.reset();
      await loadAddresses();
      message('Address added.');
    } catch (error) {
      showAuthError('The address could not be saved', error);
    }
  });

  $('#account-signout').addEventListener('click', async function () {
    if (!authClientAvailable()) return;
    var result;
    try {
      result = await client.auth.signOut();
    } catch (error) {
      showAuthError('Sign-out failed', error);
      return;
    }
    if (result.error) {
      showAuthError('Sign-out failed', result.error);
      return;
    }
    dashboard.hidden = true;
    authView.hidden = false;
    setAuthMode('signin');
    message('You’re signed out.');
  });

  if (client && window.location.protocol !== 'file:') {
    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') {
        authView.hidden = false;
        dashboard.hidden = true;
        $('#signin-form').hidden = true;
        $('#signup-form').hidden = true;
        $('#reset-form').hidden = true;
        $('#password-form').hidden = false;
        return;
      }
      if (!session) {
        dashboard.hidden = true;
        authView.hidden = false;
      }
    });

    client.auth.getSession().then(async function (result) {
      if (result.error) {
        showAuthError('Your saved session could not be checked', result.error);
        return;
      }
      if (recoveryMode && result.data.session) {
        $('#signin-form').hidden = true;
        $('#signup-form').hidden = true;
        $('#reset-form').hidden = true;
        $('#password-form').hidden = false;
      } else if (result.data.session) {
        try {
          if (!redirectAfterSignIn()) await loadDashboard(result.data.session.user);
        } catch (error) {
          showAuthError('Your account details could not be loaded', error);
        }
      }
    }).catch(function (error) {
      showAuthError('Your saved session could not be checked', error);
    });
  }
})();
