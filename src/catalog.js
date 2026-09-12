// El catálogo público es la única fuente de datos durante la etapa de maqueta.
// Así, Express y GitHub Pages muestran exactamente los mismos cursos.
module.exports = require('../public/catalog.json').courses;
