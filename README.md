# EcoGestión · Sistema de Gestión de Residuos Aprovechables

Aplicación web para registrar, controlar y consultar los materiales aprovechables recolectados. Proyecto académico de Ingeniería de Software que demuestra el uso de una base de datos relacional SQLite, SQL parametrizado, integridad de datos, transacciones y operaciones CRUD.

Tecnologías: HTML5, CSS3, JavaScript y SQLite ejecutado en el navegador con **sql.js**. No usa servidor, PHP, XAMPP, Apache, Node.js ni frameworks.

**Versión 3 (ampliación):** inicio de sesión con Google, cuatro tipos de cuenta (Administrador, Vendedor, Comprador y Empresa recicladora), mercado de residuos, ofertas y negociaciones, panel empresarial y administración de usuarios. Todo lo anterior se conserva. La ampliación se documenta desde la [sección 9](#9-ampliación-cuentas-roles-y-mercado).

---

## 1. Estructura del proyecto

```
SistemaGestionResiduos/
├── index.html                 Interfaz (todas las vistas y formularios)
├── README.md
├── css/
│   ├── estilos.css            Diseño visual y adaptación a pantallas
│   └── mercado.css            Estilos de la ampliación (acceso, mercado, ofertas…)
├── database/
│   ├── esquema.sql            Creación de tablas, índices, triggers y vista
│   ├── datos_iniciales.sql    Datos de demostración
│   ├── esquema_mercado.sql    Ampliación: roles, perfiles, empresas, publicaciones, ofertas, transacciones
│   └── datos_mercado.sql      Datos de demostración del mercado
└── js/
    ├── lib/sql-asm.js         Biblioteca sql.js (SQLite compilado a JavaScript)
    ├── utilidades.js          Formatos, CSV, validación y mensajes
    ├── almacenamiento.js      Guardado automático en el navegador (IndexedDB / localStorage)
    ├── datos_sql.js           Copia embebida de los scripts .sql
    ├── database.js            Conexión, consultas parametrizadas y transacciones
    ├── materiales.js          Módulo Gestión de materiales
    ├── recolecciones.js       Módulo Gestión de recolecciones
    ├── inventario.js          Módulo Inventario (incluye salidas)
    ├── historial.js           Módulo Historial
    ├── reportes.js            Módulo Reportes
    ├── panel.js               Panel principal
    ├── config.js              Configuración de Google (Client ID, administradores, acceso demo)
    ├── sesion.js              Inicio de sesión, registro, permisos por rol
    ├── perfil.js              Perfil del usuario
    ├── mercado.js             Mercado, detalle de publicaciones y envío de ofertas
    ├── publicaciones.js       Publicaciones del vendedor (con fotografías)
    ├── ofertas.js             Ofertas recibidas/enviadas y transacciones
    ├── empresa.js             Panel empresarial
    ├── administracion.js      Usuarios, supervisión y estadísticas
    └── app.js                 Navegación, modales, arranque y archivo .sqlite
```

**Cambios justificados respecto a la estructura propuesta:**

- `sql-asm.js` se incluye en la carpeta del proyecto, así la aplicación **no necesita Internet** para cargar SQLite. Se usa la versión asm.js (JavaScript puro) en lugar de la WebAssembly porque esta última no se puede cargar al abrir el archivo con `file://`.
- `datos_sql.js` contiene una copia de los dos `.sql`. Al abrir `index.html` desde el disco, el navegador no permite leer archivos `.sql` con `fetch()`. Los `.sql` de `database/` siguen siendo la fuente documental y se pueden ejecutar en cualquier herramienta SQLite. **Si modificas un `.sql`, actualiza también `datos_sql.js`.**
- Inventario, Historial, Panel y el almacenamiento tienen su propio archivo para que cada módulo quede separado y sea fácil de explicar.

---

## 2. Cómo abrir y ejecutar en IntelliJ IDEA Community

1. Abre IntelliJ IDEA Community y elige **File → Open…**.
2. Selecciona la carpeta `SistemaGestionResiduos` y pulsa **OK** (si pregunta, elige *Trust Project*).
3. En el panel *Project*, abre `index.html`.
4. Ejecuta la página de una de estas formas:
   - Pasa el mouse por la esquina superior derecha del editor y pulsa el icono de un navegador (Chrome, Edge o Firefox), **o**
   - Clic derecho sobre `index.html` → **Open In → Browser → Chrome** (o el navegador que tengas).
5. La primera vez se crea automáticamente la base con datos de demostración.

**Alternativa sin IntelliJ:** doble clic sobre `index.html` en el Explorador de archivos.

> IntelliJ abre la página con su servidor integrado (`http://localhost:63342/...`), mientras que el doble clic usa `file://`. Ambos funcionan, **pero cada dirección tiene su propio almacenamiento en el navegador**: los datos guardados al abrir desde IntelliJ no aparecen al abrir con doble clic, y viceversa. Usa siempre la misma forma, o pasa los datos con **Descargar** / **Cargar**.

Navegadores recomendados: Google Chrome, Microsoft Edge o Mozilla Firefox en versiones actuales.

---

## 3. Base de datos SQLite

### Tablas

| Tabla | Propósito | Claves |
|---|---|---|
| `usuarios` | Responsables de recolecciones y salidas | PK `id_usuario` |
| `materiales` | Catálogo de materiales aprovechables | PK `id_material`, nombre único |
| `recolecciones` | Cada recolección realizada | PK `id_recoleccion`; FK a `materiales` y `usuarios` |
| `movimientos` | Libro de entradas y salidas del inventario | PK `id_movimiento`; FK a `materiales`, `usuarios` y `recolecciones` |

Relaciones: un material tiene muchas recolecciones y muchos movimientos; un usuario registra muchas recolecciones y movimientos; cada recolección genera exactamente un movimiento de entrada (`id_recoleccion` es `UNIQUE` en `movimientos`).

### Reglas de integridad

- **NOT NULL** en todos los datos obligatorios.
- **CHECK**: categorías permitidas, unidades (`kg`, `unidades`, `litros`), cantidades mayores que cero, fechas válidas en formato `AAAA-MM-DD`, cantidades enteras cuando la unidad es `unidades`, longitud del nombre, y que una entrada siempre venga de una recolección y una salida nunca.
- **Claves foráneas** con `ON DELETE RESTRICT`: no se puede borrar un material o usuario que tenga registros relacionados.
- **Índices** sobre categoría, fechas, material y tipo de movimiento, que son los campos por los que se filtra.
- **Triggers**:
  - `trg_movimiento_stock`: impide registrar una salida mayor que las existencias.
  - `trg_recoleccion_unidad` / `trg_movimiento_unidad`: la unidad debe coincidir con la del material.
  - `trg_movimiento_entrada`: una entrada debe coincidir con su recolección.

### Inventario calculado

Las existencias **no se guardan en ninguna columna**. La vista `vista_existencias` las calcula sumando las entradas y restando las salidas de `movimientos`. Por eso el inventario siempre es coherente con el historial y se actualiza solo después de cada operación.

### Transacciones

Registrar una recolección escribe en dos tablas (`recolecciones` y `movimientos`). Ambas inserciones se ejecutan dentro de `BEGIN … COMMIT`; si alguna falla se hace `ROLLBACK` y no queda ningún registro a medias.

### Consultas parametrizadas

Todas las consultas que usan datos escritos por el usuario usan marcadores `?` y pasan los valores por separado. Nunca se concatena texto del usuario dentro del SQL.

---

## 4. Cómo se guarda y recupera la base de datos

sql.js ejecuta SQLite **en la memoria del navegador**. Para que los datos no se pierdan:

1. **Guardado automático:** después de cada operación (crear, editar, eliminar, registrar), la base completa se exporta como archivo SQLite y se guarda en el almacenamiento del navegador (**IndexedDB**; si no está disponible, **localStorage**). Al volver a abrir la aplicación, se carga desde ahí. El indicador de la barra lateral muestra la hora del último guardado.
2. **Descargar:** el botón *Descargar* genera un archivo `ecogestion_AAAA-MM-DD_HHMM.sqlite`. Es una base SQLite real: puedes abrirla con *DB Browser for SQLite*, con la herramienta de bases de datos de otro IDE, o volver a cargarla en EcoGestión.
3. **Cargar:** el botón *Cargar* reemplaza la base actual por un archivo `.sqlite` que elijas. Antes de reemplazarla se verifica que sea SQLite válido, que tenga las cuatro tablas y que pase la comprobación de integridad. Si no, la base actual no se toca.
4. **Restaurar demo:** vuelve a crear la base con los datos de demostración (pide confirmación).

### Limitaciones del almacenamiento local

- Los datos viven **solo en el navegador y en el equipo donde se usan**. No hay sincronización entre computadores, navegadores ni usuarios. Para llevar los datos a otro equipo hay que descargar el `.sqlite` y cargarlo allí.
- Cada navegador (Chrome, Edge, Firefox) y cada dirección de apertura (`file://` o `localhost`) tiene un almacenamiento separado.
- Si se borran los datos de navegación del sitio, o se usa una ventana de incógnito, la base guardada se pierde. **Descarga copias de seguridad con frecuencia**, sobre todo antes de una presentación.
- Toda la base se carga en memoria; es adecuada para miles de registros, no para millones.
- El inicio de sesión y los permisos (versión 3) funcionan en este navegador; sin un servidor no son una protección fuerte. Ver la [sección 12](#12-qué-funciones-requieren-un-backend-para-ser-seguras).

---

## 5. Cómo probar cada módulo

Desde la versión 3 estos módulos son del **Administrador**: en la pantalla de inicio entra como *Laura Gómez* (acceso de demostración) o con el correo de Google configurado como administrador.

Antes de una demostración puedes pulsar **Restaurar demo** para partir de datos conocidos (3 usuarios, 10 materiales, 18 recolecciones y 7 salidas, con fechas relativas al día de hoy).

### Panel principal
1. Abre la aplicación: verás total de materiales, recolecciones, cantidad recolectada por unidad y existencias actuales.
2. Revisa *Actividad reciente* (últimos movimientos) y *Recolecciones por categoría*.
3. Registra una recolección desde el botón **Nueva recolección** de la parte superior y comprueba que los totales cambian.

### Gestión de materiales
1. **Nuevo material** → deja el nombre vacío y pulsa guardar: aparece un error en el campo.
2. Escribe un nombre que ya existe (por ejemplo *Botellas PET*): aparece "Ya existe un material con este nombre".
3. Escribe un nombre nuevo, elige categoría y unidad, y guarda: aparece en la tabla.
4. Escribe en el buscador parte del nombre: la tabla se filtra. Usa el selector para ver una sola categoría.
5. Pulsa el lápiz para editar la descripción y guarda.
6. Intenta eliminar *Botellas PET*: se rechaza porque tiene movimientos.
7. Elimina el material que creaste (sin movimientos): pide confirmación y desaparece.
8. Si un material ya tiene movimientos, su unidad de medida no se puede cambiar.

### Gestión de recolecciones
1. **Nueva recolección** → elige un material: la unidad se completa automáticamente.
2. Escribe `0` o un número negativo: aparece "La cantidad debe ser mayor que cero".
3. Deja sin responsable o sin fecha: se marca el campo obligatorio.
4. Para un material medido en `unidades`, prueba `2.5`: se rechaza porque debe ser entero.
5. Completa los datos y guarda: la recolección aparece primera en la tabla.

### Inventario
1. Ubica el material de la recolección anterior: su cantidad disponible aumentó.
2. Pulsa **Salida** e intenta retirar más de lo disponible: se rechaza.
3. Registra una salida válida indicando el motivo o destino: el disponible baja y el estado cambia a *Agotado* si llega a cero.

### Historial
1. Verás todas las entradas y salidas con fecha, tipo, material, cantidad, responsable y observaciones.
2. Elige un rango de fechas, un tipo o escribe un texto y pulsa **Filtrar**. *Limpiar* quita los filtros.
3. Pon la fecha inicial después de la final y pulsa *Filtrar*: aparece un aviso.
4. **Exportar CSV** descarga los movimientos mostrados.

### Reportes
1. *Recolecciones por fechas*: elige el rango y pulsa **Consultar**; se muestran las recolecciones y totales del período.
2. *Cantidades por material*: recolectado, salidas y existencias de cada material.
3. Estadísticas por categoría y resumen general.
4. Exporta cada reporte con su botón **Exportar CSV**.

### Persistencia y archivo SQLite
1. Registra algo, cierra la pestaña y vuelve a abrir `index.html`: los datos siguen ahí.
2. **Descargar** → guarda el `.sqlite`. Luego **Restaurar demo** → tus cambios desaparecen.
3. **Cargar** → elige el `.sqlite` descargado: tus cambios vuelven.
4. Intenta cargar un archivo que no sea SQLite (por ejemplo un `.txt` renombrado): se rechaza y la base actual sigue intacta.

---

## 6. Funcionalidades implementadas

- Panel con indicadores, actividad reciente y distribución por categoría.
- Materiales: registrar, editar, eliminar (solo sin movimientos), consultar, buscar por nombre y filtrar por categoría.
- Recolecciones: registro con material, cantidad, unidad automática, fecha, responsable y observaciones; validación de campos obligatorios y cantidades mayores que cero.
- Inventario calculado desde los movimientos, con registro de salidas validado contra las existencias.
- Historial completo de entradas y salidas con filtros por fecha, tipo y texto.
- Reportes: cantidades por material, recolecciones por rango de fechas, estadísticas y exportación a CSV (separador `;` y codificación UTF-8, se abre bien en Excel en español).
- SQLite real con claves primarias y foráneas, NOT NULL, CHECK, índices, triggers, vista y transacciones.
- Guardado automático en el navegador, descarga y carga del archivo `.sqlite`, y restauración de la demo.
- Mensajes de error comprensibles y diseño adaptable a computador, tableta y celular.

**Ampliación (versión 3):** ver la [sección 9](#9-ampliación-cuentas-roles-y-mercado).

**No implementado:** edición o anulación de recolecciones y salidas ya registradas, creación de usuarios responsables desde el módulo de recolecciones, mensajería interna, pagos y sincronización entre equipos.

---

## 7. Posibles errores y soluciones

| Problema | Causa probable | Solución |
|---|---|---|
| Pantalla "No se encontró la biblioteca sql.js" | Falta `js/lib/sql-asm.js` o se movió | Verifica que el archivo exista en `js/lib/` con ese nombre exacto. |
| Los datos no aparecen al abrir de otra forma | Se abrió desde IntelliJ (`localhost`) y luego con doble clic (`file://`), o en otro navegador | Usa siempre la misma forma de apertura, o descarga el `.sqlite` y cárgalo en la otra. |
| Los datos se perdieron | Se borró el historial / datos de sitios, o se usó modo incógnito | Carga la última copia `.sqlite` descargada. |
| Indicador "No se pudo guardar" | Almacenamiento del navegador lleno o bloqueado | Pulsa **Descargar** para no perder los cambios; libera espacio o permite el almacenamiento del sitio. |
| "La base guardada en el navegador no se pudo abrir" | Copia guardada dañada | En esa pantalla usa la opción para reiniciar la base, o carga una copia `.sqlite`. |
| "El archivo no es una base de datos SQLite válida de EcoGestión" | Se eligió un archivo que no es SQLite o no tiene las tablas | Elige un `.sqlite` descargado desde EcoGestión. |
| "No se puede eliminar … porque tiene movimientos asociados" | Regla de integridad del historial | Es el comportamiento esperado; solo se eliminan materiales sin movimientos. |
| "No puedes retirar más de …" | La salida supera las existencias | Registra una cantidad menor o igual a la disponible. |
| La unidad del material está bloqueada al editar | El material ya tiene movimientos | Es intencional: cambiarla haría incoherente el inventario. |
| El CSV se ve en una sola columna en Excel | Excel configurado con separador de lista distinto de `;` | En Excel: *Datos → Desde texto/CSV* y elige punto y coma como separador. |
| Cambié un `.sql` y no se refleja | La app usa la copia de `js/datos_sql.js` | Copia el cambio en `datos_sql.js` y pulsa **Restaurar demo**. |
| IntelliJ no muestra el icono del navegador | Configuración de navegadores | *File → Settings → Tools → Web Browsers and Preview* y activa un navegador instalado; o abre `index.html` con doble clic. |

---

## 8. Notas técnicas

- Al exportar, sql.js reabre la base internamente y SQLite desactiva las claves foráneas en cada conexión nueva; `database.js` las vuelve a activar (`PRAGMA foreign_keys = ON`) después de cada exportación.
- `PRAGMA user_version` guarda la versión del esquema (actualmente 3). Al abrir una base de una versión anterior se actualiza automáticamente: la versión 2 corrige el trigger de stock para tolerar diferencias de redondeo; la versión 3 agrega las tablas del mercado sin modificar las existentes y conserva todos los datos.

---

## 9. Ampliación: cuentas, roles y mercado

### Archivos nuevos

| Archivo | Contenido |
|---|---|
| `database/esquema_mercado.sql` | Tablas `roles`, `permisos`, `roles_permisos`, `perfiles`, `empresas`, `necesidades_empresa`, `publicaciones`, `fotos_publicacion`, `ofertas`, `transacciones`; índices, triggers y catálogo de roles y permisos |
| `database/datos_mercado.sql` | Cuentas, publicaciones, ofertas y necesidades de demostración |
| `css/mercado.css` | Estilos nuevos con los mismos colores y componentes del diseño actual |
| `js/config.js` | Client ID de Google, correos administradores y acceso de demostración |
| `js/sesion.js` | Google Identity Services, registro, sesión, permisos y menú por rol |
| `js/perfil.js` | Perfil del usuario |
| `js/mercado.js` | Mercado, filtros, detalle, contacto y envío de ofertas |
| `js/publicaciones.js` | Publicaciones del vendedor y fotografías |
| `js/ofertas.js` | Ofertas y negociaciones (aceptar, rechazar, cancelar, completar) |
| `js/empresa.js` | Panel empresarial |
| `js/administracion.js` | Administración de usuarios, supervisión y estadísticas |

### Archivos existentes modificados

| Archivo | Cambio |
|---|---|
| `index.html` | Iconos nuevos; menú con atributos `data-permiso`; tarjeta de usuario; vistas, modales y pantalla de acceso nuevos; carga de los scripts nuevos. El marcado anterior no se eliminó. |
| `js/app.js` | Solo abre vistas permitidas; refresca solo los módulos que la cuenta puede ver; inicia la sesión al arrancar; revisa la sesión después de cargar o restaurar la base. |
| `js/database.js` | La base nueva incluye el mercado; migración automática a la versión 3. |
| `js/datos_sql.js` | Copia embebida de los dos `.sql` nuevos. |
| `js/utilidades.js` | Mensajes comprensibles para los errores de las reglas nuevas. |
| `README.md` | Esta documentación. |

`materiales.js`, `recolecciones.js`, `inventario.js`, `historial.js`, `reportes.js`, `panel.js`, `almacenamiento.js`, `estilos.css` y las tablas originales no se modificaron.

### Modelo de datos nuevo

- **`roles` y `permisos`** (relación muchos a muchos con `roles_permisos`). El menú y cada acción se habilitan según los permisos leídos de la base.
- **`perfiles`** amplía `usuarios` (relación 1 a 1). El nombre y el correo **siguen en `usuarios`**; el perfil agrega el tipo de cuenta, el identificador de Google (`google_sub`), la foto, el teléfono, la ubicación y si la cuenta está activa. `usuarios.rol` conserva su significado original (rol en el centro de acopio).
- **`empresas`** (1 a 1 con el usuario) y **`necesidades_empresa`** (cantidades mínima y máxima y precio ofrecido).
- **`publicaciones`** y **`fotos_publicacion`** (hasta 3 fotos por publicación, guardadas dentro de la base como imágenes JPEG reducidas a 900 px).
- **`ofertas`**: comprador, publicación (de la que se obtiene el vendedor), cantidad, precio, fecha y estado (*Pendiente, Aceptada, Rechazada, Cancelada, Completada*).
- **`transacciones`**: la operación que nace cuando el vendedor acepta una oferta (*En curso, Completada, Cancelada*).

Reglas de integridad en la base:
- `cantidad_disponible >= 0`: la base impide vender más material del publicado.
- Trigger `trg_oferta_validar`: solo compradores o empresas activos ofertan; nunca sobre lo propio; solo sobre publicaciones activas y sin superar lo disponible.
- Trigger `trg_oferta_estado`: solo permite los cambios de estado válidos (Pendiente → Aceptada/Rechazada/Cancelada; Aceptada → Completada/Cancelada).
- Índice único parcial: un comprador solo puede tener una oferta pendiente por publicación.
- Solo vendedores activos publican; solo cuentas de empresa tienen perfil empresarial; las transacciones solo existen para ofertas aceptadas.

Operaciones con **transacciones SQLite** (todo o nada): aceptar una oferta (descuenta la cantidad, cambia la oferta y crea la transacción), cancelar una negociación aceptada (devuelve la cantidad), completar, retirar una publicación (rechaza sus ofertas pendientes), crear una cuenta (usuario + perfil + empresa) y guardar una publicación con sus fotos.

### Tipos de cuenta

| Tipo | Ve en el menú | Puede |
|---|---|---|
| **Administrador** | Todo el sistema original, Mercado, Usuarios y supervisión, Mi perfil | Activar/desactivar cuentas, cambiar el tipo de cuenta, consultar todas las publicaciones y negociaciones, ver estadísticas, exportar negociaciones a CSV, administrar la base de datos |
| **Vendedor** | Mercado, Mis publicaciones, Ofertas, Mi perfil | Publicar con fotos, precio por kg o unidad y ubicación; editar, retirar o eliminar lo propio; aceptar o rechazar ofertas; completar ventas; ver su historial de ventas |
| **Comprador** | Mercado, Ofertas, Mi perfil | Buscar por tipo de residuo y ubicación, ver precios y cantidades, contactar al vendedor, ofertar, cancelar, ver sus compras |
| **Empresa recicladora** | Mercado, Ofertas, Panel empresarial, Mi perfil | Perfil empresarial, publicar necesidades (mín./máx. y precio), buscar vendedores, ofertar, ver compras e historial |

Nadie puede elegir ser administrador al registrarse: entran como administradores los correos de `CORREOS_ADMINISTRADORES` en `js/config.js`, o las cuentas a las que otro administrador les asigne ese tipo.

---

## 10. Cómo probar los módulos nuevos

Para la presentación, usa el **Acceso de demostración** de la pantalla de inicio (no requiere Google). Las cuentas de prueba son: Laura Gómez (Administrador), Carlos Ramírez y Marta Rojas (Vendedores), Andrea Torres y Jorge Medina (Compradores) y Recicladora Andina (Empresa recicladora). Para cambiar de cuenta, usa el botón de salida junto a tu nombre, abajo en la barra lateral.

1. **Pantalla de acceso y roles.** Entra con cada cuenta y comprueba que el menú solo muestra sus opciones. El administrador conserva todo el sistema original.
2. **Vendedor (Carlos).** *Mis publicaciones → Nueva publicación*: deja campos vacíos (aparecen errores), prueba precio 0 o 2,5 unidades (se rechazan), agrega 1 a 3 fotos y guarda. Edita el precio y quita una foto. En *Mercado* aparece con la etiqueta "Tu publicación" y sin botón de oferta.
3. **Comprador (Andrea).** *Mercado*: filtra por tipo (Plástico, Cartón, Papel, Vidrio, Metal, Otros) y por ubicación (por ejemplo "Kennedy"). *Ver detalle* muestra las fotos y el contacto del vendedor. *Hacer oferta*: pide más de lo disponible (se rechaza), luego una cantidad válida; el total se calcula en vivo. Intenta ofertar otra vez por lo mismo: se bloquea mientras haya una pendiente.
4. **Negociación (Carlos).** *Ofertas* muestra un contador de pendientes en el menú. *Aceptar*: la cantidad de la publicación baja, y si llega a cero queda *Agotada*. *Marcar completada* la pasa al *Historial de ventas*. Desde la cuenta del comprador, *Cancelar* una negociación aceptada devuelve la cantidad.
5. **Regla de no sobreventa.** Con Marta, edita "Cartón corrugado" a 50 kg y acepta la oferta pendiente de 80 kg: se rechaza y no cambia nada (ROLLBACK). *Retirar* la publicación rechaza las ofertas pendientes.
6. **Empresa (Recicladora Andina).** *Panel empresarial*: publica una necesidad (prueba máximo menor que mínimo: se rechaza), edita el perfil, busca vendedores por tipo y usa *Ver publicaciones*. En *Mercado → Necesidades de empresas* aparece lo publicado.
7. **Administrador (Laura).** *Usuarios y supervisión*: desactiva una cuenta (ya no aparece en el acceso ni en el mercado) y cambia el tipo de otra. Revisa *Publicaciones*, *Transacciones* (con exportación CSV) y *Estadísticas*.
8. **Perfil.** *Mi perfil* muestra foto, nombre, correo, tipo de cuenta y permisos; permite editar teléfono y ubicación.
9. **Google.** Con el Client ID configurado (sección 11), abre la app desde IntelliJ y pulsa *Continuar con Google*. Una cuenta nueva elige su tipo; la siguiente vez entra directamente.

---

## 11. Configurar Google Identity Services

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto (o usa uno existente).
2. Ve a **Google Auth Platform → Branding** (pantalla de consentimiento): escribe el nombre de la aplicación ("EcoGestión") y tu correo de soporte, y guarda. Si te pide el tipo de usuario, elige **Externo**. Mientras la app esté en modo de prueba, agrega en **Audience** los correos que podrán iniciar sesión.
3. Ve a **Clients → Create client**, elige **Web application**.
4. En **Authorized JavaScript origins** agrega **los dos**:
   - `http://localhost`
   - `http://localhost:63342` (el puerto del servidor integrado de IntelliJ; si tu IntelliJ usa otro, revisa la barra de direcciones del navegador).
   No necesitas *Authorized redirect URIs*.
5. Copia el **Client ID** (termina en `.apps.googleusercontent.com`) y pégalo en `js/config.js`:
   ```js
   GOOGLE_CLIENT_ID: '1234567890-abc123.apps.googleusercontent.com',
   ```
   Google también genera un *client secret*: **no lo pongas en el proyecto**, el navegador no lo necesita.
6. Abre `index.html` **desde IntelliJ** (no con doble clic: Google no acepta páginas `file://`). Aparecerá el botón *Continuar con Google*.
7. `CORREOS_ADMINISTRADORES` en `js/config.js` ya incluye tu correo, que entrará como Administrador.
8. Cuando ya no necesites las cuentas de prueba, cambia `PERMITIR_ACCESO_DEMO` a `false`.

Qué hace la aplicación con Google: recibe un *ID token* con nombre, correo, foto y un identificador (`sub`). Guarda el identificador, el nombre, el correo y la URL de la foto. **Nunca recibe ni guarda la contraseña de Google.**

---

## 12. Qué funciones requieren un backend para ser seguras

La arquitectura pedida (sin servidor) permite demostrar el flujo completo, pero estas partes **no son seguras sin un componente de servidor**:

| Función | Situación actual | Qué se necesita |
|---|---|---|
| Verificar el token de Google | En el navegador se comprueban emisor, destinatario (`aud`), vencimiento y correo verificado, pero **no la firma**. Un usuario técnico podría fabricar un token. | Un servidor que reciba el token y lo verifique con la biblioteca oficial de Google (por ejemplo `google-auth-library`, `verifyIdToken`) o con las claves públicas de Google. |
| Sesión | Se guarda en `localStorage` del navegador. | Sesión emitida por el servidor (cookie `HttpOnly` y `Secure`) tras verificar el token. |
| Roles y permisos | Se aplican en la interfaz y con triggers en la base local, pero el usuario controla su navegador y podría editar la base. | Comprobación de permisos en cada petición al servidor. |
| Datos compartidos del mercado | **Cada navegador tiene su propia base.** Un vendedor y un comprador solo se ven si usan el mismo navegador del mismo computador. No hay sincronización entre equipos. | Una base de datos central (SQLite, PostgreSQL, etc.) detrás de una API. |
| Fotografías | Se guardan dentro de la base local (aumentan su tamaño). | Almacenamiento de archivos en el servidor. |
| Contacto | Enlaces de correo y teléfono; no hay mensajería. | Servicio de mensajes o notificaciones. |
| Acceso de demostración | Entra sin autenticación a las cuentas de prueba. | Desactivarlo (`PERMITIR_ACCESO_DEMO: false`) en cualquier uso real. |

Para la presentación académica esto se puede explicar así: *la integración con Google está implementada y funciona; la verificación criptográfica del token y los datos compartidos entre usuarios corresponden a la siguiente fase, que requiere un servidor.*

---

## 13. Errores frecuentes del inicio de sesión

| Problema | Causa | Solución |
|---|---|---|
| "Inicio con Google sin configurar" | `GOOGLE_CLIENT_ID` vacío | Sigue la sección 11. |
| "Google no permite iniciar sesión desde un archivo abierto con doble clic" | Página abierta con `file://` | Ábrela desde IntelliJ (`http://localhost:63342/...`). |
| "No se pudo cargar Google" | Sin Internet o un bloqueador impide cargar `accounts.google.com` | Revisa la conexión o desactiva el bloqueador para localhost. El acceso de demostración sigue funcionando. |
| Google muestra "origin_mismatch" o "The given origin is not allowed for the given client ID" | El origen exacto (con puerto) no está autorizado | Agrega `http://localhost` y `http://localhost:PUERTO` en *Authorized JavaScript origins*. El cambio puede tardar unos minutos en aplicarse. |
| "Access blocked" / la cuenta no puede entrar | La app está en modo de prueba y el correo no está en la lista de usuarios de prueba | Agrégalo en *Audience* en Google Cloud Console. |
| "El token no corresponde a esta aplicación" | El Client ID de `config.js` no coincide con el del botón | Copia de nuevo el Client ID completo. |
| "Esta cuenta está desactivada" | Un administrador la desactivó | Otro administrador debe activarla en *Usuarios y supervisión*. |
| "Ese correo ya está asociado a otra cuenta" | El correo existe en la base con otra cuenta | Usa otra cuenta de Google o pide al administrador que revise los usuarios. |
| Después de *Restaurar demo* se cerró la sesión | Tu cuenta de Google no existe en la base de demostración | Vuelve a iniciar sesión; se crea de nuevo. |
| La sesión de Google y la de demostración se mezclan | Se comparte el navegador | Cierra sesión con el botón junto a tu nombre antes de cambiar de cuenta. |
