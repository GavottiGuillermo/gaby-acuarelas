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
const state = {
  products: [],
  filter: 'all',
  visible: PAGE_SIZE,
  cart: new Set()
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
  button.textContent = added ? 'Quitar' : 'Sumar';
  button.classList.toggle('added', added);
  button.setAttribute('aria-label', `${added ? 'Quitar' : 'Sumar'} ${product.title} ${added ? 'de' : 'a'} la selección`);
}

function updateAllAddButtons() {
  document.querySelectorAll('[data-product-id]').forEach((button) => {
    const product = state.products.find((item) => item.id === button.dataset.productId);
    if (product) updateAddButton(button, product);
  });

  document.querySelectorAll('[data-add-product]').forEach((button) => {
    const added = state.cart.has(button.dataset.addProduct);
    button.textContent = added ? 'Quitar el ebook' : 'Sumar el ebook';
    button.classList.toggle('added', added);
  });
}

function toggleCart(productId) {
  if (state.cart.has(productId)) state.cart.delete(productId);
  else state.cart.add(productId);
  formStatus.textContent = '';
  updateAllAddButtons();
  renderCart();
}

function renderCart() {
  const selected = state.products.filter((product) => state.cart.has(product.id));
  cartCount.textContent = String(selected.length);
  cartCount.setAttribute('aria-label', `${selected.length} ${selected.length === 1 ? 'producto' : 'productos'}`);
  cartEmpty.hidden = selected.length > 0;
  cartSummary.hidden = selected.length === 0;
  checkoutForm.hidden = selected.length === 0;

  cartItems.replaceChildren(...selected.map((product) => {
    const row = createElement('div', 'cart-item');
    const copy = createElement('div', 'cart-item-copy');
    copy.appendChild(createElement('strong', '', product.title));
    copy.appendChild(createElement('small', '', product.type === 'ebook' ? 'Ebook PDF' : `${product.levelLabel} · ${product.durationLabel}`));
    const price = createElement('span', 'cart-item-price', usd.format(product.priceUsd));
    const remove = createElement('button', 'cart-remove', 'Quitar');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Quitar ${product.title}`);
    remove.addEventListener('click', () => toggleCart(product.id));
    row.append(copy, price, remove);
    return row;
  }));

  const total = selected.reduce((sum, product) => sum + product.priceUsd, 0);
  cartTotal.textContent = usd.format(total);
  const selectedCourses = selected.filter((product) => product.type === 'course').length;
  cartPromotion.textContent = selectedCourses >= 2
    ? 'Ya armaste un combo. El descuento se definirá próximamente; el subtotal todavía usa precios de lista.'
    : 'Sumá dos o más clases para armar tu combo con promoción.';
}

function openCart() {
  renderCart();
  cartDialog.showModal();
}

async function loadCatalog() {
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
    const data = await response.json();
    state.products = data.courses;
    renderCatalog();
    renderCart();
  } catch (error) {
    grid.replaceChildren(createElement('p', 'error', `${error.message} Intentá nuevamente en unos minutos.`));
    grid.setAttribute('aria-busy', 'false');
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

checkoutForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.cart.size === 0) return;
  if (!checkoutForm.reportValidity()) return;
  formStatus.textContent = 'La selección está lista. En la próxima etapa conectaremos el pedido real con PayPal y los correos.';
});

document.querySelector('#year').textContent = new Date().getFullYear();
loadCatalog();
