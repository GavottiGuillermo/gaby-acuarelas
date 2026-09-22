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
const purchaseSuccessDialog = document.querySelector('#purchase-success-dialog');
const purchaseSuccessItems = document.querySelector('#purchase-success-items');
const purchaseSuccessTotal = document.querySelector('#purchase-success-total');
const purchaseSuccessReference = document.querySelector('#purchase-success-reference');
const purchaseSuccessDelivery = document.querySelector('#purchase-success-delivery');
const purchaseSuccessView = document.querySelector('#purchase-success-view');
const purchaseProcessingView = document.querySelector('#purchase-processing-view');
const purchaseProcessingTitle = document.querySelector('#purchase-processing-title');
const purchaseProcessingDescription = document.querySelector('#purchase-processing-description');
const purchaseProcessingNote = document.querySelector('#purchase-processing-note');
const purchaseProcessingOrder = document.querySelector('#purchase-processing-order');
const purchaseProcessingSummary = document.querySelector('#purchase-processing-summary');

const PAGE_SIZE = 12;
const PAYPAL_ORDER_FAST_POLL_ATTEMPTS = 15;
const PAYPAL_ORDER_FAST_POLL_INTERVAL_MS = 1000;
const PAYPAL_ORDER_BACKGROUND_POLL_ATTEMPTS = 57;
const PAYPAL_ORDER_BACKGROUND_POLL_INTERVAL_MS = 5000;
const PAYPAL_CLOSED_DIALOG_POLL_INTERVAL_MS = 3000;
const PAYPAL_CLOSED_DIALOG_POLL_ATTEMPTS = 200;
const PAYPAL_PENDING_ORDER_KEY = 'gaby-paypal-pending-order';
const PAYPAL_CANCELLED_MESSAGE = 'Cancelaste el pago sandbox en PayPal. Podés volver a intentarlo desde el carrito.';
const PAYPAL_ORDER_STATUSES = new Map([
  ['rejected', {
    tone: 'error',
    message: 'PayPal informó que el pago sandbox fue rechazado. La orden no fue aprobada y no se realizará ninguna entrega.'
  }],
  ['cancelled', {
    tone: 'warning',
    message: 'PayPal informó que el pago sandbox fue cancelado. La orden no fue aprobada y podés iniciar una nueva prueba.'
  }],
  ['refunded', {
    tone: 'warning',
    message: 'PayPal informó la devolución del pago sandbox. No se realizará ninguna entrega automática.'
  }]
]);
const PAYPAL_PROCESSING_COPY = {
  waiting: {
    title: 'Estamos confirmando tu pago',
    description: 'Estamos registrando la captura y esperando la confirmación segura del webhook de PayPal.',
    note: 'No necesitás volver a pagar. Esta operación no se considera aprobada hasta recibir el webhook firmado.'
  },
  delayed: {
    title: 'Tu pago sigue en proceso',
    description: 'PayPal todavía no envió la confirmación final. En ocasiones puede demorar unos minutos.',
    note: 'No vuelvas a pagar. Podés cerrar esta ventana y seguir navegando: continuaremos consultando y te avisaremos cuando se confirme.'
  },
  error: {
    title: 'Todavía no pudimos confirmar el pago',
    description: 'No pudimos consultar el estado final en este momento. La orden queda guardada para volver a revisarla.',
    note: 'No se considera aprobada y no se realizará ninguna entrega. No vuelvas a pagar hasta confirmar su estado.'
  }
};
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
  submitting: false,
  finalizedPayPalOrderId: null
};
let closedDialogPayPalMonitor = null;

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

function showFormStatus(message, tone = 'info') {
  formStatus.textContent = message;
  formStatus.dataset.tone = message ? tone : '';
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
  showFormStatus('');
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
    const error = new Error(payload.error || 'No se pudo completar la solicitud.');
    error.code = payload.code || 'request_failed';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function rememberPendingPayPalOrder(orderId) {
  try {
    sessionStorage.setItem(PAYPAL_PENDING_ORDER_KEY, orderId);
  } catch {
    // La consulta inmediata sigue funcionando aunque el navegador bloquee el almacenamiento.
  }
}

function pendingPayPalOrder() {
  try {
    return sessionStorage.getItem(PAYPAL_PENDING_ORDER_KEY);
  } catch {
    return null;
  }
}

function forgetPendingPayPalOrder() {
  try {
    sessionStorage.removeItem(PAYPAL_PENDING_ORDER_KEY);
  } catch {
    // No hay estado sensible: sólo se intenta limpiar un identificador interno.
  }
}

function clearCompletedCart() {
  state.cart.clear();
  checkoutForm.reset();
  showFormStatus('');

  try {
    sessionStorage.removeItem('gaby-cart');
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith('gaby-order:')) sessionStorage.removeItem(key);
    }
  } catch {
    // La interfaz queda limpia aunque el navegador bloquee el almacenamiento.
  }

  updateAllAddButtons();
  renderCart();
}

function deliveryDetailsFor(order) {
  const productTypes = new Set((order.items || []).map((item) => item.productType));
  const details = [
    'La confirmación de pago y la referencia de tu pedido.'
  ];

  if (productTypes.has('course')) {
    details.push('Para las clases, un enlace seguro con videos, fotos de guía y, cuando corresponda, patrones o videos de práctica.');
  }
  if (productTypes.has('ebook')) {
    details.push('Para el ebook, un enlace protegido para descargar el PDF.');
  }
  return details;
}

function updateProcessingSummary(order = null) {
  const orderItems = Array.isArray(order?.items) ? order.items : null;
  const localItems = selectedProducts();
  const itemCount = orderItems
    ? orderItems.reduce((total, item) => total + Number(item.quantity || 1), 0)
    : localItems.length;
  const total = orderItems
    ? Number(order.totalAmountCents) / 100
    : localItems.reduce((sum, product) => sum + product.priceUsd, 0);

  purchaseProcessingOrder.hidden = itemCount === 0;
  purchaseProcessingSummary.textContent = itemCount > 0
    ? `${itemCount} ${itemCount === 1 ? 'producto' : 'productos'} · ${usd.format(total)}`
    : '';
}

function showPurchaseProcessing(mode = 'waiting', order = null, openDialog = true) {
  const copy = PAYPAL_PROCESSING_COPY[mode] || PAYPAL_PROCESSING_COPY.waiting;
  purchaseSuccessDialog.dataset.state = mode;
  purchaseSuccessDialog.setAttribute('aria-labelledby', 'purchase-processing-title');
  purchaseSuccessDialog.setAttribute('aria-describedby', 'purchase-processing-description');
  purchaseProcessingTitle.textContent = copy.title;
  purchaseProcessingDescription.textContent = copy.description;
  purchaseProcessingNote.textContent = copy.note;
  purchaseProcessingView.hidden = false;
  purchaseSuccessView.hidden = true;
  updateProcessingSummary(order);

  if (cartDialog.open) cartDialog.close();
  if (openDialog && !purchaseSuccessDialog.open) purchaseSuccessDialog.showModal();
}

function showCartPaymentStatus(message, tone) {
  stopClosedDialogPayPalMonitor();
  if (purchaseSuccessDialog.open) purchaseSuccessDialog.close();
  showFormStatus(message, tone);
  openCart();
}

function showPurchaseSuccess(order) {
  stopClosedDialogPayPalMonitor();
  const items = Array.isArray(order.items) ? order.items : [];
  purchaseSuccessItems.replaceChildren(...items.map((item) => {
    const row = createElement('li');
    const copy = createElement('span');
    copy.appendChild(createElement('strong', '', item.title));
    copy.appendChild(createElement('small', '', item.productType === 'ebook' ? 'Ebook PDF' : 'Clase online'));
    row.append(copy, createElement('span', 'purchase-success-price', usd.format(item.lineAmountCents / 100)));
    return row;
  }));
  purchaseSuccessTotal.textContent = usd.format(order.totalAmountCents / 100);
  purchaseSuccessReference.textContent = `Orden de prueba ${order.id.slice(0, 8).toUpperCase()}`;
  purchaseSuccessReference.title = order.id;
  purchaseSuccessDelivery.replaceChildren(...deliveryDetailsFor(order).map((detail) => createElement('li', '', detail)));

  purchaseSuccessDialog.dataset.state = 'success';
  purchaseSuccessDialog.setAttribute('aria-labelledby', 'purchase-success-title');
  purchaseSuccessDialog.setAttribute('aria-describedby', 'purchase-success-description');
  purchaseProcessingView.hidden = true;
  purchaseSuccessView.hidden = false;
  clearCompletedCart();
  if (cartDialog.open) cartDialog.close();
  if (!purchaseSuccessDialog.open) purchaseSuccessDialog.showModal();
}

function stopClosedDialogPayPalMonitor() {
  if (closedDialogPayPalMonitor?.timer) {
    window.clearInterval(closedDialogPayPalMonitor.timer);
  }
  closedDialogPayPalMonitor = null;
}

function handleTerminalPayPalOrder(order) {
  if (!order || order.status === 'pending') return false;
  if (state.finalizedPayPalOrderId === order.id) return true;

  if (order.status === 'approved') {
    state.finalizedPayPalOrderId = order.id;
    forgetPendingPayPalOrder();
    showPurchaseSuccess(order);
    return true;
  }

  const status = PAYPAL_ORDER_STATUSES.get(order.status);
  if (status) {
    state.finalizedPayPalOrderId = order.id;
    forgetPendingPayPalOrder();
    showCartPaymentStatus(status.message, status.tone);
    return true;
  }

  return false;
}

async function checkClosedDialogPayPalOrder() {
  const monitor = closedDialogPayPalMonitor;
  if (!monitor || monitor.inFlight) return;
  if (monitor.attempts >= PAYPAL_CLOSED_DIALOG_POLL_ATTEMPTS) {
    stopClosedDialogPayPalMonitor();
    return;
  }

  monitor.inFlight = true;
  monitor.attempts += 1;
  try {
    const payload = await requestJson(`/api/orders/${encodeURIComponent(monitor.orderId)}`, {
      cache: 'no-store'
    });
    if (!payload.order || typeof payload.order.status !== 'string') return;
    if (payload.order.status === 'pending') updateProcessingSummary(payload.order);
    handleTerminalPayPalOrder(payload.order);
  } catch {
    // El monitor principal y una futura recarga conservan la posibilidad de reintento.
  } finally {
    monitor.inFlight = false;
  }
}

function startClosedDialogPayPalMonitor(orderId) {
  if (!orderId || closedDialogPayPalMonitor?.orderId === orderId) return;
  stopClosedDialogPayPalMonitor();
  closedDialogPayPalMonitor = {
    orderId,
    attempts: 0,
    inFlight: false,
    timer: null
  };
  closedDialogPayPalMonitor.timer = window.setInterval(
    () => void checkClosedDialogPayPalOrder(),
    PAYPAL_CLOSED_DIALOG_POLL_INTERVAL_MS
  );
  void checkClosedDialogPayPalOrder();
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForPayPalOrder(orderId, { continueInBackground = true } = {}) {
  let lastOrder = null;
  let lastError = null;
  const totalAttempts = PAYPAL_ORDER_FAST_POLL_ATTEMPTS
    + (continueInBackground ? PAYPAL_ORDER_BACKGROUND_POLL_ATTEMPTS : 0);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}`, {
        cache: 'no-store'
      });
      if (!payload.order || typeof payload.order.status !== 'string') {
        throw new Error('El servidor devolvió un estado de orden no válido.');
      }
      lastOrder = payload.order;
      lastError = null;
      if (lastOrder.status === 'pending') updateProcessingSummary(lastOrder);
      if (lastOrder.status !== 'pending') return lastOrder;
    } catch (error) {
      lastError = error;
    }

    const fastPollingFinished = attempt === PAYPAL_ORDER_FAST_POLL_ATTEMPTS - 1;
    if (continueInBackground && fastPollingFinished) {
      showPurchaseProcessing('delayed', lastOrder, false);
    }

    if (attempt < totalAttempts - 1) {
      const interval = attempt < PAYPAL_ORDER_FAST_POLL_ATTEMPTS - 1
        ? PAYPAL_ORDER_FAST_POLL_INTERVAL_MS
        : PAYPAL_ORDER_BACKGROUND_POLL_INTERVAL_MS;
      await wait(interval);
    }
  }

  if (!lastOrder && lastError) throw lastError;
  return lastOrder;
}

async function showPayPalOrderResult(orderId, captureError = null) {
  showPurchaseProcessing('waiting');

  try {
    const continueInBackground = !captureError
      || captureError.code === 'payment_attempt_already_processed';
    const order = await waitForPayPalOrder(orderId, { continueInBackground });
    if (handleTerminalPayPalOrder(order)) return;

    if (captureError && captureError.code !== 'payment_attempt_already_processed') {
      showPurchaseProcessing('error', order, false);
      return;
    }

    showPurchaseProcessing('delayed', order, false);
  } catch {
    showPurchaseProcessing('error', null, false);
  }
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

async function startPayPalCheckout(customer) {
  if (state.runtime?.payments?.paypal !== 'sandbox') {
    showFormStatus('PayPal sandbox todavía no está disponible en este entorno.', 'error');
    return;
  }

  const items = selectedProducts().map((product) => ({ productId: product.id }));
  const idempotencyKey = await idempotencyKeyFor(customer, items);

  showFormStatus('Creando la orden sandbox...', 'pending');
  const orderPayload = await requestJson('/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ customer, items })
  });

  showFormStatus('Abriendo PayPal sandbox...', 'pending');
  const checkoutPayload = await requestJson('/api/checkout/paypal', {
    method: 'POST',
    body: JSON.stringify({ orderId: orderPayload.order.id })
  });

  window.location.assign(paypalSandboxApprovalUrl(checkoutPayload.checkout?.approveUrl));
}

async function capturePayPalReturn() {
  const params = new URLSearchParams(window.location.search);
  const paypalStatus = params.get('paypal');
  if (!paypalStatus) {
    const pendingOrderId = pendingPayPalOrder();
    if (!pendingOrderId) return;
    showPurchaseProcessing('waiting');
    setSubmitting(true);
    try {
      await showPayPalOrderResult(pendingOrderId);
    } finally {
      setSubmitting(false);
    }
    return;
  }

  const orderId = params.get('orderId');
  const providerOrderId = params.get('token');

  if (paypalStatus === 'cancel') {
    clearPayPalReturnParameters();
    forgetPendingPayPalOrder();
    showFormStatus(PAYPAL_CANCELLED_MESSAGE, 'warning');
    openCart();
    return;
  }

  if (paypalStatus !== 'return' || !orderId || !providerOrderId) {
    clearPayPalReturnParameters();
    showFormStatus(
      'No pudimos leer el retorno de PayPal sandbox. La orden no se considera pagada; revisala antes de volver a intentarlo.',
      'error'
    );
    openCart();
    return;
  }

  rememberPendingPayPalOrder(orderId);
  showPurchaseProcessing('waiting');
  setSubmitting(true);
  let captureError = null;
  try {
    await requestJson('/api/payments/paypal/capture', {
      method: 'POST',
      body: JSON.stringify({ orderId, providerOrderId })
    });
  } catch (error) {
    captureError = error;
  } finally {
    clearPayPalReturnParameters();
  }

  try {
    await showPayPalOrderResult(orderId, captureError);
  } finally {
    setSubmitting(false);
  }
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

purchaseSuccessDialog.querySelectorAll('[data-close-purchase-success]').forEach((button) => {
  button.addEventListener('click', () => purchaseSuccessDialog.close());
});
purchaseSuccessDialog.addEventListener('click', (event) => {
  const bounds = purchaseSuccessDialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) purchaseSuccessDialog.close();
});
purchaseSuccessDialog.addEventListener('close', () => {
  if (purchaseSuccessDialog.dataset.state === 'success') return;
  const orderId = pendingPayPalOrder();
  if (orderId) startClosedDialogPayPalMonitor(orderId);
});

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.cart.size === 0 || state.submitting) return;
  if (!checkoutForm.reportValidity()) return;
  const provider = event.submitter?.dataset.paymentProvider;
  const customer = provider === 'paypal' ? getCheckoutCustomer() : null;
  setSubmitting(true);
  try {
    if (provider === 'mercadopago') {
      showFormStatus('Mercado Pago se habilitará cuando confirmemos los importes en ARS; no hay cobros por ese medio todavía.', 'warning');
      return;
    }
    if (provider === 'paypal') {
      await startPayPalCheckout(customer);
      return;
    }
    showFormStatus('Elegí un medio de pago válido.', 'error');
  } catch (error) {
    showFormStatus(error.message, 'error');
  } finally {
    setSubmitting(false);
  }
});

document.querySelector('#year').textContent = new Date().getFullYear();
Promise.all([loadCatalog(), loadRuntime()]).then(capturePayPalReturn);
