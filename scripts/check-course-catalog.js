const catalog = require('../docs/ai/course-catalog.json');
const publicCatalog = require('../public/catalog.json');
const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`Course catalog gate failed: ${message}`);
  process.exit(1);
}

if (!Array.isArray(catalog.courses)) {
  fail('courses debe ser un arreglo.');
}

if (catalog.courses.length !== catalog.source?.courseCount) {
  fail(`se esperaban ${catalog.source?.courseCount} cursos y se encontraron ${catalog.courses.length}.`);
}

const ids = new Set();
const validTypes = new Set(['simple', 'special', 'double', 'triple']);
const validEvidence = new Set(['explicit', 'inferred-from-duration', 'provisional-user-authorized']);
const expectedPriceByType = new Map([
  ['simple', 12],
  ['special', 15],
  ['double', 18],
  ['triple', 25]
]);

for (const course of catalog.courses) {
  if (!course.id || ids.has(course.id)) {
    fail(`identificador vacío o duplicado: ${course.id || '(vacío)'}.`);
  }
  ids.add(course.id);

  if (!course.title || !Number.isInteger(course.sourcePage) || course.sourcePage < 2 || course.sourcePage > 11) {
    fail(`${course.id} no tiene título o página de origen válida.`);
  }

  if (!Number.isInteger(course.durationMinutes) || course.durationMinutes <= 0) {
    fail(`${course.id} no tiene una duración válida.`);
  }

  if (!validTypes.has(course.classType) || !validEvidence.has(course.classTypeEvidence)) {
    fail(`${course.id} tiene tipo o evidencia inválidos.`);
  }

  if (!Array.isArray(course.levels) || course.levels.length === 0
    || course.levels.some((level) => ![1, 2, 3].includes(level))) {
    fail(`${course.id} no tiene niveles válidos.`);
  }

  if (course.priceUsd !== expectedPriceByType.get(course.classType)) {
    fail(`${course.id} no coincide con el precio general de su tipo.`);
  }

}

if (!Array.isArray(catalog.digitalProducts) || catalog.digitalProducts.length !== 1) {
  fail('debe existir exactamente un producto digital aprobado en esta versión.');
}

for (const product of catalog.digitalProducts) {
  if (!product.id || ids.has(product.id)) {
    fail(`identificador de producto digital vacío o duplicado: ${product.id || '(vacío)'}.`);
  }
  ids.add(product.id);

  if (product.productType !== 'ebook' || product.format !== 'PDF' || product.priceUsd !== 5) {
    fail(`${product.id} no coincide con el ebook aprobado a USD 5.`);
  }

  if (product.delivery?.publicFileAllowed !== false) {
    fail(`${product.id} no puede autorizar la publicación del PDF pago.`);
  }

  if (product.commercialApproval?.status !== 'approved') {
    fail(`${product.id} no tiene aprobación comercial registrada.`);
  }
}

if (catalog.storefront?.currency !== 'USD' || catalog.storefront?.purchaseMode !== 'cart') {
  fail('la tienda estática debe usar USD y carrito según la decisión vigente.');
}

const expectedProducts = [...catalog.courses, ...catalog.digitalProducts];

if (!Array.isArray(publicCatalog.courses) || publicCatalog.courses.length !== expectedProducts.length) {
  fail('public/catalog.json no contiene todos los productos de la matriz comercial.');
}

for (const product of expectedProducts) {
  const publicProduct = publicCatalog.courses.find((item) => item.id === product.id);
  if (!publicProduct || publicProduct.priceUsd !== product.priceUsd) {
    fail(`${product.id} falta o tiene un precio distinto en el catálogo público.`);
  }

  const imagePath = path.join(__dirname, '..', 'public', publicProduct.image || '');
  if (!publicProduct.image || !fs.existsSync(imagePath)) {
    fail(`${product.id} no tiene una imagen pública disponible.`);
  }

  if (/\.pdf$/i.test(publicProduct.image)) {
    fail(`${product.id} no puede exponer un PDF pago como recurso público.`);
  }
}

console.log(`Course catalog OK: ${catalog.courses.length} cursos, ${catalog.digitalProducts.length} ebook y precios USD completos.`);
