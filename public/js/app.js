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

function courseCard(course) {
  const article = document.createElement('article');
  article.className = `course-card accent-${course.accent}`;
  article.innerHTML = `
    <div class="course-image" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="course-body">
      <p class="eyebrow">${course.eyebrow}</p>
      <h3>${course.title}</h3>
      <p>${course.description}</p>
      <ul>${course.includes.map((item) => `<li>${item}</li>`).join('')}</ul>
      <div class="course-footer">
        <div><strong>${ars.format(course.priceArs)}</strong><small>o ${usd.format(course.priceUsd)} con PayPal</small></div>
        <button class="button secondary" type="button">Comprar</button>
      </div>
    </div>`;
  article.querySelector('button').addEventListener('click', () => openPayment(course));
  return article;
}

function openPayment(course) {
  selectedCourse = course;
  dialogCourse.textContent = course.title;
  mpPrice.textContent = ars.format(course.priceArs);
  paypalPrice.textContent = usd.format(course.priceUsd);
  dialogMessage.textContent = 'El acceso se enviará por correo cuando el pago sea aprobado.';
  dialog.showModal();
}

async function loadCatalog() {
  try {
    const response = await fetch('/api/catalogo');
    if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
    const data = await response.json();
    data.courses.forEach((course) => grid.appendChild(courseCard(course)));
  } catch (error) {
    grid.innerHTML = `<p class="error">${error.message} Intentá nuevamente en unos minutos.</p>`;
  }
}

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

dialog.querySelectorAll('[data-provider]').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!selectedCourse) return;
    const provider = button.dataset.provider;
    button.disabled = true;
    dialogMessage.textContent = 'Preparando el pago…';

    try {
      const response = await fetch(`/api/checkout/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: selectedCourse.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible iniciar el pago.');
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      dialogMessage.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelector('#year').textContent = new Date().getFullYear();
loadCatalog();
