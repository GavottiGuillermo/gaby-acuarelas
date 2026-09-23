# Gaby Acuarelas

Tienda online de cursos y combos de acuarela. El proyecto parte de la arquitectura comprobada de Capri Store (Node.js + Express en un único servicio), con una identidad visual y datos completamente independientes.

## Desarrollo por etapas

El trabajo asistido por IA sigue etapas controladas. Antes de modificar el proyecto se deben leer `AGENTS.md` y los documentos de `docs/ai/`.

La única fuente de verdad sobre el trabajo habilitado es [`docs/ai/CURRENT_STAGE.md`](docs/ai/CURRENT_STAGE.md). Los detalles no críticos pueden quedar diferidos cuando el usuario los autoriza y se documentan con una decisión provisional.

## Estado

La maqueta preliminar incluye:

- portada responsive con una identidad de acuarela botánica;
- ilustraciones originales generadas para esta presentación;
- catálogo real de 40 clases compatible con GitHub Pages y reutilizado por Express;
- ebook `10 Acuarelas Botánicas - Paso a paso` a USD 5;
- precios visibles en USD y ARS, con conversión administrada y redondeo a múltiplos de $100, y carrito para armar combos libres;
- flujo de PayPal Sandbox en USD e integración preparada de Mercado Pago Checkout Pro Sandbox en ARS;
- enlaces a recursos gratuitos que Gaby ya comparte con su comunidad;
- variables preparadas para pagos, correo y Dropbox;
- configuración inicial para Render y publicación automática en GitHub Pages.

Los nombres, niveles y precios provienen del catálogo aportado, salvo las decisiones provisionales identificadas en `docs/ai/DEFERRED_DECISIONS.md`. La versión de GitHub Pages es únicamente visual y no procesa pagos. El backend de PayPal Sandbox crea, captura y concilia órdenes. Mercado Pago ya cuenta con órdenes ARS, preferencias de Checkout Pro y webhooks conciliados, pero permanece deshabilitado hasta configurar y probar sus credenciales Sandbox.

El catálogo real recibido está transcripto en `docs/ai/COURSE_CATALOG.md` y `docs/ai/course-catalog.json`, y alimenta la demo estática. Las imágenes de las láminas, el precio especial y la promoción sin descuento son provisionales.

Gaby aprobó la dirección visual basada en el ebook y su venta como producto digital a USD 5. El PDF completo no se publica en GitHub Pages: la entrega futura deberá hacerse mediante un enlace protegido después del pago.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

Abrir `http://localhost:3000`.

Sin `DATABASE_URL`, la tienda estática sigue disponible y la API de órdenes responde como no configurada. Para trabajar con PostgreSQL durante la etapa 3, usar una base no productiva y seguir [`db/README.md`](db/README.md). Las credenciales se guardan solamente en `.env` o en variables privadas de Render.

```bash
npm run db:migrate
npm test
```

## Demo en GitHub Pages

El workflow `.github/workflows/pages.yml` publica la carpeta `public` cuando se envían cambios a `main` o `master`.

1. Subir el repositorio a GitHub.
2. Abrir **Settings → Pages**.
3. En **Build and deployment**, elegir **GitHub Actions**.
4. Ejecutar el workflow **Publicar demo en GitHub Pages** o enviar un cambio a la rama principal.

Todos los recursos usan rutas relativas, por lo que la demo funciona aunque GitHub Pages la publique dentro de una ruta con el nombre del repositorio.

## Próximas integraciones

1. Revisar la demo estática con Gaby y ajustar las decisiones provisionales.
2. Completar las pruebas reales de Mercado Pago Sandbox con credenciales de prueba.
3. Validar las notificaciones firmadas de ambos proveedores contra sus simuladores y flujos Sandbox.
4. Registrar cada compra aprobada en PostgreSQL.
5. Enviar el correo transaccional una única vez.
6. Generar o entregar el acceso de Dropbox sin exponer credenciales.

## Despliegue

`render.yaml` permite crear un servicio gratuito durante el desarrollo. Para recibir pagos reales se recomienda un servicio sin suspensión por inactividad y una base con persistencia y backups.

Los secretos se cargan desde el panel del proveedor. Nunca deben agregarse al repositorio.
