const path = require('path');
const express = require('express');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const catalog = require('./catalog');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.static(publicDir, {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gaby-acuarelas' });
});

app.get('/api/catalogo', (_req, res) => {
  res.json({ courses: catalog });
});

// La creación real de órdenes se implementará cuando estén disponibles las
// credenciales sandbox y los precios definitivos. Mantenerla en servidor evita
// exponer secretos y permite validar el importe antes de iniciar cada pago.
app.post('/api/checkout/:provider', (req, res) => {
  const provider = req.params.provider;
  const course = catalog.find((item) => item.id === req.body?.courseId);

  if (!['mercadopago', 'paypal'].includes(provider)) {
    return res.status(404).json({ error: 'Proveedor de pago no válido.' });
  }

  if (!course) {
    return res.status(400).json({ error: 'Curso no válido.' });
  }

  return res.status(503).json({
    error: 'El checkout está en preparación.',
    provider,
    courseId: course.id
  });
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Gaby Acuarelas disponible en http://localhost:${port}`);
});
