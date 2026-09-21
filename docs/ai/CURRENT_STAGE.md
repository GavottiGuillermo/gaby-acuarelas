# Estado de etapa

## Etapa activa

- Número: 4
- Nombre: Pagos sandbox
- Estado: `ACTIVE`
- Inicio: 2026-09-17
- Responsable de aprobación: Guillermo

La etapa 3 quedó `COMPLETE` el 2026-09-17 con aprobación humana explícita de Guillermo. El núcleo de órdenes, PostgreSQL, aislamiento respecto de Capri y restauración del esquema fueron verificados antes de habilitar pagos de prueba.

## Objetivo

Integrar Mercado Pago y PayPal exclusivamente en ambientes sandbox, manteniendo al servidor como autoridad de productos, monedas e importes y conciliando cada resultado mediante notificaciones verificadas.

## Criterios de salida

- [x] Creación de órdenes PayPal sandbox desde el servidor en USD.
- [ ] Creación de preferencias u órdenes Mercado Pago sandbox desde el servidor en ARS.
- [ ] Redirección o aprobación del pago según cada proveedor.
- [ ] Verificación de firmas de webhooks de PayPal y Mercado Pago.
- [ ] Conciliación de proveedor, referencia, orden, producto, moneda, importe y estado.
- [ ] Registro idempotente de intentos y eventos de pago.
- [ ] Casos aprobado, rechazado, pendiente y cancelado probados para ambos proveedores.
- [ ] Webhooks repetidos probados sin duplicar aprobaciones ni eventos efectivos.
- [x] Importes manipulados desde el cliente rechazados antes de crear el pago.
- [ ] Credenciales sandbox almacenadas únicamente en variables de entorno.
- [ ] Ausencia de credenciales, cuerpos sensibles y datos personales en logs de prueba.

## Decisiones aplicables

- PayPal procesa USD y Mercado Pago procesa ARS.
- El servidor obtiene producto, moneda e importe desde su catálogo y desde la orden persistida; nunca acepta esos valores desde el navegador.
- El regreso del navegador desde un proveedor no confirma una compra.
- Una orden sólo cambia a `approved` después de conciliar una notificación auténtica del proveedor.
- Una referencia de proveedor no puede aprobar dos órdenes y un webhook repetido no duplica transiciones.
- Las credenciales administrativas de PostgreSQL no se usan en el servicio web.

## Prerrequisitos pendientes

- Confirmar la lista de precios ARS antes de crear pagos Mercado Pago. No se permite una conversión automática ni un importe provisional para pagos.
- Crear u obtener credenciales de prueba de Mercado Pago y guardarlas sólo en `.env` local o variables privadas del entorno. Las tres credenciales PayPal Sandbox están configuradas en variables privadas y fueron aceptadas por OAuth.

## Acciones no permitidas todavía

- Usar credenciales live o productivas.
- Procesar cobros reales o habilitar botones que aparenten un cobro productivo.
- Marcar una orden como pagada usando parámetros de retorno del navegador.
- Enviar correos reales o entregar accesos a cursos o al ebook.
- Publicar secretos, cuerpos completos de webhooks o datos personales en logs.
- Desplegar el servicio transaccional como producción.

## Evidencia de cierre de la etapa 3

- Los diez criterios de salida de la etapa 3 quedaron completos y documentados.
- Migración `001_order_core` aplicada dentro del esquema aislado `gaby_acuarelas`.
- Rol `gaby_acuarelas_app` verificado sin privilegios administrativos ni acceso a tablas fuera del esquema.
- `DATABASE_URL` probada con escritura y lectura transaccional; el rollback no dejó registros.
- Backup de estructura restaurado en PostgreSQL 18 local con 9 tablas, 49 restricciones y ninguna fila copiada.
- `npm run check` aprobó sintaxis, pruebas, compuerta de etapas y catálogo; el escaneo no detectó secretos versionados.
- Guillermo aprobó explícitamente el cierre de la etapa 3 y la activación de la etapa 4 el 2026-09-17.

## Evidencia inicial de la etapa 4

- Tablas de intentos y eventos de pago disponibles con restricciones únicas.
- Estados de orden e idempotencia documentados y probados antes de conectar proveedores.
- Se implementó el cliente PayPal Orders v2 limitado a Sandbox, con OAuth, `PayPal-Request-Id`, creación y captura desde servidor.
- `POST /api/checkout/paypal` acepta únicamente el identificador de una orden persistida; el importe, la moneda y los productos salen de su copia inmutable.
- `POST /api/payments/paypal/capture` no aprueba la orden interna: conserva el estado pendiente hasta recibir y conciliar el webhook.
- `POST /api/webhooks/paypal` verifica la firma mediante la API oficial de PayPal y registra sólo el hash del cuerpo, sin guardar ni escribir el contenido sensible en logs.
- La conciliación implementada compara proveedor, referencia, orden, productos, moneda e importe antes de permitir una transición.
- Las pruebas automatizadas cubren creación desde servidor, rechazo de importes del cliente, firma inválida, diferencia de importe y webhook repetido.
- PayPal Sandbox aceptó las credenciales locales mediante OAuth el 2026-09-17; los valores no fueron mostrados, copiados ni escritos en el repositorio.
- Se creó desde el servidor una orden Sandbox real del ebook por USD 5, respaldada por una orden PostgreSQL identificada como prueba y conservada en estado `pending`.
- Repetir el inicio del checkout devolvió la misma referencia PayPal con HTTP 200, sin crear un segundo intento; el primer inicio respondió HTTP 201.
- Un pedido manipulado con moneda ARS e importe de un centavo fue rechazado con HTTP 400 antes de llamar al proveedor.
- El webhook PayPal Sandbox apunta a `https://gabyacuarelas.com/api/webhooks/paypal` y `PAYPAL_WEBHOOK_ID` está configurado como variable privada en Render; resta probar la recepción y conciliación de eventos reales sin registrar sus cuerpos.
- El backend informa PostgreSQL y PayPal Sandbox como configurados en `/health`.
- `.env.example` contiene sólo nombres de variables y valores vacíos para proveedores.
- `.env` está excluido por `.gitignore`; el escaneo del repositorio no encontró valores de credenciales PayPal.
- `npm run check` aprobó sintaxis, 22 pruebas automatizadas, compuerta de etapa y catálogo el 2026-09-17; se omitió únicamente la prueba PostgreSQL opcional por no estar definida `TEST_DATABASE_URL` en esa ejecución.
- El formulario del carrito crea la orden interna enviando sólo comprador e identificadores de producto, reutiliza una clave idempotente aleatoria protegida por una huella SHA-256 y crea el checkout enviando únicamente `orderId`.
- El retorno `paypal=return` usa el `token` como referencia PayPal para solicitar la captura y comunica `pending_webhook`; no interpreta el retorno del navegador como aprobación.
- La interfaz valida que la redirección recibida pertenezca a PayPal Sandbox, mantiene Mercado Pago bloqueado hasta contar con precios ARS y comunica que no existen cobros reales ni entrega automática.
- Se corrigió el envío del comprador para tomar una copia de nombre, apellido y correo antes de deshabilitar los controles durante la solicitud; los campos deshabilitados no participan de `FormData`.
- `npm run check` aprobó sintaxis, 22 pruebas automatizadas, compuerta de etapa y catálogo el 2026-09-20; se omitió únicamente la prueba PostgreSQL opcional porque `TEST_DATABASE_URL` no estaba configurada.
- PayPal Sandbox completó el 2026-09-21 dos capturas de USD 5 y entregó con estado exitoso los eventos reales `PAYMENT.CAPTURE.COMPLETED`; la consulta posterior de Orders v2 confirma que el servidor ejecutó la conciliación sin depender del retorno del navegador.
- La interfaz consulta temporalmente el estado interno después de la captura y sólo muestra la confirmación cuando la orden quedó `approved` por efecto del webhook firmado; distingue además rechazo, cancelación, devolución, demora y error de consulta.
- El identificador de una orden pendiente queda en `sessionStorage` para recuperar la consulta tras una recarga, sin guardar credenciales, datos personales ni información financiera.
- Render registra para cada webhook solamente identificador, tipo y resultado de procesamiento, y para rechazos solamente el código seguro; nunca escribe encabezados, secretos ni el cuerpo recibido.
- Las consultas del estado de orden usan `Cache-Control: no-store`, y las pruebas automatizadas cubren la traducción de webhooks PayPal a aprobado, pendiente, rechazado y cancelado.
- `npm run check` aprobó sintaxis, 23 pruebas automatizadas, compuerta de etapa y catálogo el 2026-09-21; se omitió únicamente la prueba PostgreSQL opcional porque `TEST_DATABASE_URL` no estaba configurada.

## Regla para cerrar esta etapa

Ambos proveedores deben superar en sandbox los estados aprobado, rechazado, pendiente, cancelado y webhook repetido. No se puede diferir la verificación de firmas, la conciliación de importes y monedas, la idempotencia ni la protección de credenciales.
