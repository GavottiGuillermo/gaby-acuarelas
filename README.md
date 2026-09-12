# Gaby Acuarelas

Tienda online de cursos y combos de acuarela. El proyecto parte de la arquitectura comprobada de Capri Store (Node.js + Express en un único servicio), con una identidad visual y datos completamente independientes.

## Estado

La primera versión incluye:

- portada responsive inspirada en una estética de acuarela;
- catálogo servido desde el backend;
- precios independientes en ARS y USD;
- selector de Mercado Pago o PayPal;
- variables preparadas para pagos, correo y Dropbox;
- configuración inicial para Render.

Los cursos y precios incluidos son datos de demostración. El checkout responde como no disponible hasta implementar y probar las credenciales sandbox.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

Abrir `http://localhost:3000`.

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
