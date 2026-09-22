# Decisiones provisionales autorizadas

El 2026-09-15 Guillermo autorizó avanzar entre etapas sin esperar todas las respuestas de Ceci. Cada definición temporal debe ser visible en la demo y revisarse antes de habilitar transacciones reales.

| ID | Tema | Decisión provisional | Revisión |
| --- | --- | --- | --- |
| P-001 | Imágenes de cursos | Usar las imágenes de las páginas 2 a 11 del catálogo aportado. Reemplazar por originales si Ceci envía mejores archivos. | Etapa 2 |
| P-002 | Marca y fotografía | Mantener la marca visual y recursos actuales. No afirmar que una imagen provisoria sea una foto real de Gaby. | Etapa 2 |
| P-003 | Catálogo | Tratar las 40 clases relevadas como inventario completo para la demo. | Antes de producción |
| P-004 | Hortensias mágicas | Categoría especial de 2,5 horas, USD 15. | Cuando Ceci confirme precios |
| P-005 | Hortensias realista | Mantener categoría triple y USD 25, siguiendo la ficha individual. | Cuando Ceci confirme precios |
| P-006 | Moneda | Resuelta el 2026-09-22: conservar USD como base y mostrar ARS calculado con la venta oficial de DolarApi, redondeando hacia arriba a múltiplos de $100. Mercado Pago sigue sin procesar pagos hasta completar su integración sandbox. | Integración Mercado Pago en etapa 4 |
| P-007 | Combos | Implementar carrito y permitir armar un combo libre. Informar que hay promociones sin calcular descuentos todavía. | Cuando Ceci defina la promoción |
| P-008 | Datos de compra | Solicitar nombre, apellido y correo, todos obligatorios en el flujo visual. | Etapa 3 |
| P-009 | Acceso | Mostrar “vigencia a confirmar”; no prometer acceso ilimitado. | Antes de producción |
| P-010 | Aviso administrativo | Enviar un correo a Gaby por cada venta confirmada, además del correo al comprador. | Etapa 5 |
| P-011 | Alumnas/os | No publicar trabajos de alumnas/os por ahora. | Si se reciben permisos individuales |
| P-012 | Ebook | Vender `10 Acuarelas Botánicas - Paso a paso` a USD 5, con portada aportada y texto comercial provisional. El PDF no será público. | Antes de producción |
| P-013 | Alerta de cotización | La estructura registra fallos y detecta 3 intentos consecutivos fallidos o más de 10 días de antigüedad. Responsable: administrador del sistema. Conectar el correo de alerta cuando exista servidor de correo, sin dejar de usar la última cotización válida. | Etapa 5 |

## Regla de revisión

Una decisión provisional puede cambiar sin invalidar el trabajo posterior si se conserva el identificador del producto y la lógica toma títulos, precios y textos desde fuentes configurables. Cualquier cambio que afecte pagos o entrega deberá probarse nuevamente antes de producción.
