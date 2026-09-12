# Gaby Acuarelas

Tienda online de cursos y combos de acuarela. El proyecto parte de la arquitectura comprobada de Capri Store (Node.js + Express en un único servicio), con una identidad visual y datos completamente independientes.

## Estado

La maqueta preliminar incluye:

- portada responsive con una identidad de acuarela botánica;
- ilustraciones originales generadas para esta presentación;
- catálogo estático compatible con GitHub Pages y reutilizado por Express;
- precios independientes en ARS y USD;
- presentación del futuro selector de Mercado Pago o PayPal;
- enlaces a recursos gratuitos que Gaby ya comparte con su comunidad;
- variables preparadas para pagos, correo y Dropbox;
- configuración inicial para Render y publicación automática en GitHub Pages.

Los nombres, contenidos y precios son datos de demostración. La versión de GitHub Pages es únicamente visual y no procesa pagos. El checkout del servidor responde como no disponible hasta implementar y probar las credenciales sandbox.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

Abrir `http://localhost:3000`.

## Demo en GitHub Pages

El workflow `.github/workflows/pages.yml` publica la carpeta `public` cuando se envían cambios a `main` o `master`.

1. Subir el repositorio a GitHub.
2. Abrir **Settings → Pages**.
3. En **Build and deployment**, elegir **GitHub Actions**.
4. Ejecutar el workflow **Publicar demo en GitHub Pages** o enviar un cambio a la rama principal.

Todos los recursos usan rutas relativas, por lo que la demo funciona aunque GitHub Pages la publique dentro de una ruta con el nombre del repositorio.

## Próximas integraciones

1. Reemplazar el catálogo de ejemplo por los cursos y combos reales.
2. Crear órdenes de Mercado Pago y PayPal únicamente desde el servidor.
3. Validar las notificaciones firmadas de ambos proveedores.
4. Registrar cada compra aprobada en PostgreSQL.
5. Enviar el correo transaccional una única vez.
6. Generar o entregar el acceso de Dropbox sin exponer credenciales.

## Despliegue

`render.yaml` permite crear un servicio gratuito durante el desarrollo. Para recibir pagos reales se recomienda un servicio sin suspensión por inactividad y una base con persistencia y backups.

Los secretos se cargan desde el panel del proveedor. Nunca deben agregarse al repositorio.
