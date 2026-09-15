# Roadmap con compuertas

Las etapas son secuenciales. Sólo `CURRENT_STAGE.md` puede indicar cuál está activa. Una etapa puede cerrar con decisiones no críticas diferidas cuando Guillermo lo autoriza y quedan registradas en `DEFERRED_DECISIONS.md`; esto nunca aplica a seguridad, pagos, datos personales, secretos o permisos de terceros.

## Etapa 1 - Identidad, contenido y activos

Objetivo: convertir el material de Gaby en un sistema de diseño y un inventario comercial aprobados.

Entregables:

- Referencia visual documentada.
- Voz y mensajes principales documentados.
- Inventario de recursos con origen y permiso.
- Matriz real de cursos, combos, contenidos y precios.
- Reglas comerciales del pedido y datos mínimos del comprador.
- Aprobación explícita de Gaby sobre la dirección visual.

Estado: `COMPLETE` desde 2026-09-15, con aprobación de Guillermo y pendientes no críticos registrados. Las 14 páginas del catálogo fueron relevadas en una matriz de 40 clases; Gaby aprobó la dirección visual y el ebook a USD 5.

Compuerta de salida:

- No quedan imágenes de Gaby o alumnas sin origen y permiso.
- Cada producto real tiene identificador, título, nivel, descripción, contenido, moneda, precio e imagen.
- Está decidido si la compra es individual o admite carrito, y qué datos se solicitan además del correo.
- Gaby aprueba por escrito la dirección visual y el contenido base.

## Etapa 2 - Tienda estática aprobable

Estado: `ACTIVE` desde 2026-09-15.

Objetivo: reconstruir la demo de GitHub Pages con el sistema visual y catálogo reales.

Entregables:

- Home responsive.
- Catálogo real y fichas de producto.
- Sección sobre Gaby.
- Recursos gratuitos y preguntas frecuentes.
- Flujo visual de compra sin transacciones.
- Captura y validación visual del correo del comprador.

Compuerta de salida:

- Revisión en 360 px, 768 px, 1280 px y 1440 px sin desbordes.
- Navegación por teclado y foco visibles.
- Imágenes optimizadas y sin enlaces temporales.
- Sin errores de consola, enlaces rotos ni datos demo inadvertidos.
- Gaby aprueba la demo pública.

## Etapa 3 - Núcleo de órdenes y PostgreSQL

Objetivo: implementar el dominio de compras sin conectar cobros reales.

Entregables:

- Migraciones en el esquema `gaby_acuarelas`.
- Tablas para productos, precios, clientes, órdenes, intentos de pago, eventos y entregas.
- Estados y transiciones documentados.
- API validada para crear y consultar órdenes.
- Persistencia del correo del comprador con tratamiento seguro de datos personales.
- Pruebas de idempotencia y aislamiento respecto de Capri.

Compuerta de salida:

- Migraciones reversibles probadas en una base no productiva.
- Restricciones únicas evitan pagos y entregas duplicados.
- No hay secretos ni datos personales en logs de prueba.
- Backup y restore del esquema fueron ensayados.

## Etapa 4 - Pagos sandbox

Objetivo: integrar Mercado Pago y PayPal en ambientes de prueba.

Entregables:

- Creación de órdenes desde servidor.
- Redirección o aprobación según cada proveedor.
- Verificación de firmas de webhooks.
- Conciliación del importe, moneda, producto y estado.
- Reintentos seguros y registro de eventos.

Compuerta de salida:

- Casos aprobado, rechazado, pendiente, cancelado y webhook repetido probados para ambos proveedores.
- Un importe manipulado desde el cliente es rechazado.
- Las credenciales sandbox viven sólo en variables de entorno.

## Etapa 5 - Correo y entrega

Objetivo: entregar automáticamente el acceso correcto después de un pago aprobado.

Entregables:

- Plantillas de correo aprobadas.
- Correo de confirmación y acceso dirigido al comprador.
- Integración de correo transaccional.
- Generación o recuperación segura del acceso a Dropbox.
- Registro auditable de entrega y reintentos.

Compuerta de salida:

- Un pago aprobado produce exactamente una entrega lógica.
- Los reintentos no duplican el correo ni cambian el producto entregado.
- No se expone ningún token de Dropbox.
- Existe procedimiento manual para recuperar una entrega fallida.

## Etapa 6 - Preparación productiva

Objetivo: desplegar el sistema completo con seguridad, observabilidad y operación básica.

Entregables:

- Servicio pago de Render.
- Dominio y Cloudflare.
- PostgreSQL productivo con permisos mínimos.
- Encabezados de seguridad, límites y política CORS.
- Monitoreo, alertas, backups y runbook.
- Textos legales y política de privacidad revisados por quien corresponda.

Compuerta de salida:

- Checklist de seguridad completo.
- Restore de backup probado.
- Alertas y healthcheck verificados.
- Compra de punta a punta probada con monto controlado.
- Aprobación explícita para habilitar credenciales productivas.

## Etapa 7 - Lanzamiento y estabilización

Objetivo: habilitar ventas reales de manera controlada.

Entregables:

- Activación de proveedores productivos.
- Prueba real controlada.
- Monitoreo reforzado durante el lanzamiento.
- Registro de incidentes y mejoras.

Compuerta de salida:

- Compras, pagos, correo y acceso conciliados.
- No existen incidentes críticos abiertos.
- Gaby confirma que el flujo comercial y de soporte es operable.
