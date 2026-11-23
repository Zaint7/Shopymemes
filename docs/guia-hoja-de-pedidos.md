# Guía: la hoja de pedidos de Shopymemes (Google Sheets + Apps Script)

Con esta guía cada pedido de la tienda queda guardado solo en una hoja de Google, te llega un correo de aviso y se hace una copia diaria en tu Drive. Todo es gratis y no necesitas servidor.

Los pasos marcados con **🙋 Tu turno** solo los puedes hacer tú, porque usan tu cuenta de Google.

**Cómo funciona, en simple:** el cliente llena el formulario en `carrito.html` → la tienda manda los datos a un "mini programa" (Apps Script) que vive en tu hoja → ese programa agrega una fila y te envía un correo → después se abre WhatsApp con el mensaje del pedido. Si la hoja falla un día, el pedido igual llega por WhatsApp.

---

## 1. Crear la hoja

🙋 **Tu turno**

1. Entra a <https://sheets.google.com> con la cuenta de Google que quieres usar para la tienda.
2. Crea una hoja en blanco y ponle de nombre **Pedidos Shopymemes**.
3. No hace falta escribir nada dentro: el programa crea la pestaña `Pedidos` con sus columnas la primera vez que llegue un pedido. El orden de las columnas es: Pedido, Fecha, Nombre, Celular, Ciudad, Dirección, Referencias, Conjunto cerrado, Tipo de pago, Productos, Total, Estado, Notas y **Autorización datos** (la última). Esa última guarda un "Sí" como constancia de que el cliente aceptó el tratamiento de datos (Ley 1581).
4. Pon la hora de Bogotá en la hoja: menú **Archivo > Configuración > Zona horaria** y elige **(GMT-05:00) Bogotá**, para que las fechas de los pedidos salgan bien.
5. Si ya tenías una pestaña `Pedidos` creada con una versión anterior del script, agrega a mano el encabezado **Autorización datos** en la columna N (justo después de `Notas`).

## 2. Abrir Apps Script y pegar el código

🙋 **Tu turno**

1. En la hoja: menú **Extensiones > Apps Script**. Se abre otra pestaña con un editor de código.
2. Borra todo lo que haya en el archivo `Código.gs` (suele traer una función `myFunction` vacía).
3. Abre en tu computador el archivo `apps-script/Codigo.gs` de este proyecto, copia **todo** su contenido y pégalo en el editor.
4. Arriba, cambia el nombre del proyecto "Proyecto sin título" por **Shopymemes pedidos**.
5. Pulsa el ícono de guardar (💾) o `Ctrl + S`.

## 3. Poner tu correo de aviso

🙋 **Tu turno**

Al inicio del código está esta línea:

```js
const EMAIL_AVISO = '';
```

- Si la dejas vacía, los avisos llegan al correo de la cuenta de Google con la que creaste la hoja.
- Si quieres otro correo, escríbelo entre las comillas: `const EMAIL_AVISO = 'tucorreo@gmail.com';`

Guarda otra vez (`Ctrl + S`).

## 4. Programar la copia diaria (correr `instalarTriggers`)

🙋 **Tu turno**

1. En la barra de arriba del editor hay una lista de funciones. Elige **`instalarTriggers`**.
2. Pulsa **Ejecutar**.
3. Google te va a pedir permisos ("Se necesita autorización"). Es normal, porque el programa va a leer tu hoja, crear copias en tu Drive y enviar correos desde tu cuenta:
   - Pulsa **Revisar permisos** y elige tu cuenta.
   - Aparece "Google no ha verificado esta app". Es porque el programa es tuyo y no lo publicaste en ninguna tienda. Pulsa **Configuración avanzada** y luego **Ir a Shopymemes pedidos (no seguro)**.
   - Revisa la lista y pulsa **Permitir**. Vas a ver un permiso que asusta: *"Ver, editar, crear y eliminar todos tus archivos de Google Drive"*. Se pide solo para poder hacer la copia diaria de respaldo (el programa crea la carpeta y las copias, y solo borra copias suyas llamadas `Pedidos AAAA-MM-DD`). El programa no usa ese permiso para nada más.
4. Cuando diga "Ejecución completada", ya quedó programada una copia diaria cerca de las 2:30 a. m. (hora de Bogotá). Puedes correr `instalarTriggers` varias veces: no duplica la tarea.
5. Opcional: elige **`copiaDiaria`** y pulsa **Ejecutar** para probarla ya. Debe aparecer en tu Drive una carpeta **Respaldo Shopymemes** con un archivo `Pedidos AAAA-MM-DD`. Las copias de más de 30 días se mandan solas a la papelera.

## 5. Publicar como aplicación web

🙋 **Tu turno**

1. Arriba a la derecha: **Implementar > Nueva implementación**.
2. Pulsa el engranaje ⚙ junto a "Seleccionar tipo" y elige **Aplicación web**.
3. Llena así:
   - **Descripción:** `Pedidos v1`
   - **Ejecutar como:** **Yo** (tu cuenta)
   - **Quién tiene acceso:** **Cualquier usuario**. Ojo: NO elijas "Cualquier usuario con una cuenta de Google". Con esa opción la tienda no puede enviar pedidos (Google le pediría iniciar sesión a cada cliente).
4. Pulsa **Implementar** (si pide permisos otra vez, acéptalos como en el paso anterior).
5. Copia la **URL de la aplicación web**. Termina en `/exec`. Se ve parecida a `https://script.google.com/macros/s/AKfy.../exec`.

> "Cualquier usuario" significa que cualquiera con la URL puede enviarle datos al programa. Por eso el código vuelve a validar todo, ignora bots, no repite pedidos y limita cuántos pedidos acepta por celular (3 cada 10 minutos) y en total (30 cada 10 minutos). Con esa URL solo se pueden agregar pedidos; no se puede leer ni borrar nada de tu hoja.

## 6. Conectar la tienda

🙋 **Tu turno** (puedes pedirle a Claude que lo haga si le das la URL)

1. Abre `Public/pedidos-config.js` y pega la URL entre las comillas de `hojaUrl`:

   ```js
   hojaUrl: 'https://script.google.com/macros/s/AKfy.../exec',
   ```

2. Guarda y publica la tienda: en la terminal, dentro del proyecto, `npm run desplegar`. (Ese comando corre las pruebas, actualiza el catálogo y sube el sitio a Firebase Hosting.)

Mientras `hojaUrl` esté vacía, la tienda está en **modo prueba**: el formulario y WhatsApp funcionan, pero el pedido no se guarda en la hoja y la pantalla de confirmación muestra un aviso amarillo "Modo prueba: el pedido no se guardó en la hoja". Al poner la URL, ese aviso deja de aparecer para los clientes.

## 7. Probar con un pedido falso

🙋 **Tu turno**

1. Abre <https://shopymemes.web.app>, agrega un producto al carrito y pulsa **Hacer pedido**.
2. Llena el formulario con datos de prueba (por ejemplo, tu propio nombre y celular) y pulsa **Confirmar pedido**.
3. Debes ver "Pedido #SM-… recibido" y se abre WhatsApp con el mensaje.
4. Verifica que llegó:
   - **La fila:** abre tu hoja, pestaña `Pedidos`. Debe haber una fila nueva con el mismo número de pedido.
   - **El correo:** revisa tu bandeja (y *Spam* la primera vez). El asunto es `Nuevo pedido SM-… — $TOTAL`.
5. Borra la fila de prueba cuando termines (o ponle `Cancelado` en Estado).

Si la fila no aparece, ve a la sección **Si algo falla**.

## 8. Usar la hoja día a día

La hoja es tu tablero de pedidos. Cada fila es un pedido, y la columna **Estado** la cambias tú a mano. Estados sugeridos:

| Estado | Cuándo ponerlo |
|---|---|
| Nuevo | Llegó el pedido (lo pone el programa solo) |
| Pago verificado | Ya confirmaste el pago (obligatorio antes de enviar si es *Pago anticipado*) |
| En preparación | Estás armando el pedido |
| Enviado | Ya despachaste el paquete |
| Entregado | El cliente lo recibió |
| Cancelado | Se cayó el pedido |

Puedes usar la columna **Notas** para guías de envío, acuerdos con el cliente, etc. No se sobreescribe. La columna Estado ya trae una lista desplegable (ver 8b).

Importante: el programa no puede comprobar los precios que manda el navegador. Mira el total del correo y compáralo con lo que debería costar antes de enviar. El pedido también llega por WhatsApp, y lo normal es confirmar ahí.

## 8b. Dejar la hoja bonita (plantilla de formato)

Las hojas nuevas se formatean solas con el primer pedido: encabezado de color suave, filas alternadas, anchos de columna, lista desplegable en **Estado**, colores por estado y una segunda pestaña **Resumen** con cifras en vivo (pedidos por estado, ventas, pedidos de hoy y los 5 últimos).

🙋 **Tu turno — si ya tienes la hoja creada:**

1. Abre **Extensiones > Apps Script**, borra el contenido y pega el `Codigo.gs` nuevo completo. Guarda (`Ctrl + S`).
2. En la lista de funciones elige **`aplicarFormato`** y pulsa **Ejecutar** (una sola vez; si la corres de nuevo no duplica nada). Si Google pide permisos otra vez, acéptalos.
3. No hace falta crear una nueva implementación, porque `doPost` (lo que recibe los pedidos) no cambia. Si prefieres dejarlo todo al día, haz **Implementar > Administrar implementaciones > ✏ > Nueva versión > Implementar**.

Qué significa cada estado (el color sale solo al elegirlo en la lista):

| Estado | Color | Significado |
|---|---|---|
| Nuevo | azul | Llegó el pedido y no lo has revisado |
| Pago verificado | ámbar | Ya confirmaste el pago |
| En preparación | violeta | Estás armando o personalizando el pedido |
| Enviado | cian | Ya salió el paquete |
| Entregado | verde | El cliente lo recibió (cuenta en "Ventas entregadas" del Resumen) |
| Cancelado | rojo | Se cayó el pedido (no cuenta en las ventas) |

Además, **Pago anticipado** se ve en naranja suave y **Contraentrega** en verde suave. Nota: `aplicarFormato` reemplaza las reglas de color de la pestaña `Pedidos`; si algún día añades reglas propias, vuelve a ponerlas después.

## 9. Si cambias el código del script

Editar el código y guardar **no** actualiza la URL pública. Debes crear una versión nueva:

🙋 **Tu turno**

1. **Implementar > Administrar implementaciones**.
2. Pulsa el lápiz ✏ de tu implementación.
3. En **Versión** elige **Nueva versión** y pulsa **Implementar**.

La URL `/exec` se mantiene igual, no hay que tocar `pedidos-config.js`. (Si en cambio haces "Nueva implementación", la URL cambia y tendrías que actualizarla en la tienda.)

## 10. Si algo falla

- **No aparece la fila ni llega el correo.** Abre el editor de Apps Script y mira **Ejecuciones** en el menú de la izquierda: ahí se ve si el programa recibió el pedido y el error en rojo si lo hubo.
- **En la tienda el pedido parece enviado, pero no llega nada a la hoja, o al abrir la URL `/exec` en el navegador te pide iniciar sesión.** El acceso quedó mal: en Implementar > Administrar implementaciones debe decir **Cualquier usuario** (no "con una cuenta de Google"). Corrígelo y publica una nueva versión. La tienda no puede avisar este error porque el navegador no deja ver la respuesta; por eso conviene hacer siempre el pedido de prueba del paso 7.
- **Nunca aparece ninguna ejecución.** La URL en `pedidos-config.js` está mal o no se desplegó la tienda después de pegarla. Revisa que termine en `/exec` (no `/dev`) y vuelve a correr `npm run desplegar`.
- **Los permisos no se aceptaron.** Corre `instalarTriggers` otra vez y acepta la pantalla de permisos completa.
- **"Quién tiene acceso" quedó en otra opción.** Debe ser **Cualquier usuario**. Corrígelo en Implementar > Administrar implementaciones y publica una nueva versión.
- **Llegó el pedido por WhatsApp pero no a la hoja.** Es el comportamiento previsto si la hoja falla: el pedido no se pierde. Anota la fila a mano con el número de pedido que viene en el mensaje.
- **Un pedido no se guarda por datos raros.** El programa rechaza celulares inválidos o textos demasiado largos (los mismos límites del formulario). Mira en Ejecuciones.
- **No llegan los correos.** Revisa *Spam* y que `EMAIL_AVISO` esté bien escrito. Google limita los correos del script a unos 100 por día en cuentas gratuitas, de sobra para una tienda pequeña.
- **La copia diaria no aparece.** Confirma en el reloj ⏰ **Activadores** (menú izquierdo del editor) que existe uno para `copiaDiaria`; si no, corre `instalarTriggers`.
- **Quieres cambiar la hora de la copia.** Cambia `HORA_COPIA` en el código y corre `instalarTriggers` de nuevo.
- **Un cliente pide que borres sus datos (Ley 1581).** Borra su fila en la hoja `Pedidos` y también en las copias de respaldo: están en Drive, carpeta **Respaldo Shopymemes** (hasta 30 copias `Pedidos AAAA-MM-DD`). Puedes abrir cada una y borrar la fila, o mandar esas copias a la papelera (la copia de hoy se vuelve a crear sola sin esa fila). Borra también el chat de WhatsApp y el correo de aviso de ese pedido.
- **Pedidos con "ID repetido" en Notas.** Si dos clientes distintos generaran el mismo número de pedido (casi imposible), el segundo se guarda con un sufijo (`-2`) y una nota. Nunca se descarta un pedido.
