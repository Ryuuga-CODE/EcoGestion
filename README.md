# EcoGestión · Sistema de Gestión de Residuos Aprovechables

Aplicación web para gestionar los residuos aprovechables de un **municipio**: los ciudadanos solicitan la recolección de lo que separan, la alcaldía la asigna a repartidores, los repartidores registran los kilos que entran al centro de acopio y las empresas recicladoras le compran el material al municipio. Proyecto académico de Ingeniería de Software: bases de datos relacionales, SQL, integridad de datos, transacciones, control de acceso por roles y por municipio, y CRUD.

**Versión 5 (actual): gestión municipal.** Reemplaza el mercado entre particulares de la versión 4 (vendedores, compradores, publicaciones y ofertas). Tipos de cuenta: **Administrador** (alcaldía), **Ciudadano**, **Repartidor** y **Empresa recicladora**. Cada cuenta pertenece a un municipio elegido de la lista oficial **DIVIPOLA del DANE** (33 departamentos y 1.123 municipios y áreas no municipalizadas), y cada administrador solo ve y gestiona su municipio.

Los datos se guardan en una base central **PostgreSQL en Supabase**; cada navegador mantiene una **réplica SQLite (sql.js)** donde se hacen las consultas y reportes con SQL. El inicio de sesión es solo con **Google**, y Supabase verifica la firma del token.

Tecnologías: HTML5, CSS3, JavaScript sin frameworks, SQLite (sql.js) en el navegador, PostgreSQL + Auth en Supabase y Google Identity Services.

## Documentación

| Para | Documento |
|---|---|
| **Usuarios** (ciudadanos, repartidores, empresas, administradores) | [Guía de uso](https://ryuuga-code.github.io/EcoGestion/ayuda.html) · `ayuda.html`, también enlazada desde la app |
| **Desarrolladores** | [Guía para desarrolladores](docs/GUIA_DESARROLLADOR.md): arquitectura, modelo de datos, seguridad, funciones y cómo extender |
| **Pruebas** | [pruebas/README.md](pruebas/README.md): Supabase simulado, pruebas SQL y de navegador |
| **Puesta en marcha** | Este archivo, secciones 5 y 11 |

---

## 1. Arquitectura

```
 Navegador (cualquier equipo)                         Supabase
 ┌─────────────────────────────┐   lecturas (RLS)    ┌──────────────────────────────┐
 │ Interfaz (HTML/CSS/JS)      │ ◄────────────────── │ PostgreSQL (fuente de verdad)│
 │ Réplica SQLite (sql.js)     │                     │  · tablas + restricciones    │
 │  · consultas y reportes SQL │  escrituras (RPC)   │  · RLS: qué puede leer cada  │
 │                             │ ──────────────────► │    cuenta                    │
 │ Botón de Google (GIS) ──────┼── token de Google ─►│  · funciones transaccionales │
 └─────────────────────────────┘                     │ Auth (verifica a Google)     │
                                                     └──────────────────────────────┘
```

- **Lectura:** al iniciar sesión, después de cada operación, cada 30 segundos y al pulsar *Sincronizar*, la aplicación descarga lo que tu cuenta puede ver y reconstruye la réplica SQLite.
- **Escritura:** nunca se escribe directo en las tablas. Cada acción llama una **función del servidor** (`crear_solicitud`, `completar_solicitud`, etc.) que comprueba permisos, municipio y datos, y se ejecuta como **una transacción**: o se aplica todo o nada.
- **Seguridad por fila (RLS):** cada cuenta solo recibe datos de su municipio. El ciudadano ve sus solicitudes; el repartidor, las que le asignaron; la empresa, las existencias y sus pedidos (no los movimientos); el administrador, todo su municipio.

### Flujo principal

```
Ciudadano            Administrador            Repartidor                Centro de acopio        Empresa recicladora
crear_solicitud ──►  asignar_solicitud ──►    completar_solicitud ──►   recolecciones +          crear_pedido
 (Pendiente)          (Asignada)               (Recolectada)             movimientos (Entrada) ◄── responder_pedido:
                                                                                                   aprobar → entregar
                                                                                                   (movimiento Salida)
```

---

## 2. Estructura del proyecto

```
SistemaGestionResiduos/
├── index.html                  Interfaz (vistas, formularios y pantalla de acceso)
├── ayuda.html                  Guía de uso para usuarios (con capturas en img/ayuda/)
├── README.md
├── docs/GUIA_DESARROLLADOR.md  Documentación técnica
├── pruebas/                    Supabase simulado, prueba_sql.sh y prueba_e2e.js
├── herramientas/               generar_datos_sql.js (regenera datos_sql.js, lugares.js y el bloque DIVIPOLA)
├── datos/divipola.csv          Departamentos y municipios (DANE)
├── css/
│   ├── estilos.css             Diseño base
│   ├── componentes.css         Acceso, solicitudes, rutas, pedidos, administración
│   └── ayuda.css               Guía de uso
├── supabase/
│   └── esquema_supabase.sql    Base central: tablas, RLS, funciones, roles y DIVIPOLA
├── database/
│   ├── esquema.sql             Esquema SQLite del centro de acopio (réplica)
│   └── esquema_municipal.sql   Esquema SQLite de cuentas, solicitudes y pedidos (réplica)
└── js/
    ├── lib/sql-asm.js          sql.js (SQLite en JavaScript)
    ├── config.js               Client ID de Google y conexión pública a Supabase
    ├── nube.js                 Cliente de Supabase: Auth, funciones y lectura
    ├── database.js             Réplica SQLite (solo lectura)
    ├── datos_sql.js            Copia embebida de los esquemas SQLite
    ├── utilidades.js           Formatos, CSV, mensajes
    ├── lugares.js              Departamentos y municipios (generado desde datos/divipola.csv)
    ├── comun.js                Dinero, estados, tipos de residuo, selectores de lugar
    ├── sesion.js               Inicio de sesión con Google, registro y permisos
    ├── app.js                  Navegación, sincronización, modales
    ├── panel.js, materiales.js, recolecciones.js, inventario.js,
    │   historial.js, reportes.js           Centro de acopio
    ├── solicitudes.js          Solicitudes: ciudadano, repartidor (rutas) y administrador
    ├── pedidos.js              Pedidos de empresas y panel empresarial
    └── administracion.js, perfil.js        Cuentas del municipio y perfil
```

Respecto a la versión 4 se eliminaron `js/mercado.js`, `js/publicaciones.js`, `js/ofertas.js`, `js/empresa.js`, `css/mercado.css` y `database/esquema_mercado.sql`. Si aún están en tu carpeta, bórralos: la aplicación ya no los usa.

---

## 3. Base de datos

### Tablas (PostgreSQL en Supabase; la réplica SQLite tiene las mismas)

| Grupo | Tablas |
|---|---|
| Lugares (DIVIPOLA) | `departamentos`, `municipios` (solo servidor; el navegador usa `js/lugares.js`) |
| Cuentas | `roles`, `permisos`, `roles_permisos`, `usuarios`, `perfiles` (con `codigo_municipio`), `correos_administradores` (solo servidor) |
| Recolección | `solicitudes_recoleccion` |
| Centro de acopio | `materiales`, `recolecciones`, `movimientos` (todas con `codigo_municipio`) |
| Empresas | `empresas`, `pedidos_empresa` |
| Vista | `existencias_municipio`: existencia y lo comprometido en pedidos aprobados, por material |

- Claves primarias y foráneas en todas las relaciones, con `ON DELETE RESTRICT` donde borrar dejaría el historial incompleto.
- Restricciones `CHECK` (categorías, unidades, cantidades > 0, enteros para *unidades*, estados válidos, código DANE de 2 y 5 dígitos, longitudes), `NOT NULL`, `UNIQUE` (por ejemplo, nombre de material único **por municipio**) e índices.
- **Triggers:** no se puede registrar una salida mayor que las existencias; la unidad y el municipio de un movimiento deben coincidir con los del material; una solicitud solo cambia por caminos válidos (Pendiente → Asignada → Recolectada; Pendiente/Asignada → Cancelada/Rechazada; Asignada → Pendiente si el repartidor la devuelve) y un pedido igual (Pendiente → Aprobado → Entregado; Pendiente/Aprobado → Rechazado/Cancelado).
- **Inventario calculado:** las existencias no se guardan; la vista `vista_existencias` de la réplica las calcula desde `movimientos`.

### Funciones del servidor (cada una es una transacción)

| Función | Qué hace |
|---|---|
| `iniciar_sesion`, `registrar_cuenta`, `actualizar_perfil` | Identifica la cuenta de Google; crea cuentas con tipo y municipio (los repartidores quedan pendientes de aprobación); edita teléfono y dirección |
| `crear_solicitud`, `cancelar_solicitud` | Ciudadano: pide la recolección (máximo 3 abiertas) o la cancela |
| `asignar_solicitud`, `rechazar_solicitud` | Administrador: asigna a un repartidor activo de su municipio o rechaza con motivo |
| `completar_solicitud`, `devolver_solicitud` | Repartidor: registra los kilos por material (crea recolecciones + entradas) o la devuelve con motivo |
| `guardar_material`, `eliminar_material` | Catálogo del centro de acopio del municipio |
| `registrar_recoleccion`, `registrar_salida` | Entradas directas y salidas manuales (sin tocar lo reservado para empresas) |
| `guardar_empresa`, `crear_pedido`, `responder_pedido` | Perfil empresarial; pedido validado contra lo disponible; aprobar (reserva), entregar (crea la salida), rechazar, cancelar |
| `admin_estado_usuario`, `admin_rol_usuario` | Aprobar/activar/desactivar y cambiar el tipo, solo en el propio municipio (siempre queda un administrador activo) |

---

## 4. Tipos de cuenta

| Tipo | Ve en el menú | Puede |
|---|---|---|
| **Administrador** (alcaldía) | Panel, Solicitudes, Pedidos de empresas, Usuarios, centro de acopio completo, Mi perfil | Asignar y rechazar solicitudes, aprobar y entregar pedidos, aprobar repartidores, activar/desactivar y cambiar el tipo de cuenta, operar el centro de acopio, reportes y CSV. Todo **solo en su municipio** |
| **Ciudadano** | Mis solicitudes, Mi perfil | Solicitar la recolección con tipos, fecha y franja; seguir el estado; ver al repartidor; cancelar |
| **Repartidor** | Mis rutas, Mi perfil | Ver las solicitudes asignadas con dirección y contacto, registrar los kilos por material, devolver las que no pudo recoger, ver su historial |
| **Empresa recicladora** | Panel empresarial, Mi perfil | Ver el material disponible del municipio, hacer y cancelar pedidos, editar el perfil empresarial |

Nadie puede registrarse como administrador: entran como administradores los correos de la tabla `correos_administradores` (al crear la base: imsebasff@gmail.com y sebasrtw@gmail.com), que al registrarse eligen su municipio, o a quienes otro administrador del mismo municipio les asigne ese tipo.

---

## 5. Ejecutar el proyecto

**Publicado (recomendado):** https://ryuuga-code.github.io/EcoGestion/

**En IntelliJ IDEA Community:**
1. *File → Open…* → carpeta `SistemaGestionResiduos` → *Trust Project*.
2. Abre `index.html` y usa el icono del navegador (arriba a la derecha) o *clic derecho → Open In → Browser → Chrome*. La dirección debe ser `http://localhost:63342/...`.
3. Si el navegador muestra una versión vieja: **Ctrl + F5**.

No abras `index.html` con doble clic: Google no permite iniciar sesión desde `file://`.

Requisitos: conexión a Internet (Supabase y Google) y la configuración de la sección 11 hecha una vez.

---

## 6. Cómo probar cada módulo

Para probar varios roles a la vez usa varias cuentas de Google, cada una en un navegador o en una ventana de incógnito distinta.

1. **Administrador.** Entra con un correo administrador: el registro solo pide **Departamento → Municipio** (por ejemplo Cundinamarca → Soacha). Crea los materiales del centro de acopio (Botellas PET en Plástico, Cartón en Papel y cartón…).
2. **Ciudadano.** Con otra cuenta elige *Ciudadano*, el mismo municipio y tu dirección (sin dirección se marca el error). En *Mis solicitudes → Solicitar recolección* marca los tipos y la fecha.
3. **Repartidor.** Con otra cuenta elige *Repartidor* (el teléfono es obligatorio). Al crearla aparece "espera la aprobación".
4. **Aprobar y asignar.** El administrador ve los contadores en el menú: en *Usuarios* pulsa *Aprobar*; en *Solicitudes*, *Asignar* al repartidor.
5. **Recoger.** El repartidor vuelve a entrar: en *Mis rutas* pulsa *Registrar kilos*, escribe lo que pesó cada material y registra. El inventario del administrador sube y el ciudadano ve sus kilos. Prueba también *No pude recogerla*.
6. **Empresa.** Con otra cuenta elige *Empresa recicladora*. En *Panel empresarial* pide material: pedir más de lo disponible se rechaza.
7. **Pedido.** El administrador, en *Pedidos de empresas*: *Aprobar* (el material queda reservado: una salida manual ya no puede usarlo) y *Registrar entrega* (crea la salida del inventario).
8. **Otro municipio.** Con el segundo correo administrador regístrate en otro municipio: no ves nada de Soacha.
9. **Seguridad.** Desde la consola del navegador de un ciudadano, `Eco.Nube.rpc('guardar_material', {...})` responde "No tienes permiso"; el servidor no depende de la interfaz.
10. **Centro de acopio, reportes y copia SQLite** funcionan como antes: *Historial* y *Reportes* exportan CSV; *Copia* descarga la réplica `.sqlite`.

---

## 7. Funcionalidades

- Inicio de sesión real con Google: Supabase verifica la firma del token, con nonce contra reutilización.
- Registro con tipo de cuenta y municipio (Departamento → Municipio, DIVIPOLA del DANE); aprobación de repartidores.
- Datos separados por municipio en el servidor (RLS y funciones), varios municipios en la misma base.
- Solicitudes de recolección con fecha, franja, tipos de residuo y seguimiento por estados.
- Rutas del repartidor con contacto, enlace a Google Maps y registro de kilos por material.
- Centro de acopio completo: materiales, recolecciones, inventario, salidas, historial, reportes, CSV.
- Pedidos de empresas con reserva de material, entrega con salida automática y exportación CSV.
- Administración de cuentas y estadísticas del municipio; contadores de pendientes en el menú.
- Actualización automática cada 30 segundos.

**No incluido:** mensajería interna (el contacto es por teléfono o correo), pagos, notificaciones, fotos de las solicitudes, rutas optimizadas en mapa, edición o anulación de recolecciones ya registradas, cambio de municipio de una cuenta desde la aplicación.

---

## 8. Privacidad

- La aplicación recibe de Google solo el nombre, el correo y la foto. **Nunca la contraseña.**
- La dirección y el teléfono de un ciudadano solo los ven el administrador de su municipio y el repartidor asignado mientras comparten una solicitud. Nadie ve datos de otro municipio.
- En Colombia, si se usa con personas reales, se recomienda publicar una política de tratamiento de datos personales (Ley 1581 de 2012).
- En `js/config.js` solo van datos públicos. El *client secret* de Google y la *service_role key* de Supabase **nunca** van en el proyecto.

---

## 9. Posibles errores y soluciones

| Problema | Causa | Solución |
|---|---|---|
| "Conexión con Supabase sin configurar" | Faltan `SUPABASE_URL` o `SUPABASE_ANON_KEY` | Sección 11, paso 4. |
| "Inicio con Google sin configurar" | `GOOGLE_CLIENT_ID` vacío | Revisa `js/config.js`. |
| Google: "no registered origin" / "origin_mismatch" | La dirección no está autorizada | En Google Cloud, en *Orígenes autorizados de JavaScript*: `http://localhost`, `http://localhost:63342` y `https://ryuuga-code.github.io`. |
| Google: "Access blocked" | App de Google en modo de prueba y correo no listado | Agrégalo en *Audience → Test users*, o publica la app. |
| "Supabase rechazó el inicio con Google" | Proveedor Google desactivado o Client ID no registrado en Supabase | Sección 11, paso 3. |
| "No hay conexión con el servidor" | Sin Internet o proyecto de Supabase pausado | Revisa la conexión. Los proyectos gratuitos se pausan tras días sin uso: reactívalo en el panel de Supabase. |
| "Tu sesión venció" | Token caducado sin poder renovarse | Inicia sesión de nuevo. |
| "Esta cuenta está desactivada" | Un administrador la desactivó | Otro administrador del municipio debe activarla. |
| "Tu cuenta de repartidor… espera la aprobación" | Repartidor recién registrado | El administrador del municipio pulsa *Aprobar* en *Usuarios*. |
| El repartidor no puede registrar kilos | El centro de acopio no tiene materiales | El administrador crea los materiales en *Materiales*. |
| "Solo hay … libres: el resto está reservado" | Hay pedidos de empresas aprobados | Entrega o anula esos pedidos, o saca menos. |
| "No tienes permiso para realizar esta acción" | El tipo de cuenta no permite esa acción | Comportamiento esperado. |
| No veo lo que hizo otra persona | La réplica se actualiza cada 30 s | Recarga, o *Sincronizar* (administrador). |
| IntelliJ deja `config.js` con datos viejos | El editor guardó su versión encima | Cierra la pestaña, recarga desde el disco y vuelve a pegar los datos. |

---

## 10. Funciones que siguen dependiendo de configuración externa

| Elemento | Dónde se configura |
|---|---|
| Client ID y orígenes autorizados de Google | Google Cloud Console |
| Proveedor Google, URL y clave pública | Supabase → Authentication / Project Settings |
| Administradores iniciales | Tabla `correos_administradores` (SQL Editor) |
| Lista de municipios | `datos/divipola.csv` → `node herramientas/generar_datos_sql.js` |
| Publicación web | GitHub → Settings → Pages |

---

## 11. Configurar Supabase (una sola vez)

1. **Crear el proyecto.** Entra a [supabase.com](https://supabase.com), crea una cuenta y luego *New project*. Ponle un nombre (EcoGestion), una contraseña de base de datos (guárdala) y la región **South America (São Paulo)**.
2. **Crear la base.** En el proyecto abre **SQL Editor → New query**, pega **todo** el contenido de `supabase/esquema_supabase.sql` y pulsa **Run**. Debe terminar con "Success. No rows returned". El archivo incluye los 1.123 municipios, así que es largo; si el editor no deja pegarlo, usa *Upload SQL* o ábrelo desde el botón de archivo del SQL Editor.

   **Si ya tenías la versión 4 (mercado):** ejecuta el mismo archivo. Su sección 0 borra las tablas y funciones del mercado y crea las nuevas. **Se pierden los datos de la versión 4**; las cuentas de Google se conservan y cada persona completa el registro otra vez (los administradores eligen su municipio). Supabase puede advertir que la consulta tiene operaciones destructivas: confirma con *Run this query*.
3. **Activar Google.**
   1. En **Authentication → Sign In / Providers → Google**, actívalo.
   2. En **Client IDs** (o *Authorized Client IDs*) pega el Client ID de Google: `90051835805-o6b84c189c52t6pr3bqv6u7thtp1081t.apps.googleusercontent.com`.
   3. En **Client Secret** pega el secreto de Google. Va aquí, en Supabase, nunca en el código. Si lo cambiaste, usa el nuevo.
   4. Deja apagado "Skip nonce check" y guarda.
4. **Conectar la aplicación.** En **Project Settings → API** (o el botón **Connect**) copia la **Project URL** y la clave pública (**anon public** o **publishable key**). Pégalas en `js/config.js`:
   ```js
   SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...'   // o sb_publishable_...
   ```
   **No uses la clave `service_role` / `secret`.**
5. **Probar.** Abre la aplicación, entra con un correo administrador, elige tu municipio y crea un material. Debe aparecer en **Table Editor → materiales** de Supabase.

**Agregar otro administrador:** en SQL Editor ejecuta `insert into correos_administradores values ('correo@gmail.com');`. La próxima vez que esa persona inicie sesión será administradora.

**Empezar de cero:** en SQL Editor ejecuta `drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated;`, borra los usuarios en **Authentication → Users** y vuelve a ejecutar `supabase/esquema_supabase.sql`.
