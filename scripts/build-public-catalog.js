const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = require('../docs/ai/course-catalog.json');
const targetPath = path.join(root, 'public', 'catalog.json');
const cropPositions = ['16% 14%', '84% 14%', '16% 70%', '84% 70%'];

function durationLabel(minutes) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : String(hours).replace('.', ',')} h`;
}

function levelLabel(levels) {
  return levels.length === 1 ? `Nivel ${levels[0]}` : `Nivel ${levels.join('/')}`;
}

function typeLabel(type) {
  return {
    simple: 'Clase simple',
    special: 'Clase especial',
    double: 'Clase doble',
    triple: 'Clase triple'
  }[type];
}

const courseProducts = source.courses.map((course, index) => ({
  id: course.id,
  type: 'course',
  title: course.title,
  level: course.levels,
  levelLabel: levelLabel(course.levels),
  durationMinutes: course.durationMinutes,
  durationLabel: durationLabel(course.durationMinutes),
  classType: course.classType,
  classTypeLabel: typeLabel(course.classType),
  description: `Pintá ${course.title.toLocaleLowerCase('es-AR')} junto a Gaby, con una explicación clara y a tu ritmo.`,
  includes: ['Video paso a paso', 'Fotos de guía', 'Material complementario cuando corresponda'],
  priceUsd: course.priceUsd,
  priceStatus: course.classTypeEvidence === 'provisional-user-authorized' ? 'provisional' : 'catalog',
  image: `images/catalog/page-${course.sourcePage}.png`,
  imagePosition: cropPositions[index % 4],
  imageAlt: `Acuarela de la clase ${course.title}`
}));

const ebookProducts = source.digitalProducts.map((product) => ({
  id: product.id,
  type: 'ebook',
  title: product.title,
  subtitle: product.subtitle,
  level: [1, 2, 3],
  levelLabel: 'Todos los niveles',
  durationMinutes: null,
  durationLabel: 'PDF · 17 páginas',
  classType: 'ebook',
  classTypeLabel: 'Ebook descargable',
  description: 'Una guía visual con diez proyectos botánicos para explorar color, técnica y creatividad, desde lo simple hasta composiciones más detalladas.',
  includes: ['10 acuarelas paso a paso', 'Patrones y paletas de color', 'Tips y técnicas de Gaby'],
  priceUsd: product.priceUsd,
  priceStatus: 'approved',
  image: 'images/ebook-10-acuarelas-botanicas.png',
  imagePosition: 'center',
  imageAlt: 'Portada del ebook 10 Acuarelas Botánicas de Gaby Acuarelas'
}));

const publicCatalog = {
  schemaVersion: 1,
  currency: source.storefront.currency,
  purchaseMode: source.storefront.purchaseMode,
  promotion: source.storefront.promotion,
  requiredCustomerFields: source.storefront.requiredCustomerFields,
  generatedFrom: 'docs/ai/course-catalog.json',
  courses: [...courseProducts, ...ebookProducts]
};

fs.writeFileSync(targetPath, `${JSON.stringify(publicCatalog, null, 2)}\n`, 'utf8');
console.log(`Public catalog built: ${publicCatalog.courses.length} products.`);
