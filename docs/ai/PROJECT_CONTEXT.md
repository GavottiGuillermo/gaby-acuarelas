# Contexto del proyecto

## Producto

Gaby Acuarelas será una tienda online de clases, cursos y combos de acuarela botánica. La experiencia debe transmitir que una persona sin experiencia puede aprender con una guía clara, practicar a su ritmo y disfrutar el proceso.

El cliente debe poder seleccionar y pedir los cursos desde la web. Una vez que el servidor confirme el pago, el comprador debe recibir por correo la confirmación y la información de acceso correspondiente.

Mensaje central validado:

> No necesitás experiencia previa. Sólo ganas de empezar.

La voz es argentina, cercana, alentadora y concreta. Se usa voseo. Se evita el tono elitista, la promesa exagerada y el lenguaje técnico sin explicación.

## Estado actual

- Hay una demo estática publicada con GitHub Pages.
- La demo está migrando al catálogo real con decisiones provisionales identificadas.
- El checkout es sólo una representación visual y no procesa pagos.
- Los ebooks aportados fueron revisados como referencia de identidad y metodología.
- Se recibieron y relevaron las 14 páginas del catálogo de Canva: contienen 40 clases individuales, tres niveles y reglas generales de precio en USD.
- Gaby aprobó vender el ebook `10 Acuarelas Botánicas - Paso a paso` a USD 5.
- La transcripción está documentada en `COURSE_CATALOG.md` y `course-catalog.json` y fue autorizada para la demo estática.
- La demo usa USD, carrito y combos libres; el descuento promocional queda pendiente.
- Las imágenes del catálogo se usan provisionalmente hasta recibir archivos originales de mayor calidad.

## Catálogo recibido

- 40 clases individuales: 21 de nivel 1, 12 de nivel 2, 6 de nivel 3 y 1 de nivel 2/3.
- Regla publicada: clase simple USD 12, doble USD 18 y triple USD 25.
- `Hortensias mágicas` usa provisionalmente USD 15 porque dura 2,5 horas y queda fuera de los rangos publicados.
- La fuente anuncia promociones por varias clases, pero no define su fórmula ni enumera combos.
- La fuente confirma que el acceso llega por correo mediante un enlace de descarga.
- El ebook pago nunca se publica como archivo estático; se entrega de forma protegida después de confirmar el pago.

## Arquitectura prevista

- Node.js 20 o superior y Express.
- Un servicio para frontend y API cuando se active el backend.
- GitHub Pages para validación visual inicial.
- Render pago, en su plan económico adecuado, para producción.
- Cloudflare para dominio, TLS y controles perimetrales.
- Mercado Pago en ARS.
- PayPal en USD.
- PostgreSQL para órdenes, pagos y entregas.
- Correo automático después de confirmar el pago.
- Cursos alojados inicialmente en Dropbox.
- Imágenes potencialmente alojadas en Google Cloud Storage.

## Principios del dominio

- El servidor es la autoridad de productos, monedas e importes.
- Una orden conserva una copia inmutable del producto comprado y su precio.
- Un pago aprobado puede producir una sola compra efectiva.
- Una compra puede disparar un solo correo de entrega, aunque el webhook se repita.
- El correo del comprador es un dato obligatorio del pedido y debe validarse antes de iniciar el pago.
- El regreso del navegador desde el proveedor no confirma una compra; la entrega depende de una notificación verificada por el servidor.
- El acceso al curso nunca expone credenciales de Dropbox.
- Los datos de Capri y Gaby no se mezclan aunque compartan una instancia PostgreSQL.

## Fuera de alcance mientras la demo sea estática

- Credenciales reales.
- Cobros reales.
- Escrituras en PostgreSQL.
- Correos transaccionales.
- Entrega automatizada de cursos.
- Publicación de testimonios o trabajos de alumnas sin permiso y origen confirmados.

## Jerarquía de fuentes

Ante contradicciones, usar este orden:

1. Instrucción explícita y reciente del usuario.
2. Decisiones registradas en `DECISIONS.md`.
3. Estado y criterios de `CURRENT_STAGE.md`.
4. Este contexto de producto.
5. README y código existente.
6. Ebooks, webs y documentos externos como material de referencia.
