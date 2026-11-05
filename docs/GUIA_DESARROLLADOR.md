# Guía para desarrolladores · EcoGestión

Documento técnico para quien mantenga o extienda EcoGestión: arquitectura, modelo de datos, seguridad, convenciones y cómo agregar funcionalidades. El manual para usuarios finales está en [`ayuda.html`](../ayuda.html) y la puesta en marcha en el [README](../README.md).

**Contenido**
1. [Visión general](#1-visión-general)
2. [Estructura del código](#2-estructura-del-código)
3. [Inicio de sesión](#3-inicio-de-sesión)
4. [Sincronización y réplica SQLite](#4-sincronización-y-réplica-sqlite)
5. [Modelo de datos](#5-modelo-de-datos)
6. [Seguridad](#6-seguridad)
7. [Funciones del servidor (RPC)](#7-funciones-del-servidor-rpc)
8. [Patrones del cliente](#8-patrones-del-cliente)
9. [Cómo agregar una funcionalidad](#9-cómo-agregar-una-funcionalidad)
10. [Cambios de esquema](#10-cambios-de-esquema)
11. [Configuración, entornos y despliegue](#11-configuración-entornos-y-despliegue)
12. [Pruebas](#12-pruebas)
13. [Convenciones](#13-convenciones)
14. [Limitaciones conocidas y trabajo futuro](#14-limitaciones-conocidas-y-trabajo-futuro)
15. [Solución de problemas](#15-solución-de-problemas)

---

## 1. Visión general

EcoGestión es una aplicación web **estática** (HTML, CSS y JavaScript sin frameworks ni paso de compilación) respaldada por **Supabase**:

```mermaid
flowchart LR
    subgraph Navegador
        UI["Interfaz<br/>index.html + módulos JS"]
        R[("Réplica SQLite<br/>sql.js, en memoria")]
        GIS["Google Identity<br/>Services"]
    end
    subgraph Supabase
        AUTH["Auth<br/>verifica el token de Google"]
        API["API REST<br/>PostgREST"]
        PG[("PostgreSQL<br/>tablas + RLS + funciones")]
        ST["Storage<br/>bucket fotos"]
    end
    GIS -- "ID token + nonce" --> AUTH
    AUTH -- "sesión (JWT)" --> UI
    UI -- "SQL de lectura" --> R
    API -- "SELECT según RLS" --> R
    UI -- "POST /rpc/función" --> API
    API --> PG
    UI -- "subir foto" --> ST
```

**Decisiones de diseño**

| Decisión | Motivo |
|---|---|
| **Réplica SQLite local para leer** | Conserva el diseño académico original: todas las consultas, filtros y reportes son SQL sobre SQLite (sql.js). La interfaz no espera a la red para filtrar ni ordenar. |
| **Escrituras solo por funciones del servidor** | Cada operación valida permisos y datos en un único lugar confiable y es atómica. Las tablas no tienen políticas de escritura. |
| **Supabase Auth con el token de Google** | La firma del token se verifica en el servidor; el navegador nunca maneja secretos. |
| **Cliente REST propio (`nube.js`)** | Sin dependencias ni CDN de terceros para los datos. Son unas 200 líneas, fáciles de leer y de probar contra PostgREST local. |
| **Sin frameworks ni bundler** | Requisito del proyecto. Se abre en IntelliJ y se publica en GitHub Pages tal como está. |

---

## 2. Estructura del código

```
index.html               Todas las vistas, modales y la pantalla de acceso (una sola página)
ayuda.html               Manual de usuario
css/estilos.css          Diseño base (tokens de color en :root)
css/mercado.css          Componentes de acceso, mercado, ofertas y administración
css/ayuda.css            Estilos del manual
supabase/esquema_supabase.sql   Base central: tablas, triggers, RLS, funciones, Storage, catálogos
database/esquema.sql            Esquema SQLite del centro de acopio (réplica)
database/esquema_mercado.sql    Esquema SQLite del mercado (réplica)
js/…                     Ver tabla
pruebas/                 Supabase simulado + pruebas SQL y de navegador
herramientas/            generar_datos_sql.js (regenera la copia embebida del esquema)
img/ayuda/               Capturas del manual
```

Los scripts se cargan en este orden (`index.html`, al final del `<body>`); cada uno registra un objeto en `window.Eco`:

| Archivo | Objeto | Responsabilidad |
|---|---|---|
| `lib/sql-asm.js` | `initSqlJs` | Motor SQLite compilado a JavaScript (asm.js, funciona incluso con `file://`) |
| `utilidades.js` | `Eco.Util` | Formatos (números, fechas, dinero), CSV, errores de campo, avisos, `mensajeError` |
| `datos_sql.js` | `Eco.SQL` | Copia embebida de `database/*.sql` para crear la réplica |
| `database.js` | `Eco.DB` | Réplica: `iniciar`, `cargarReplica`, `consultar`, `consultarUno`, `escalar`, `contar`, `exportar` |
| `materiales.js` … `panel.js` | `Eco.Materiales`, `Eco.Recolecciones`, `Eco.Inventario`, `Eco.Historial`, `Eco.Reportes`, `Eco.Panel` | Centro de acopio |
| `config.js` | `Eco.Config` | Client ID de Google, URL y clave pública de Supabase |
| `nube.js` | `Eco.Nube` | Auth, `rpc`, `sincronizar`, `subirFoto` |
| `sesion.js` | `Eco.Sesion` | Google, registro, permisos, menú por rol, revalidación |
| `perfil.js`, `mercado.js`, `publicaciones.js`, `ofertas.js`, `empresa.js`, `administracion.js` | `Eco.Perfil`, `Eco.Mercado` (+ `Eco.MercadoUtil`), `Eco.Publicaciones`, `Eco.Ofertas`, `Eco.Empresa`, `Eco.Administracion` | Mercado y cuentas |
| `app.js` | `Eco.App` | Arranque, navegación, modales, confirmaciones, `despuesDeCambio`, actualización periódica |

---

## 3. Inicio de sesión

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuario
    participant S as sesion.js
    participant G as Google (GIS)
    participant A as Supabase Auth
    participant P as PostgreSQL
    S->>S: nonce aleatorio y su SHA-256
    S->>G: initialize({client_id, nonce: sha256})
    U->>G: Continuar con Google
    G-->>S: ID token (incluye el nonce cifrado)
    S->>A: POST /auth/v1/token?grant_type=id_token {id_token, nonce}
    A->>A: verifica firma, emisor, destinatario y nonce
    A-->>S: access_token + refresh_token
    S->>P: rpc iniciar_sesion()
    alt cuenta existente y activa
        P-->>S: {estado: ok, id_usuario}
        S->>P: sincronizar (lecturas según RLS)
    else correo en correos_administradores
        P-->>S: crea la cuenta de administrador → ok
    else cuenta nueva
        P-->>S: {estado: registro, nombre, correo, foto}
        U->>S: tipo de cuenta + ubicación
        S->>P: rpc registrar_cuenta(...)
    else cuenta desactivada
        P-->>S: {estado: inactivo} → se cierra la sesión
    end
```

- La sesión (tokens) se guarda en `localStorage` (`ecogestion_supabase_sesion`). `Eco.Nube.asegurarToken()` la renueva cuando le quedan menos de 90 s.
- Al recargar, `Eco.Sesion.iniciar()` restaura la sesión y vuelve a llamar `iniciar_sesion()`.
- `Eco.Sesion.revalidar()` se ejecuta después de cada sincronización: si la cuenta fue desactivada se cierra la sesión, y si cambió su tipo se aplican los nuevos permisos.
- Cerrar sesión llama `/auth/v1/logout`, borra los tokens y recarga la página para no dejar datos en pantalla.

---

## 4. Sincronización y réplica SQLite

`Eco.Nube.sincronizar()`:

1. Para cada tabla de `Eco.DB.TABLAS_REPLICA`, pide **solo las columnas que existen en la réplica** (`Eco.DB.columnas(tabla)`), de 1000 en 1000 filas (`Range`). Así nunca se descargan columnas internas como `usuarios.auth_id`.
2. Las 14 tablas se piden en paralelo; RLS decide qué filas llegan.
3. `Eco.DB.cargarReplica(datos)` construye una **base nueva** y solo al final reemplaza la anterior. Una descarga fallida no deja la réplica a medias.

En la réplica:
- Se eliminan los triggers: las reglas ya se aplicaron en el servidor.
- `PRAGMA foreign_keys = OFF`: la cuenta puede no ver todas las filas referenciadas (por ejemplo, un comprador no ve `materiales`).
- Se inserta con `INSERT OR IGNORE`; si una fila no cumple un `CHECK` local se omite y se avisa en la consola.

**Cuándo se sincroniza:** al iniciar sesión, después de cada operación (`Eco.App.despuesDeCambio`), cada 30 s si la pestaña está visible y no hay un modal abierto, al volver a la pestaña (`focus`) y con el botón *Sincronizar* (solo administradores).

**Tipos de datos:** PostgREST devuelve `numeric` como número JSON, `date` como `AAAA-MM-DD` y `timestamp` como `AAAA-MM-DDTHH:MM:SS.ffffff`. Los timestamps se guardan en **hora de Bogotá sin zona** (`now() at time zone 'America/Bogota'`), así coinciden con el formato que la interfaz ya usaba con SQLite.

---

## 5. Modelo de datos

```mermaid
erDiagram
    roles ||--o{ roles_permisos : tiene
    permisos ||--o{ roles_permisos : otorga
    roles ||--o{ perfiles : define
    usuarios ||--|| perfiles : amplia
    usuarios ||--o| empresas : representa
    empresas ||--o{ necesidades_empresa : publica
    usuarios ||--o{ publicaciones : vende
    publicaciones ||--o{ fotos_publicacion : muestra
    publicaciones ||--o{ ofertas : recibe
    usuarios ||--o{ ofertas : compra
    ofertas ||--o| transacciones : genera
    materiales ||--o{ recolecciones : recibe
    materiales ||--o{ movimientos : registra
    recolecciones ||--o| movimientos : origina
    usuarios ||--o{ recolecciones : responde

    usuarios {
        bigint id_usuario PK
        uuid auth_id UK
        text nombre UK
        text rol
        text correo UK
    }
    perfiles {
        bigint id_usuario PK, FK
        bigint id_rol FK
        text google_sub UK
        text foto_url
        text telefono
        text ubicacion
        smallint activo
    }
    publicaciones {
        bigint id_publicacion PK
        bigint id_vendedor FK
        text tipo_residuo
        text nombre_material
        numeric cantidad_disponible
        text unidad
        numeric precio_unitario
        text estado
    }
    ofertas {
        bigint id_oferta PK
        bigint id_publicacion FK
        bigint id_comprador FK
        numeric cantidad
        numeric precio_unitario
        text estado
    }
    transacciones {
        bigint id_transaccion PK
        bigint id_oferta FK, UK
        text estado
        timestamp fecha_cierre
    }
    movimientos {
        bigint id_movimiento PK
        bigint id_material FK
        bigint id_recoleccion FK, UK
        text tipo
        numeric cantidad
        date fecha
    }
```

Notas:
- **`usuarios.rol`** conserva su significado original (rol en el centro de acopio: `Administrador`/`Operador`). El **tipo de cuenta** de la plataforma es `perfiles.id_rol`. Las funciones del servidor mantienen ambos sincronizados.
- **El vendedor de una oferta no se guarda en `ofertas`**: se obtiene de `publicaciones.id_vendedor`, para no duplicar datos.
- **`transacciones`** representa la operación comercial (*En curso → Completada/Cancelada*). La cantidad y el precio se leen de la oferta.
- **Inventario:** las existencias no se almacenan; la vista `vista_existencias` (réplica) las calcula sumando entradas y restando salidas de `movimientos`.
- **Restricciones relevantes:** `cantidad_disponible >= 0`, cantidades enteras cuando la unidad es `unidades`, `cantidad_maxima >= cantidad_minima`, índice único parcial `ux_oferta_pendiente` (una oferta pendiente por comprador y publicación), y `chk_transaccion_cierre` (`fecha_cierre` solo existe al cerrar).
- **Triggers en PostgreSQL:** `trg_movimiento_validar` (unidad coincide con el material; una salida no supera las existencias) y `trg_oferta_estado` (transiciones válidas).

---

## 6. Seguridad

### Capas

| Capa | Qué protege |
|---|---|
| Supabase Auth | Identidad: verifica la firma del token de Google y el nonce |
| `GRANT` | `anon` no tiene acceso a nada. `authenticated` solo puede hacer `SELECT` en las tablas y ejecutar las funciones listadas |
| RLS (lectura) | Qué filas ve cada cuenta (tabla siguiente) |
| Funciones `security definer` | Únicas que escriben. Empiezan con `exigir('permiso')` y validan propiedad y estado |
| Constraints y triggers | Integridad aunque una función tuviera un error |
| Interfaz (`data-permiso`, `Eco.Sesion.exigir`) | Solo comodidad: oculta opciones. **No** es una barrera de seguridad |

### Políticas de lectura (RLS)

| Tabla | Quién puede leer |
|---|---|
| `roles`, `permisos`, `roles_permisos` | Cualquier sesión |
| `usuarios`, `perfiles`, `empresas`, `necesidades_empresa`, `publicaciones`, `fotos_publicacion` | Cuentas registradas y activas (`yo() is not null`) |
| `materiales`, `recolecciones`, `movimientos` | Permiso `inventario.gestionar` |
| `ofertas` | El comprador, el vendedor de la publicación o quien tenga `mercado.supervisar` |
| `transacciones` | Quien pueda ver la oferta correspondiente |
| `correos_administradores` | Nadie desde la API |

### Funciones auxiliares

- `yo()`: el `id_usuario` de la sesión actual, solo si está activa.
- `tiene_permiso(codigo)`: consulta `roles_permisos` del rol de la cuenta.
- `exigir(codigo)`: lanza "No tienes permiso…" si no se tiene el permiso, y devuelve `yo()`.

Todas son `security definer` con `set search_path = public`, para evitar la sustitución de objetos por `search_path`.

### Storage

Bucket público `fotos` (solo JPEG, máximo 2 MB). Cada cuenta solo puede subir o borrar dentro de su carpeta `<auth.uid()>/…`. El cliente reduce las fotos a 900 px y JPEG de calidad 0,78 antes de subirlas.

### Datos que nunca van al navegador
El *client secret* de Google (solo en Supabase → Providers), la `service_role`/`secret` key de Supabase y la contraseña de la base. En `config.js` solo hay datos públicos por diseño: el Client ID y la clave *publishable/anon*, que es segura porque todo está protegido por RLS y `GRANT`.

---

## 7. Funciones del servidor (RPC)

Se llaman con `await Eco.Nube.rpc('nombre', { p_param: valor })`. Si fallan, lanzan un `Error` con `mensajeServidor` en español, que `Eco.Util.mensajeError` muestra tal cual.

| Función | Permiso | Parámetros | Efecto |
|---|---|---|---|
| `iniciar_sesion()` | sesión | — | `{estado: ok\|registro\|inactivo}`. Actualiza la foto y el último acceso; promueve los correos administradores |
| `registrar_cuenta` | sesión sin cuenta | `p_tipo, p_ubicacion, p_telefono, p_razon_social, p_nit` | Crea `usuarios` + `perfiles` (+ `empresas`). Nombre único automático |
| `actualizar_perfil` | `perfil.editar` | `p_telefono, p_ubicacion` | — |
| `guardar_material` | `inventario.gestionar` | `p_id` (null = nuevo), `p_nombre, p_categoria, p_unidad, p_descripcion` | No permite cambiar la unidad si hay movimientos |
| `eliminar_material` | `inventario.gestionar` | `p_id` | Solo sin movimientos |
| `registrar_recoleccion` | `inventario.gestionar` | `p_id_material, p_id_responsable, p_cantidad, p_fecha, p_observaciones` | Recolección + movimiento de entrada |
| `registrar_salida` | `inventario.gestionar` | ídem | Movimiento de salida (trigger de existencias) |
| `guardar_publicacion` | `publicaciones.gestionar` | `p_id, p_tipo, p_nombre, p_descripcion, p_cantidad, p_unidad, p_precio, p_ubicacion, p_fotos text[]` | Crea o edita la publicación y reemplaza sus fotos |
| `cambiar_estado_publicacion` | `publicaciones.gestionar` | `p_id, p_accion` (`retirar`\|`reactivar`) | Retirar rechaza las ofertas pendientes |
| `eliminar_publicacion` | `publicaciones.gestionar` | `p_id` | Solo sin ofertas |
| `enviar_oferta` | `ofertas.enviar` | `p_id_publicacion, p_cantidad, p_precio, p_mensaje` | Valida estado, propiedad, cantidad y unicidad |
| `responder_oferta` | según la acción | `p_id, p_accion` (`aceptar`\|`rechazar`\|`cancelar`\|`completar`) | Aceptar descuenta la cantidad y crea la transacción; cancelar una aceptada la devuelve |
| `guardar_empresa` | `empresa.gestionar` | `p_razon_social, p_nit, p_telefono, p_correo, p_direccion, p_ciudad, p_descripcion` | Crea o actualiza (`on conflict`) |
| `guardar_necesidad` | `empresa.gestionar` | `p_id, p_tipo, p_descripcion, p_minima, p_maxima, p_unidad, p_precio` | — |
| `accion_necesidad` | `empresa.gestionar` | `p_id, p_accion` (`estado`\|`eliminar`) | — |
| `admin_estado_usuario` | `usuarios.gestionar` | `p_id, p_activo` | No a sí mismo; siempre queda un administrador activo |
| `admin_rol_usuario` | `usuarios.gestionar` | `p_id, p_rol` | Si deja de ser vendedor, rechaza sus ofertas pendientes |

Bloqueos: las funciones que modifican cantidades usan `select … for update` sobre la oferta y la publicación, así dos aceptaciones simultáneas no pueden vender el mismo material.

---

## 8. Patrones del cliente

### Módulo típico

```js
(function () {
    'use strict';
    const Eco = window.Eco = window.Eco || {};

    function render() {
        if (!Eco.Sesion.puedeVerVista('mi-vista')) return;      // solo si la cuenta puede verla
        const filas = Eco.DB.consultar('SELECT … WHERE x = ?', [valor]);   // SIEMPRE parametrizado
        document.getElementById('tabla-body').innerHTML =
            filas.map((f) => `<tr><td>${Eco.Util.escaparHtml(f.nombre)}</td></tr>`).join('');
    }

    async function guardar(evento) {
        evento.preventDefault();
        // 1) Validar en el cliente (mensajes junto a cada campo)
        // 2) Escribir en el servidor
        try {
            await Eco.Nube.rpc('mi_funcion', { p_dato: dato });
            Eco.App.cerrarModal('modal-x');
            await Eco.App.despuesDeCambio('Guardado.');            // sincroniza y redibuja todo
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo guardar.'), 'error');
        }
    }

    function init() { /* listeners; se llama una vez al arrancar */ }
    Eco.MiModulo = { init, render };
})();
```

Reglas:
- **`render()` solo lee la réplica** y es idempotente. `Eco.App.refrescarTodo()` lo llama en todos los módulos permitidos.
- **Toda escritura va por `Eco.Nube.rpc`**, seguida de `Eco.App.despuesDeCambio(mensaje)`.
- **Validar dos veces:** en el cliente para dar mensajes claros por campo, y en el servidor como garantía.
- **Escapar todo** lo que va a `innerHTML` con `Eco.Util.escaparHtml`.
- **Delegación de eventos:** las tablas usan `data-accion` y `data-id` con un listener en el `tbody`, sin `onclick` en el HTML.

### Permisos en la interfaz

- `data-permiso="perm1 perm2"` en cualquier elemento lo oculta si la cuenta no tiene ninguno de esos permisos (`Eco.Sesion.aplicarPermisosUI`).
- `PERMISOS_VISTA` en `sesion.js` relaciona cada vista con sus permisos; `Eco.App.irA` no abre vistas no permitidas.

### Modales y confirmaciones

- Los modales se declaran en `index.html` (`.modal-fondo`) y se abren con `Eco.App.abrirModal(id)`. Los botones con `data-cerrar-modal="id"` los cierran.
- Para confirmar: `if (await Eco.App.confirmar({ titulo, mensaje, textoConfirmar, peligro })) { … }`.

---

## 9. Cómo agregar una funcionalidad

### Ejemplo A: el administrador puede retirar cualquier publicación (sin cambiar tablas)

1. **Servidor:** crea `supabase/migraciones/001_admin_retirar.sql`:
   ```sql
   create or replace function public.admin_retirar_publicacion(p_id bigint) returns void
   language plpgsql security definer set search_path = public as $$
   begin
       perform exigir('mercado.supervisar');
       update ofertas set estado = 'Rechazada', fecha_respuesta = ahora_bogota()
        where id_publicacion = p_id and estado = 'Pendiente';
       update publicaciones set estado = 'Retirada', fecha_actualizacion = ahora_bogota()
        where id_publicacion = p_id;
       if not found then raise exception 'No se encontró la publicación.'; end if;
   end $$;
   revoke execute on function public.admin_retirar_publicacion(bigint) from public, anon;
   grant execute on function public.admin_retirar_publicacion(bigint) to authenticated;
   ```
   Ejecútalo en el SQL Editor de Supabase. Agrega la misma función a `esquema_supabase.sql` para instalaciones nuevas.
2. **Cliente:** en `administracion.js → renderPublicaciones`, agrega un botón `data-accion="retirar"` y, en `init`, un listener que confirme y llame `await Eco.Nube.rpc('admin_retirar_publicacion', { p_id: id })` y luego `Eco.App.despuesDeCambio(…)`.
3. **Pruebas:** agrega el caso a `pruebas/prueba_sql.sh`: que un no administrador reciba "No tienes permiso".

### Ejemplo B: una tabla nueva

1. Crea la tabla en una migración de Supabase con su RLS (`enable row level security` + política `for select`), `grant select … to authenticated` y las funciones que la escriban.
2. Agrega la tabla equivalente en SQLite a `database/esquema_mercado.sql` (o `esquema.sql`) y regenera `js/datos_sql.js` con `node herramientas/generar_datos_sql.js`.
3. Agrega su nombre a `TABLAS_REPLICA` en `js/database.js`, respetando el orden de dependencias.
4. Si tiene una vista propia: agrega la `<section class="vista" id="vista-x">` en `index.html`, el ítem de menú con `data-permiso`, la entrada en `PERMISOS_VISTA` (`sesion.js`), el módulo en `refrescarTodo` (`app.js`) y su `init()` en `Eco.App.iniciar`.

### Agregar un permiso o cambiar los de un rol

```sql
insert into permisos (codigo, descripcion) values ('reportes.mercado', 'Ver reportes del mercado');
insert into roles_permisos (id_rol, id_permiso)
select r.id_rol, p.id_permiso from roles r, permisos p
where r.codigo = 'empresa' and p.codigo = 'reportes.mercado';
```

La interfaz lee los permisos de la réplica, así que el cambio se aplica en la siguiente sincronización.

---

## 10. Cambios de esquema

- **Supabase:** no vuelvas a ejecutar `esquema_supabase.sql` sobre una base con datos (falla en el primer `create table`). Escribe migraciones incrementales en `supabase/migraciones/NNN_descripcion.sql` (`alter table`, `create or replace function`…), ejecútalas en orden en el SQL Editor e incorpóralas también a `esquema_supabase.sql`.
- **Réplica SQLite:** `js/datos_sql.js` es una copia de `database/esquema.sql` y `database/esquema_mercado.sql`, embebida porque el navegador no permite leer `.sql` con `fetch()` desde `file://`. Después de editar los `.sql`, regenérala:
  ```bash
  node herramientas/generar_datos_sql.js
  ```
- Las columnas que existan en Supabase pero no en la réplica simplemente no se descargan. Para mostrarlas, agrégalas también a la réplica.

---

## 11. Configuración, entornos y despliegue

| Entorno | Dirección | Requisitos |
|---|---|---|
| Local (IntelliJ) | `http://localhost:63342/SistemaGestionResiduos/index.html` | Origen autorizado en Google: `http://localhost` y `http://localhost:63342` |
| Producción | `https://ryuuga-code.github.io/EcoGestion/` | Origen autorizado: `https://ryuuga-code.github.io` |
| Pruebas | `http://localhost:8800` | Ver `pruebas/README.md` |

`js/config.js`:

```js
GOOGLE_CLIENT_ID: '…apps.googleusercontent.com',
SUPABASE_URL: 'https://<proyecto>.supabase.co',
SUPABASE_ANON_KEY: 'sb_publishable_…'      // o la clave anon (eyJ…)
```

**Supabase:** proveedor Google activo con el Client ID (y el secreto de Google), esquema creado con `supabase/esquema_supabase.sql`. Los administradores iniciales están en `correos_administradores`.

**Despliegue:** GitHub Pages publica la rama `main` desde la raíz. Cada `git push` a `main` se publica en uno o dos minutos. Los navegadores pueden conservar JavaScript en caché: pide a los usuarios **Ctrl + F5** tras cambios grandes, o agrega un sufijo de versión a los `<script src="js/x.js?v=5">`.

---

## 12. Pruebas

Ver [`pruebas/README.md`](../pruebas/README.md). Resumen:

- `pruebas/prueba_sql.sh`: funciones y RLS actuando como cinco usuarios.
- `pruebas/prueba_e2e.js`: 30 comprobaciones en cuatro navegadores simultáneos (registro, fotos, ofertas, transacciones, permisos, desactivación y persistencia de la sesión).

Antes de publicar un cambio en las funciones del servidor, ejecuta ambas pruebas sobre una base local recién creada.

---

## 13. Convenciones

- **Idioma:** nombres de variables, funciones, tablas, columnas y mensajes en español, sin abreviaturas crípticas.
- **JavaScript:** IIFE con `'use strict'`, un objeto por módulo en `window.Eco`, 4 espacios, comillas simples, `const`/`let`, `async/await`.
- **SQL:** palabras clave en mayúsculas en SQLite y en minúsculas en PostgreSQL (como en cada archivo); siempre consultas parametrizadas (`?` en la réplica, parámetros `p_…` en las funciones).
- **Mensajes:** en segunda persona, concretos y con la solución ("La cantidad no puede superar lo disponible (40 kg).").
- **CSS:** tokens de `:root` en `estilos.css`; los componentes nuevos van en `mercado.css`. No uses colores sueltos fuera de los tokens, salvo las insignias por tipo de residuo.
- **Accesibilidad:** `aria-label` en botones con solo un icono, foco visible, `aria-live` en los contadores, contraste AA.

---

## 14. Limitaciones conocidas y trabajo futuro

| Tema | Situación | Mejora posible |
|---|---|---|
| Actualización | Consulta cada 30 s (polling) | Supabase Realtime para recibir los cambios al instante |
| Volumen | Cada sincronización descarga todo lo visible | Sincronización incremental por `fecha_actualizacion`, o consultas paginadas en el servidor para los listados grandes |
| Fotos huérfanas | Al editar o eliminar una publicación, los archivos viejos quedan en Storage | Borrarlos en el cliente (`DELETE /storage/v1/object/fotos/…`) o con una tarea programada |
| Privacidad de contacto | Las cuentas registradas ven el correo y el teléfono de las demás | Mostrar el contacto solo a las partes de una oferta aceptada |
| Cuentas | No hay eliminación desde la interfaz (solo desactivar) | Función `admin_eliminar_cuenta` que anonimice los datos personales |
| Centro de acopio | No se editan ni anulan recolecciones o salidas | Movimientos de ajuste con justificación |
| Abuso | No hay límite de solicitudes por usuario | Límites de Supabase / Edge Functions |
| CI | Las pruebas se ejecutan a mano | GitHub Actions con un servicio de PostgreSQL |

---

## 15. Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| `Could not find the function public.x(...) in the schema cache` | Función nueva o con otra firma | En el SQL Editor: `notify pgrst, 'reload schema';` y revisa los nombres de los parámetros (`p_…`) |
| `permission denied for function x` | Falta el `grant execute … to authenticated` | Agrégalo en la migración |
| `permission denied for table x` (42501) en un `SELECT` | Falta el `grant select` o la política RLS | `grant select on x to authenticated` y crea la política |
| La consulta devuelve 0 filas sin error | RLS filtró todo | Revisa la política y que la cuenta esté activa (`yo()` no nulo) |
| "Nonces mismatch" | El nonce enviado no es el que se dio a GIS | No reutilices un token; `prepararGoogle()` genera un nonce nuevo en cada intento |
| "Supabase rechazó el inicio con Google" | Proveedor Google desactivado o Client ID no listado | Authentication → Providers → Google |
| Google "no registered origin" | Origen no autorizado | Google Cloud → Clients → Orígenes autorizados de JavaScript |
| "Réplica: N filas no cumplieron el esquema local" (consola) | Un `CHECK` de SQLite es más estricto que el de PostgreSQL | Alinea las restricciones de `database/*.sql` con las de `esquema_supabase.sql` |
| Cambios que no se ven tras publicar | Caché del navegador | Ctrl + F5 o versiona los `<script>` |
