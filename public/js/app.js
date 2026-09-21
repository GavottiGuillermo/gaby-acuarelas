const grid = document.querySelector('#course-grid');
const catalogCount = document.querySelector('#catalog-count');
const loadMoreButton = document.querySelector('#load-more');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const cartDialog = document.querySelector('#cart-dialog');
const cartItems = document.querySelector('#cart-items');
const cartEmpty = document.querySelector('#cart-empty');
const cartSummary = document.querySelector('#cart-summary');
const cartTotal = document.querySelector('#cart-total');
const cartPromotion = document.querySelector('#cart-promotion');
const cartCount = document.querySelector('#cart-count');
const checkoutForm = document.querySelector('#checkout-form');
const formStatus = document.querySelector('#form-status');

const PAGE_SIZE = 12;
const PAYPAL_RETURN_STATUSES = new Map([
  ['pending_webhook', 'PayPal registró la captura sandbox. La orden queda pendiente hasta recibir y conciliar el webhook firmado.'],
  ['cancelled', 'Cancelaste el pago sandbox en PayPal. Podés volver a intentarlo desde el carrito.']
]);
const state = {
  products: [],
  filter: 'all',
  visible: PAGE_SIZE,
  cart: new Set(),
  runtime: {
    payments: {
      paypal: 'disabled',
      mercadopago: 'disabled'
    }
  },
  submitting: false
};

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function courseCard(course, index) {
  const article = createElement('article', 'course-card');
  article.style.setProperty('--card-delay', `${Math.min(index, 11) * 45}ms`);

  const media = createElement('div', 'course-media');
  media.style.backgroundImage = `url("${course.image}")`;
  media.style.backgroundPosition = course.imagePosition;
  media.setAttribute('role', 'img');
  media.setAttribute('aria-label', course.imageAlt);

  media.appendChild(createElement('span', 'course-number', String(index + 1).padStart(2, '0')));
  if (course.priceStatus === 'provisional') {
    media.appendChild(createElement('span', 'course-badge', 'Valor provisorio'));
  }

  const body = createElement('div', 'course-body');
  body.appendChild(createElement('p', 'eyebrow', `${course.levelLabel} · ${course.durationLabel}`));
  body.appendChild(createElement('h3', '', course.title));
  body.appendChild(createElement('p', 'course-type', course.classTypeLabel));
  body.appendChild(createElement('p', 'course-description', course.description));

  const footer = createElement('div', 'course-footer');
  const price = createElement('div', 'course-price');
  price.appendChild(createElement('span', '', 'Precio en dólares'));
  price.appendChild(createElement('strong', '', usd.format(course.priceUsd)));

  const button = createElement('button', 'card-action');
  button.type = 'button';
  button.dataset.productId = course.id;
  updateAddButton(button, course);
  button.addEventListener('click', () => toggleCart(course.id));

  footer.append(price, button);
  body.appendChild(footer);
  article.append(media, body);
  return article;
}

function filteredCourses() {
  const courses = state.products.filter((product) => product.type === 'course');
  if (state.filter === 'all') return courses;
  const level = Number(state.filter);
  return courses.filter((course) => course.level.includes(level));
}

function renderCatalog() {
  const filtered = filteredCourses();
  const visible = filtered.slice(0, state.visible);
  grid.replaceChildren(...visible.map(courseCard));
  grid.setAttribute('aria-busy', 'false');
  catalogCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'clase' : 'clases'}`;
  loadMoreButton.hidden = state.visible >= filtered.length;
}

function updateAddButton(button, product) {
  const added = state.cart.has(product.id);
  button.textContent = added ? 'Quitar del carrito' : 'Agregar al carrito';
  button.classList.toggle('added', added);
  button.setAttribute('aria-label', `${added ? 'Quitar' : 'Agregar'} ${product.title} ${added ? 'del' : 'al'} carrito`);
}

function updateAllAddButtons() {
  document.querySelectorAll('[data-product-id]').forEach((button) => {
    const product = state.products.find((item) => item.id === button.dataset.productId);
    if (product) updateAddButton(button, product);
  });

  document.querySelectorAll('[data-add-product]').forEach((button) => {
    const added = state.cart.has(button.dataset.addProduct);
    button.textContent = added ? 'Quitar del carrito' : 'Agregar al carrito';
    button.classList.toggle('added', added);
  });
}

function toggleCart(productId) {
  if (state.cart.has(productId)) state.cart.delete(productId);
  else state.cart.add(productId);
  sessionStorage.setItem('gaby-cart', JSON.stringify([...state.cart]));
  formStatus.textContent = '';
  updateAllAddButtons();
  renderCart();
}

function renderCart() {
  const selected = state.products.filter((product) => state.cart.has(product.id));
  document.body.classList.toggle('has-cart', selected.length > 0);
  cartCount.textContent = String(selected.length);
  cartCount.setAttribute('aria-label', `${selected.length} ${selected.length === 1 ? 'producto' : 'productos'} en el carrito`);
  cartEmpty.hidden = selected.length > 0;
  cartSummary.hidden = selected.length === 0;
  checkoutForm.hidden = selected.length === 0;

  cartItems.replaceChildren(...selected.map((product) => {
    const row = createElement('div', 'cart-item');
    const thumbnail = createElement('div', 'cart-item-thumbnail');
    thumbnail.style.backgroundImage = `url("${product.image}")`;
    thumbnail.style.backgroundPosition = product.imagePosition || 'center';
    thumbnail.classList.toggle('ebook-thumbnail', product.type === 'ebook');
    thumbnail.setAttribute('aria-hidden', 'true');

    const copy = createElement('div', 'cart-item-copy');
    copy.appendChild(createElement('strong', '', product.title));
    copy.appendChild(createElement('small', '', product.type === 'ebook'
      ? 'Ebook PDF'
      : `${product.classTypeLabel} · ${product.levelLabel} · ${product.durationLabel}`));

    const actions = createElement('div', 'cart-item-actions');
    const price = createElement('span', 'cart-item-price', usd.format(product.priceUsd));
    const remove = createElement('button', 'cart-remove', 'Quitar');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Quitar ${product.title}`);
    remove.addEventListener('click', () => toggleCart(product.id));
    actions.append(price, remove);
    row.append(thumbnail, copy, actions);
    return row;
  }));

  const total = selected.reduce((sum, product) => sum + product.priceUsd, 0);
  cartTotal.textContent = usd.format(total);
  const selectedCourses = selected.filter((product) => product.type === 'course').length;
  cartPromotion.textContent = selectedCourses >= 2
    ? 'Ya armaste un combo. El descuento se definirá próximamente; el subtotal todavía usa precios de lista.'
    : 'Agregá dos o más clases para armar tu combo con promoción.';
}

function openCart() {
  renderCart();
  if (!cartDialog.open) cartDialog.showModal();
}

function selectedProducts() {
  return state.products.filter((product) => state.cart.has(product.id));
}

function getCheckoutCustomer() {
  const formData = new FormData(checkoutForm);
  return {
    firstName: String(formData.get('firstName') || '').trim(),
    lastName: String(formData.get('lastName') || '').trim(),
    email: String(formData.get('email') || '').trim().toLowerCase()
  };
}

function secureRandomHex(byteLength = 16) {
  if (!window.crypto?.getRandomValues) {
    throw new Error('Este navegador no puede generar una clave segura para iniciar el pedido.');
  }

  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function idempotencyKeyFor(customer, items) {
  if (!window.crypto?.subtle) {
    throw new Error('Este navegador no puede proteger la clave del pedido.');
  }

  const requestFingerprint = JSON.stringify({
    customer,
    items: items.map((item) => item.productId).sort()
  });
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(requestFingerprint)
  );
  const fingerprint = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const storageKey = `gaby-order:${fingerprint}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const idempotencyKey = `web-${secureRandomHex()}`;
  sessionStorage.setItem(storageKey, idempotencyKey);
  return idempotencyKey;
}

function paypalSandboxApprovalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PayPal no devolvió una URL de aprobación válida.');
  }

  const sandboxHost = url.hostname === 'sandbox.paypal.com'
    || url.hostname.endsWith('.sandbox.paypal.com');
  if (url.protocol !== 'https:' || !sandboxHost) {
    throw new Error('El servidor no devolvió una URL de PayPal Sandbox.');
  }
  return url.href;
}

function clearPayPalReturnParameters() {
  const url = new URL(window.location.href);
  ['paypal', 'orderId', 'token', 'PayerID'].forEach((name) => url.searchParams.delete(name));
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'No se pudo completar la solicitud.');
  }
  return payload;
}

function setSubmitting(value) {
  state.submitting = value;
  checkoutForm.querySelectorAll('button, input').forEach((control) => {
    control.disabled = value;
  });
  checkoutForm.setAttribute('aria-busy', String(value));
}

async function loadRuntime() {
  try {
    state.runtime = await fetch('/api/runtime').then((response) => {
      if (!response.ok) throw new Error('runtime unavailable');
      return response.json();
    });
  } catch {
    state.runtime = {
      payments: {
        paypal: 'disabled',
        mercadopago: 'disabled'
      }
    };
  }
}

async function loadCatalog() {
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
    const data = await response.json();
    state.products = data.courses;
    const validProductIds = new Set(state.products.map((product) => product.id));
    let persistedCart = [];
    try {
      const storedCart = JSON.parse(sessionStorage.getItem('gaby-cart') || '[]');
      if (Array.isArray(storedCart)) persistedCart = storedCart;
    } catch {
      sessionStorage.removeItem('gaby-cart');
    }
    state.cart = new Set(persistedCart.filter((productId) => validProductIds.has(productId)));
    renderCatalog();
    renderCart();
  } catch (error) {
    grid.replaceChildren(createElement('p', 'error', `${error.message} Intentá nuevamente en unos minutos.`));
    grid.setAttribute('aria-busy', 'false');
  }
}

async function startPayPalCheckout() {
  if (state.runtime?.payments?.paypal !== 'sandbox') {
    formStatus.textContent = 'PayPal sandbox todavía no está disponible en este entorno.';
    return;
  }

  const customer = getCheckoutCustomer();
  const items = selectedProducts().map((product) => ({ productId: product.id }));
  const idempotencyKey = await idempotencyKeyFor(customer, items);

  formStatus.textContent = 'Creando la orden sandbox...';
  const orderPayload = await requestJson('/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ customer, items })
  });

  formStatus.textContent = 'Abriendo PayPal sandbox...';
  const checkoutPayload = await requestJson('/api/checkout/paypal', {
    method: 'POST',
    body: JSON.stringify({ orderId: orderPayload.order.id })
  });

  window.location.assign(paypalSandboxApprovalUrl(checkoutPayload.checkout?.approveUrl));
}

async function capturePayPalReturn() {
  const params = new URLSearchParams(window.location.search);
  const paypalStatus = params.get('paypal');
  if (!paypalStatus) return;

  const orderId = params.get('orderId');
  const providerOrderId = params.get('token');

  if (paypalStatus === 'cancel') {
    clearPayPalReturnParameters();
    formStatus.textContent = PAYPAL_RETURN_STATUSES.get('cancelled');
    openCart();
    return;
  }

  if (paypalStatus !== 'return' || !orderId || !providerOrderId) {
    clearPayPalReturnParameters();
    formStatus.textContent = 'No pudimos leer el retorno de PayPal sandbox. Revisá la orden desde el panel.';
    openCart();
    return;
  }

  try {
    formStatus.textContent = 'Confirmando la captura sandbox con el servidor...';
    const payload = await requestJson('/api/payments/paypal/capture', {
      method: 'POST',
      body: JSON.stringify({ orderId, providerOrderId })
    });
    formStatus.textContent = PAYPAL_RETURN_STATUSES.get(payload.payment.status)
      || 'Captura sandbox registrada. Esperando conciliación por webhook.';
    clearPayPalReturnParameters();
  } catch (error) {
    formStatus.textContent = `${error.message} Si PayPal ya aprobó el pago, esperá el webhook antes de reintentar.`;
  }
  openCart();
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    state.visible = PAGE_SIZE;
    filterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderCatalog();
  });
});

loadMoreButton.addEventListener('click', () => {
  state.visible += PAGE_SIZE;
  renderCatalog();
});

document.querySelector('#cart-open').addEventListener('click', openCart);
document.querySelectorAll('[data-open-cart]').forEach((button) => button.addEventListener('click', openCart));
document.querySelectorAll('[data-add-product]').forEach((button) => {
  button.addEventListener('click', () => {
    toggleCart(button.dataset.addProduct);
    openCart();
  });
});

cartDialog.querySelector('.dialog-close').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('click', (event) => {
  const bounds = cartDialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) cartDialog.close();
});

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.cart.size === 0 || state.submitting) return;
  if (!checkoutForm.reportValidity()) return;
  const provider = event.submitter?.dataset.paymentProvider;
  setSubmitting(true);
  try {
    if (provider === 'mercadopago') {
      formStatus.textContent = 'Mercado Pago se habilitará cuando confirmemos los importes en ARS; no hay cobros por ese medio todavía.';
      return;
    }
    if (provider === 'paypal') {
      await startPayPalCheckout();
      return;
    }
    formStatus.textContent = 'Elegí un medio de pago válido.';
  } catch (error) {
    formStatus.textContent = error.message;
  } finally {
    setSubmitting(false);
  }
});

document.querySelector('#year').textContent = new Date().getFullYear();
Promise.all([loadCatalog(), loadRuntime()]).then(capturePayPalReturn);
