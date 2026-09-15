# Desarrollo asistido por IA

Este directorio es la memoria operativa del proyecto. Su objetivo es permitir que distintas sesiones o herramientas de IA continúen el trabajo sin reinterpretar el alcance ni saltar etapas.

## Archivos

- `PROJECT_CONTEXT.md`: objetivo, arquitectura y límites del producto.
- `COURSE_CATALOG.md`: relevamiento legible del catálogo comercial aportado.
- `course-catalog.json`: transcripción estructurada, trazable y todavía sujeta a aprobación comercial.
- `ORDER_FLOW.md`: recorrido funcional desde la selección hasta el correo de acceso.
- `DESIGN_REFERENCE.md`: sistema visual extraído de los ebooks de Gaby.
- `DECISIONS.md`: decisiones aceptadas y asuntos todavía abiertos.
- `DEFERRED_DECISIONS.md`: supuestos provisionales autorizados que deberán revisarse sin frenar el prototipo.
- `ROADMAP.md`: secuencia completa de etapas y criterios de salida.
- `CURRENT_STAGE.md`: única fuente de verdad sobre el trabajo permitido ahora.
- `STAGE_GATE.json`: estado equivalente legible por máquina.

## Protocolo de inicio

1. Leer `AGENTS.md` y todos los documentos de este directorio.
2. Confirmar cuál es la única etapa `ACTIVE`.
3. Revisar sus criterios pendientes y elegir una tarea que cierre alguno.
4. No producir código de etapas posteriores "para ir adelantando".
5. Al finalizar, actualizar evidencia y pendientes de la etapa activa.

## Protocolo de avance

Para avanzar de etapa deben cumplirse simultáneamente estas condiciones:

1. Los criterios técnicos están completos o sus definiciones no críticas fueron diferidas explícitamente por el usuario.
2. Existe evidencia reproducible para cada criterio.
3. Las decisiones humanas requeridas tienen aprobación explícita registrada.
4. No hay secretos ni contenido real confundido con datos de demostración.
5. `CURRENT_STAGE.md` se actualiza en el mismo cambio que abre la etapa siguiente.

Los pendientes diferidos deben tener un valor temporal visible, responsable y etapa de revisión. Nunca se pueden diferir seguridad, integridad de pagos, protección de datos, secretos o permisos de terceros.

## Validación automática

Ejecutar:

```bash
npm run gate
```

La validación falla si hay más de una etapa activa, si una etapa futura deja de estar bloqueada o si se intenta avanzar sin que las etapas anteriores estén completas y aprobadas. `npm run check` incluye esta comprobación y GitHub Pages la ejecuta antes de publicar.

El mismo comando ejecuta `npm run catalog:check`, que verifica cantidad, identificadores, trazabilidad, niveles, tipos y consistencia de precios de `course-catalog.json`.
