// Contenido de demostración. Reemplazar con los cursos, imágenes y precios reales.
const catalog = [
  {
    id: 'flores-en-acuarela',
    type: 'course',
    eyebrow: 'Nivel inicial',
    title: 'Flores en acuarela',
    description: 'Una introducción amable al color, las transparencias y las formas botánicas.',
    includes: ['Clases en video', 'Guía de materiales', 'Ejercicios descargables'],
    priceArs: 35000,
    priceUsd: 30,
    accent: 'coral'
  },
  {
    id: 'paisajes-con-luz',
    type: 'course',
    eyebrow: 'Nivel intermedio',
    title: 'Paisajes con luz',
    description: 'Cielos, agua y profundidad para construir escenas luminosas paso a paso.',
    includes: ['Clases en video', 'Referencias', 'Acceso a tu ritmo'],
    priceArs: 42000,
    priceUsd: 36,
    accent: 'blue'
  },
  {
    id: 'combo-primeras-pinceladas',
    type: 'bundle',
    eyebrow: 'Combo recomendado',
    title: 'Primeras pinceladas',
    description: 'Dos cursos complementarios para comenzar y seguir practicando.',
    includes: ['2 cursos completos', 'Material complementario', 'Precio especial'],
    priceArs: 65000,
    priceUsd: 55,
    accent: 'green'
  }
];

module.exports = catalog;
