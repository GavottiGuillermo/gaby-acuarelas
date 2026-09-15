# Estado de etapa

## Etapa activa

- Número: 2
- Nombre: Tienda estática aprobable
- Estado: `ACTIVE`
- Inicio: 2026-09-15
- Responsable de aprobación: Guillermo y Gaby

La etapa 1 quedó `COMPLETE` con aprobación humana y decisiones provisionales documentadas en `DEFERRED_DECISIONS.md`.

## Objetivo

Reconstruir la demo de GitHub Pages con el lenguaje visual del ebook, las 40 clases relevadas, el ebook a USD 5 y un carrito visual que permita armar combos sin procesar pagos.

## Criterios de salida

- [ ] Home responsive alineada con la estética del ebook.
- [x] Catálogo de 40 clases reales con filtros por nivel.
- [x] Ebook `10 Acuarelas Botánicas - Paso a paso` a USD 5.
- [x] Carrito visual para compra individual o combo libre.
- [x] Mensaje de promociones sin aplicar descuentos todavía.
- [x] Formulario visual con nombre, apellido y correo obligatorios.
- [x] Aclaración inequívoca de que la demo no procesa pagos.
- [x] Trabajos de alumnas/os ausentes hasta recibir permisos.
- [ ] Revisión en 360 px, 768 px, 1280 px y 1440 px sin desbordes.
- [ ] Navegación por teclado y foco visibles.
- [x] Imágenes utilizables y sin enlaces temporales.
- [ ] Sin errores de consola, enlaces rotos ni datos demo inadvertidos.
- [ ] Aprobación de la demo pública por Gaby.

## Decisiones aplicables

- Moneda visible: USD.
- `Hortensias mágicas`: especial, 2,5 horas, USD 15 provisional.
- `Hortensias realista`: triple, USD 25 provisional.
- El carrito suma precios de lista. La promoción se anuncia, pero no se calcula.
- PayPal y Mercado Pago aparecen como alternativas visuales. Mercado Pago no muestra un importe hasta confirmar la lista en ARS.
- El acceso y su vigencia se muestran como pendientes de confirmación.
- No se publica el PDF completo del ebook.
- No se publican trabajos de alumnas/os.

## Acciones no permitidas todavía

- Crear tablas o escribir en PostgreSQL.
- Integrar cobros reales o sandbox.
- Enviar correos reales.
- Publicar enlaces de acceso a cursos o al ebook.
- Desplegar Express en Render como servicio transaccional.

## Evidencia inicial

- Etapa 1 aprobada por Guillermo con pendientes controlados.
- Dirección visual del ebook aprobada por Gaby.
- Catálogo fuente: 14 imágenes y 40 clases.
- Producto digital aprobado: ebook PDF a USD 5.
- `npm run check` (2026-09-15): etapa 2 activa; sintaxis JavaScript válida; 40 clases, 1 ebook, precios USD e imágenes sincronizados.
- Servidor local (2026-09-15): home, catálogo JSON, CSS y portada del ebook respondieron HTTP 200.
- Corrección local: el carrito muestra miniatura, título, tipo/nivel/duración, precio y acción para quitar; el acceso al carrito permanece visible mediante el encabezado fijo.
- Corrección local: hero sin superposición tipográfica, sección del ebook compacta y portada conservando proporción 2:3.
- Corrección local: selector visual de PayPal (USD) y Mercado Pago (ARS pendiente), ambos identificados como demo sin cobro.
- La conexión con el navegador integrado no estuvo disponible; quedan pendientes las revisiones visuales por ancho y de interacción real.

## Regla para cerrar esta etapa

La demo debe superar validación visual y técnica. La aprobación de Gaby puede incluir correcciones que se registrarán sin habilitar pagos ni entrega automática.
