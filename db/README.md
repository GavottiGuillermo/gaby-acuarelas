# PostgreSQL de Gaby Acuarelas

La aplicación comparte inicialmente la instancia de Capri, pero no sus tablas ni sus credenciales de aplicación. Todo objeto nuevo vive en el esquema `gaby_acuarelas`.

## Variables

- `DATABASE_MIGRATION_URL`: conexión administrativa usada únicamente al ejecutar migraciones.
- `DATABASE_URL`: conexión del usuario limitado `gaby_acuarelas_app`, usada por el servidor.
- `DATABASE_APP_PASSWORD`: contraseña del rol limitado durante su creación; mínimo 32 caracteres alfanuméricos, guion o guion bajo.
- `DATABASE_POOL_MAX`: máximo de conexiones del proceso; el valor inicial es 5.

Las URLs completas se guardan sólo en `.env` local o como variables privadas de Render. Nunca se copian a documentación, capturas, issues, commits o logs.

Dentro de Render se usa la URL interna. Desde una computadora local se usa la URL externa completa con TLS. No se reemplaza el hostname por una dirección IP.

## Preparación segura de la instancia compartida

1. Confirmar que la instancia paga tiene recuperación disponible y crear una exportación lógica reciente.
2. Revisar conexiones actuales, almacenamiento y métricas de Capri.
3. Conectarse de forma interactiva con el usuario administrador.
4. Ejecutar `db/admin/create-app-role.sql`; `\password` solicita la clave sin escribirla en el repositorio.
5. Guardar la URL administrativa temporalmente como `DATABASE_MIGRATION_URL` y ejecutar `npm run db:migrate`.
6. Ejecutar `db/admin/grant-app-role.sql` para conceder solamente los permisos necesarios.
7. Guardar la URL del usuario limitado como `DATABASE_URL` y retirar `DATABASE_MIGRATION_URL` del entorno del servicio web.
8. Probar creación, consulta y rollback en un entorno no productivo antes de aplicar la migración a la instancia compartida.

Si el usuario administrador de Render no permite `CREATE ROLE`, no se improvisan privilegios: se crea una credencial administrada desde Render después de revisar el impacto sobre la credencial predeterminada de Capri.

## Comandos

```bash
npm run db:check-readiness
npm run db:migrate
npm run db:verify
npm run db:create-app-role
npm run db:verify-app
npm run db:rollback
npm run rate:update
```

`db:check-readiness` sólo consulta versión, conexiones, tamaño, TLS, permisos y existencia del esquema. El runner de migraciones usa una transacción y un bloqueo asesor para evitar dos ejecuciones simultáneas. El rollback revierte solamente la última migración registrada.

## Cotización comercial USD/ARS

La tabla `gaby_acuarelas.exchange_rates` conserva el historial de cotizaciones cargadas manualmente. Sólo puede existir una fila activa por par de monedas. El rol limitado de la aplicación tiene permiso de lectura, pero no puede modificar cotizaciones.

`npm run rate:update` consulta desde el servidor la cotización oficial de venta publicada por DolarApi, valida el valor y su fecha, y reemplaza la fila activa dentro de una transacción. Requiere `DATABASE_MIGRATION_URL`, no acepta valores desde el navegador y conserva la cotización anterior como historial. Si el servicio falla o el dato recibido tiene más de siete días, no reemplaza la última cotización válida.

La tabla `gaby_acuarelas.exchange_rate_update_status` registra solamente el número de fallos consecutivos, fechas de intento, éxito y fallo, y un código de error seguro. No guarda respuestas externas ni mensajes potencialmente sensibles. Tres fallos consecutivos o una cotización almacenada con más de diez días activan la condición operativa de alerta. El correo administrativo se conectará cuando la etapa 5 habilite el servidor de correo; mientras tanto, el comando escribe una alerta explícita en su salida.

La web sigue utilizando la última cotización válida aunque supere diez días. Sólo rechaza una fila inexistente, un valor inválido o una fecha futura, porque esos casos no ofrecen una base segura para calcular importes.

La cotización USD/ARS activa se consulta con:

```sql
SELECT id, rate, source, effective_at, created_at
FROM gaby_acuarelas.exchange_rates
WHERE base_currency = 'USD'
  AND quote_currency = 'ARS'
  AND active;
```

Para reemplazarla, ejecutar la siguiente transacción con la credencial administrativa. Sustituir el valor, la fuente y la fecha por los datos comerciales aprobados; no cargar una cotización obtenida de una fuente cuyo uso comercial no esté autorizado.

```sql
BEGIN;

UPDATE gaby_acuarelas.exchange_rates
SET active = false
WHERE base_currency = 'USD'
  AND quote_currency = 'ARS'
  AND active;

INSERT INTO gaby_acuarelas.exchange_rates (
  base_currency,
  quote_currency,
  rate,
  source,
  effective_at
) VALUES (
  'USD',
  'ARS',
  1500.000000,              -- Reemplazar por el valor aprobado.
  'carga manual',           -- Identificar el origen autorizado.
  '2026-09-22T12:00:00-03'  -- Reemplazar por la fecha efectiva.
);

COMMIT;
```

Esta tabla todavía no calcula precios ni modifica órdenes. Antes de usarla para Mercado Pago se deben aprobar y probar la fuente, el margen, el redondeo, la antigüedad máxima y el comportamiento cuando no haya una cotización válida.
