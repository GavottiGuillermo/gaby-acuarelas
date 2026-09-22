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

- La regla ARS quedó confirmada: cotización oficial de venta obtenida de DolarApi y redondeo hacia arriba a múltiplos de $100. Resta integrar estos importes en órdenes ARS y Mercado Pago Sandbox antes de crear pagos.
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

- Tras una aprobación conciliada, la interfaz vacía el carrito y muestra una confirmación independiente con el resumen inmutable devuelto por la orden. El texto anticipa los materiales previstos por correo, pero aclara que Sandbox todavía no envía correos ni entrega contenido.
- `npm run check` volvió a aprobar sintaxis, 23 pruebas automatizadas, compuerta de etapa y catálogo el 2026-09-21; la prueba PostgreSQL opcional se omitió porque `TEST_DATABASE_URL` no estaba configurada.
- El retorno PayPal pendiente ya no deja al comprador en el carrito: muestra un diálogo de procesamiento con un resumen breve, conserva la orden para nuevas consultas y sólo cambia a éxito cuando el webhook firmado deja la orden `approved`. La confirmación final se compactó para reducir el desplazamiento vertical.
- `npm run check` aprobó este ajuste con 23 pruebas automatizadas, compuerta de etapa y catálogo el 2026-09-21; sólo se omitió la prueba PostgreSQL opcional sin `TEST_DATABASE_URL`.
- El monitoreo del retorno PayPal continúa en segundo plano durante aproximadamente cinco minutos después de la ventana rápida inicial. Cerrar el diálogo de procesamiento no detiene las consultas y una aprobación posterior vuelve a abrir automáticamente la confirmación de compra.
- `npm run check` aprobó el monitoreo extendido con 23 pruebas automatizadas, compuerta de etapa y catálogo el 2026-09-22; sólo se omitió la prueba PostgreSQL opcional sin `TEST_DATABASE_URL`.
- Se comprobó en el dominio desplegado que HTML y JavaScript se servían con caché pública de una hora. Los recursos críticos ahora exigen revalidación, incluyen una versión de despliegue y el cierre del diálogo activa un monitor independiente que reabre el éxito cuando la orden cambia a `approved`.
- `npm run check` aprobó este ajuste con 25 pruebas automatizadas (24 aprobadas y la prueba PostgreSQL opcional omitida por no estar configurada `TEST_DATABASE_URL`), compuerta de etapa y catálogo el 2026-09-22.
- La migración `002_exchange_rates` agregó un historial administrado de cotizaciones con una sola fila activa por par de monedas; no cargó ningún valor provisional ni conecta fuentes externas sin autorización comercial.
- La tabla `gaby_acuarelas.exchange_rates` quedó aplicada inicialmente sin valores provisionales. El rol limitado puede leerla y no puede actualizarla; la consulta administrativa de reemplazo está documentada en `db/README.md`.
- `npm run check` aprobó la migración con 26 pruebas automatizadas (25 aprobadas y la prueba PostgreSQL opcional omitida por no estar configurada `TEST_DATABASE_URL`), compuerta de etapa y catálogo el 2026-09-22.
- `npm run rate:update` consultó DolarApi desde el servidor y guardó como cotización activa de venta USD/ARS el valor `1535.000000`, con fecha de origen `2026-09-22T16:00:00.000Z` y fuente `dolarapi:oficial:venta`.
- Una segunda ejecución de `npm run rate:update` reconoció la misma cotización y no creó otro registro. El comando rechaza respuestas inválidas, fechas futuras y datos con más de siete días, y conserva la base sin cambios ante un fallo.
- `npm run check` aprobó la actualización con 29 pruebas automatizadas (28 aprobadas y la prueba PostgreSQL opcional omitida por no estar configurada `TEST_DATABASE_URL`), compuerta de etapa y catálogo el 2026-09-22.
- Guillermo aprobó mostrar los precios ARS redondeados hacia arriba a múltiplos de $100. `GET /api/pricing` lee únicamente la cotización activa de PostgreSQL, rechaza valores ausentes, inválidos o con fecha futura y calcula en servidor los 41 importes.
- La web muestra ARS en el ebook, las tarjetas, cada ítem y el subtotal del carrito. Si una actualización externa falla, continúa usando la última cotización válida aunque tenga más de diez días; si el backend o una cotización utilizable no existen, conserva USD y oculta ARS. Mercado Pago continúa deshabilitado y no se modificó el contrato USD de las órdenes PayPal.
- Con la cotización de venta `1535.000000`, la API devolvió los valores esperados: USD 5 → ARS 7.700, USD 12 → ARS 18.500, USD 15 → ARS 23.100, USD 18 → ARS 27.700 y USD 25 → ARS 38.400.
- `npm run check` aprobó el desarrollo con 33 pruebas automatizadas (32 aprobadas y la prueba PostgreSQL opcional omitida por no estar configurada `TEST_DATABASE_URL`), compuerta de etapa y catálogo el 2026-09-22. La verificación HTTP local confirmó `/api/pricing` y los tres puntos de presentación ARS; la revisión visual en navegador quedó pendiente porque no había un navegador conectado en la sesión.
- La migración `003_exchange_rate_update_status` quedó aplicada y registra fallos consecutivos, último intento, último éxito, último fallo y un código seguro, sin guardar respuestas externas. El rol web tiene sólo lectura sobre este estado.
- La condición operativa de alerta se activa con 3 fallos consecutivos o más de 10 días desde la cotización efectiva. El comando deja la alerta en logs; Guillermo autorizó completar el correo administrativo cuando la etapa 5 tenga un servidor de correo activo.
- `npm run rate:update` actualizó la cotización a `1535.000000` con fecha de origen `2026-09-22T17:00:00.000Z` y dejó el estado en 0 fallos consecutivos, con intento y éxito registrados y sin código de error.
- `npm run check` aprobó la estructura de fallback y alerta con 37 pruebas automatizadas (36 aprobadas y la prueba PostgreSQL opcional omitida por no estar configurada `TEST_DATABASE_URL`), compuerta de etapa y catálogo el 2026-09-22.

## Regla para cerrar esta etapa

Ambos proveedores deben superar en sandbox los estados aprobado, rechazado, pendiente, cancelado y webhook repetido. No se puede diferir la verificación de firmas, la conciliación de importes y monedas, la idempotencia ni la protección de credenciales.
