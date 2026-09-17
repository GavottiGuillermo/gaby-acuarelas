# Flujo funcional de pedido y entrega

Este documento define el comportamiento esperado. No autoriza su implementación mientras las etapas 3, 4 y 5 permanezcan bloqueadas.

## Objetivo

Una persona debe poder elegir y pedir uno o más cursos desde la web. Después de la confirmación válida del pago, debe recibir por correo la confirmación y la información necesaria para acceder al contenido comprado.

## Flujo principal

1. La persona navega el catálogo real por nivel y temática, incluyendo el ebook cuando corresponda.
2. Abre el detalle de un curso, combo o ebook.
3. Selecciona el producto y comienza el pedido.
4. Informa nombre, apellido y un correo electrónico válido.
5. Elige PayPal para USD o Mercado Pago para ARS. En la demo ambas opciones son visuales; Mercado Pago no podrá conectarse hasta confirmar los importes ARS.
6. El servidor obtiene producto, moneda e importe desde su propio catálogo y crea una orden `pending`.
7. El proveedor procesa el pago.
8. Un webhook firmado comunica el resultado al servidor.
9. El servidor concilia proveedor, orden, producto, moneda e importe.
10. Si el pago es válido, la orden pasa a `approved` exactamente una vez.
11. Se registra una entrega pendiente y se envía al comprador un único correo lógico con confirmación y acceso.
12. El resultado del envío queda auditado y puede reintentarse sin duplicar la entrega.

## Correo al comprador

Contenido mínimo:

- Nombre y apellido de la persona.
- Número o referencia de orden.
- Curso, combo o ebook adquirido.
- Confirmación del pago sin incluir datos financieros sensibles.
- Instrucciones y enlace seguro de acceso.
- Canal de soporte.
- Aclaración sobre vigencia del acceso, cuando esté definida.

La página 12 del catálogo confirma que el enlace recibido por correo permite descargar videos, fotos de guía y, cuando la clase lo requiere, patrones o videos de práctica. El contenido exacto debe quedar asociado a cada producto antes de habilitar ventas.

Para el ebook `10 Acuarelas Botánicas - Paso a paso`, el correo entregará un enlace protegido al PDF. El archivo pago no puede formar parte de los recursos públicos de GitHub Pages.

El correo se envía únicamente después de una confirmación confiable del servidor. El retorno del navegador desde Mercado Pago o PayPal no es evidencia suficiente.

## Datos mínimos propuestos

- Correo electrónico: obligatorio.
- Nombre: obligatorio.
- Apellido: obligatorio.
- País: opcional; podría ayudar a elegir proveedor y soporte.
- Producto: seleccionado por identificador, validado en servidor.
- Consentimientos legales: pendientes de definir.

No guardar números de tarjeta, credenciales de PayPal ni información financiera que corresponda al proveedor.

## Estados mínimos

- `pending`: orden creada, pago no confirmado.
- `approved`: pago conciliado y aceptado.
- `rejected`: pago rechazado.
- `cancelled`: operación cancelada o abandonada según reglas definidas.
- `refunded`: devolución confirmada.

La entrega tiene estado independiente:

- `pending`
- `sent`
- `failed`

### Transiciones permitidas

| Entidad | Estado actual | Estados siguientes permitidos |
| --- | --- | --- |
| Orden | `pending` | `approved`, `rejected`, `cancelled` |
| Orden | `approved` | `refunded` |
| Orden | `rejected` | Ninguno |
| Orden | `cancelled` | Ninguno |
| Orden | `refunded` | Ninguno |
| Entrega | `pending` | `sent`, `failed` |
| Entrega | `failed` | `pending`, `sent` |
| Entrega | `sent` | Ninguno |

Las transiciones se validan en el dominio. La futura conciliación de pagos no podrá asignar estados arbitrarios ni devolver una orden aprobada a `pending`.

## Reglas de idempotencia

- Una referencia del proveedor no puede aprobar dos órdenes.
- Repetir el mismo webhook no puede duplicar la transición de pago.
- Una orden aprobada puede tener una sola entrega lógica por producto.
- Reintentar un correo fallido reutiliza la misma entrega y registra cada intento.

## Contrato inicial de la API de órdenes

La etapa 3 incorpora `POST /api/orders` y `GET /api/orders/:id`. Estos endpoints no crean pagos ni envían correos.

Para crear una orden, el cliente envía el encabezado `Idempotency-Key` y únicamente los datos del comprador y los identificadores de producto:

```json
{
  "customer": {
    "firstName": "Ana",
    "lastName": "Pérez",
    "email": "ana@example.com"
  },
  "items": [
    { "productId": "peonias-pimpollo" }
  ]
}
```

El servidor rechaza importes, monedas y precios aportados por el navegador. Resuelve cada producto desde el catálogo controlado, fija USD y guarda en la orden una copia inmutable del título, tipo y precio aplicados.

Repetir el mismo pedido con la misma clave devuelve la orden existente. Reutilizar la clave con otro comprador o productos diferentes responde con conflicto. La respuesta de consulta no incluye nombre ni correo del comprador.

Si `DATABASE_URL` no está configurada, la API de órdenes responde `503` y la demo estática continúa disponible. La aplicación usa un pool limitado y un `search_path` explícito; las migraciones usan una credencial administrativa separada.

## Contrato inicial de PayPal Sandbox

La etapa 4 incorpora tres endpoints de servidor:

- `POST /api/checkout/paypal` recibe únicamente `{ "orderId": "..." }`, crea un intento y devuelve la URL de aprobación Sandbox.
- `POST /api/payments/paypal/capture` recibe la orden interna y la referencia PayPal después del retorno. Ejecuta la captura, pero no marca la orden interna como aprobada.
- `POST /api/webhooks/paypal` verifica la firma con PayPal, reconcilia la referencia, la orden, los productos, la moneda y el importe, y recién entonces aplica una transición idempotente.

Los importes y productos del pedido PayPal se construyen desde la copia inmutable de la orden. Cualquier campo adicional enviado por el navegador, incluido un precio o moneda, se rechaza. El cuerpo del webhook no se escribe en logs ni se conserva completo: se registra únicamente su hash SHA-256 y los metadatos necesarios para idempotencia y auditoría.

Durante el desarrollo `PAYPAL_ENV` debe ser `sandbox`. La ausencia o configuración parcial de `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` y `PAYPAL_WEBHOOK_ID` mantiene el checkout cerrado. Las credenciales `Live` siguen prohibidas hasta las etapas productivas.

## Casos alternativos

- Correo inválido: bloquear el inicio del pedido y explicar cómo corregirlo.
- Pago pendiente: no enviar acceso; mostrar estado pendiente.
- Pago rechazado: permitir un nuevo intento sin modificar el importe.
- Importe o moneda distintos: marcar para revisión y no entregar.
- Webhook sin firma válida: rechazar y registrar un evento seguro.
- Fallo de correo: conservar la compra aprobada y activar reintento o recuperación manual.
- Acceso no disponible: no perder la orden; alertar y permitir resolución manual.

## Decisiones pendientes

- Duración y revocación del acceso.
- Proveedor de correo y dirección remitente.
- Contenido exacto de la plantilla.
- Política de reembolso y efecto sobre el acceso entregado.

## Decisiones confirmadas para el flujo

- El carrito admite varios productos y permite armar combos libres.
- La promoción por compra múltiple se comunica, pero no se calcula hasta definir su fórmula.
- Nombre, apellido y correo son obligatorios.
- Gaby recibe una notificación administrativa por cada venta confirmada.
