const grid = document.querySelector('#course-grid');
const dialog = document.querySelector('#payment-dialog');
const dialogCourse = document.querySelector('#dialog-course');
const dialogMessage = document.querySelector('#dialog-message');
const mpPrice = document.querySelector('#mp-price');
const paypalPrice = document.querySelector('#paypal-price');
let selectedCourse = null;

const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
});

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function courseCard(course, index) {
  const article = createElement('article', 'course-card');
  article.style.setProperty('--card-delay', `${index * 90}ms`);

  const media = createElement('div', 'course-media');
  const image = document.createElement('img');
  image.src = course.image;
  image.alt = course.imageAlt;
  image.loading = index === 0 ? 'eager' : 'lazy';
  image.decoding = 'async';
  media.appendChild(image);

  const number = createElement('span', 'course-number', String(index + 1).padStart(2, '0'));
  media.appendChild(number);

  if (course.type === 'bundle') {
    media.appendChild(createElement('span', 'course-badge', 'Favorito'));
  }

  const body = createElement('div', 'course-body');
  body.appendChild(createElement('p', 'eyebrow', course.eyebrow));
  body.appendChild(createElement('h3', '', course.title));
  body.appendChild(createElement('p', 'course-description', course.description));

  const includes = createElement('ul', 'course-includes');
  course.includes.forEach((item) => {
    includes.appendChild(createElement('li', '', item));
  });
  body.appendChild(includes);

  const footer = createElement('div', 'course-footer');
  const price = createElement('div', 'course-price');
  price.appendChild(createElement('span', '', 'Valor de referencia'));
  price.appendChild(createElement('strong', '', ars.format(course.priceArs)));
  price.appendChild(createElement('small', '', `o ${usd.format(course.priceUsd)} USD`));

  const button = createElement('button', 'card-action', 'Ver propuesta');
  button.type = 'button';
  button.setAttribute('aria-label', `Ver propuesta de ${course.title}`);
  button.addEventListener('click', () => openPayment(course));

  footer.append(price, button);
  body.appendChild(footer);
  article.append(media, body);
  return article;
}

function openPayment(course) {
  selectedCourse = course;
  dialogCourse.textContent = course.title;
  mpPrice.textContent = ars.format(course.priceArs);
  paypalPrice.textContent = usd.format(course.priceUsd);
  dialogMessage.textContent = 'Esta maqueta no procesa pagos. Los botones permiten presentar cómo se verá la compra.';
  dialog.showModal();
}

async function loadCatalog() {
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw new Error('No se pudo cargar el catálogo.');

    const data = await response.json();
    grid.replaceChildren(...data.courses.map(courseCard));
    grid.setAttribute('aria-busy', 'false');
  } catch (error) {
    const message = createElement('p', 'error', `${error.message} Intentá nuevamente en unos minutos.`);
    grid.replaceChildren(message);
    grid.setAttribute('aria-busy', 'false');
  }
}

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());

dialog.addEventListener('click', (event) => {
  const bounds = dialog.getBoundingClientRect();
  const isOutside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (isOutside) dialog.close();
});

dialog.querySelectorAll('[data-provider]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!selectedCourse) return;
    const label = button.dataset.provider === 'mercadopago' ? 'Mercado Pago' : 'PayPal';
    dialogMessage.textContent = `${label} se habilitará en la versión transaccional. Por ahora, esta experiencia es sólo visual.`;
  });
});

document.querySelector('#year').textContent = new Date().getFullYear();
loadCatalog();
