# EcoGestión · Sistema de Gestión de Residuos Aprovechables

Aplicación web para registrar, controlar y comerciar materiales aprovechables. Proyecto académico de Ingeniería de Software: bases de datos relacionales, SQL, integridad de datos, transacciones, control de acceso por roles y CRUD.

**Versión 4 (actual):** los datos se guardan en una base central **PostgreSQL en Supabase** y todos los usuarios ven la misma información desde cualquier computador o celular. Cada navegador mantiene una **réplica SQLite (sql.js)** donde se hacen todas las consultas y reportes con SQL. El inicio de sesión es solo con **Google**, y Supabase verifica la firma del token. Ya no hay cuentas ni datos de demostración.

Tecnologías: HTML5, CSS3, JavaScript sin frameworks, SQLite (sql.js) en el navegador, PostgreSQL + Auth + Storage en Supabase y Google Identity Services.

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
                                                     │ Storage (fotografías)        │
                                                     └──────────────────────────────┘
```

- **Lectura:** al iniciar sesión, después de cada operación, cada 30 segundos y al pulsar *Sincronizar*, la aplicación descarga lo que tu cuenta puede ver y reconstruye la réplica SQLite.
- **Escritura:** nunca se escribe directo en las tablas. Cada acción llama una **función del servidor** (`guardar_material`, `responder_oferta`, etc.) que comprueba permisos y datos, y se ejecuta como **una transacción**: o se aplica todo o nada.
- **Seguridad por fila (RLS):** por ejemplo, un comprador no recibe los datos del centro de acopio, y cada quien solo ve las ofertas en las que participa.

---

## 2. Estructura del proyecto

```
SistemaGestionResiduos/
├── index.html                  Interfaz (vistas, formularios y pantalla de acceso)
├── README.md
├── css/
│   ├── estilos.css             Diseño base
│   └── mercado.css             Acceso, mercado, ofertas, administración
├── supabase/
│   └── esquema_supabase.sql    Base central: tablas, RLS, funciones, Storage, roles
├── database/
│   ├── esquema.sql             Esquema SQLite del centro de acopio (réplica)
│   └── esquema_mercado.sql     Esquema SQLite del mercado (réplica)
└── js/
    ├── lib/sql-asm.js          sql.js (SQLite en JavaScript)
    ├── config.js               Client ID de Google y conexión pública a Supabase
    ├── nube.js                 Cliente de Supabase: Auth, funciones, lectura, Storage
    ├── database.js             Réplica SQLite (solo lectura)
    ├── datos_sql.js            Copia embebida de los esquemas SQLite
    ├── utilidades.js           Formatos, CSV, mensajes
    ├── sesion.js               Inicio de sesión con Google, registro y permisos
    ├── app.js                  Navegación, sincronización, modales
    ├── panel.js, materiales.js, recolecciones.js, inventario.js,
    │   historial.js, reportes.js           Centro de acopio
    ├── mercado.js, publicaciones.js, ofertas.js,
    │   empresa.js, administracion.js, perfil.js   Mercado y cuentas
```

Respecto a la versión 3 se eliminaron `js/almacenamiento.js`, `database/datos_iniciales.sql` y `database/datos_mercado.sql` (guardado local y datos de demostración). Si aún están en tu carpeta, puedes borrarlos: la aplicación ya no los usa.

---

## 3. Base de datos

### Tablas (PostgreSQL en Supabase; la réplica SQLite tiene las mismas)

| Grupo | Tablas |
|---|---|
| Cuentas | `roles`, `permisos`, `roles_permisos`, `usuarios`, `perfiles`, `correos_administradores` (solo servidor) |
| Centro de acopio | `materiales`, `recolecciones`, `movimientos` |
| Mercado | `empresas`, `necesidades_empresa`, `publicaciones`, `fotos_publicacion`, `ofertas`, `transacciones` |

- Claves primarias y foráneas en todas las relaciones, con `ON DELETE RESTRICT` donde borrar dejaría el historial incompleto.
- Restricciones `CHECK` (categorías, unidades, cantidades > 0, enteros para *unidades*, estados válidos, rangos mínimo ≤ máximo, longitudes), `NOT NULL`, `UNIQUE` e índices en los campos de búsqueda.
- **Triggers:** no se puede registrar una salida mayor que las existencias, la unidad de un movimiento debe coincidir con la del material, y una oferta solo cambia de estado por caminos válidos (Pendiente → Aceptada/Rechazada/Cancelada; Aceptada → Completada/Cancelada).
- **Inventario calculado:** las existencias no se guardan; la vista `vista_existencias` de la réplica las calcula desde `movimientos`.

### Funciones del servidor (cada una es una transacción)

| Función | Qué hace |
|---|---|
| `iniciar_sesion`, `registrar_cuenta`, `actualizar_perfil` | Identifica la cuenta de Google, crea cuentas nuevas con su tipo, edita el perfil |
| `guardar_material`, `eliminar_material` | Catálogo (solo administrador) |
| `registrar_recoleccion` | Recolección + movimiento de entrada |
| `registrar_salida` | Salida validada contra existencias |
| `guardar_publicacion`, `cambiar_estado_publicacion`, `eliminar_publicacion` | Publicaciones con fotos; retirar rechaza las ofertas pendientes |
| `enviar_oferta`, `responder_oferta` | Ofertar; aceptar (descuenta la cantidad y crea la transacción), rechazar, cancelar (devuelve la cantidad), completar |
| `guardar_empresa`, `guardar_necesidad`, `accion_necesidad` | Panel empresarial |
| `admin_estado_usuario`, `admin_rol_usuario` | Activar/desactivar cuentas y cambiar el tipo (siempre queda al menos un administrador activo) |

---

## 4. Tipos de cuenta

| Tipo | Ve en el menú | Puede |
|---|---|---|
| **Administrador** | Centro de acopio completo, Mercado, Usuarios y supervisión, Mi perfil | Operar el centro de acopio, activar/desactivar cuentas, cambiar el tipo de cuenta, supervisar publicaciones y negociaciones, ver estadísticas, exportar CSV |
| **Vendedor** | Mercado, Mis publicaciones, Ofertas, Mi perfil | Publicar con fotos, editar, retirar o eliminar lo propio; aceptar o rechazar ofertas; completar ventas; ver su historial |
| **Comprador** | Mercado, Ofertas, Mi perfil | Buscar por tipo y ubicación, contactar al vendedor, ofertar, cancelar, ver sus compras |
| **Empresa recicladora** | Mercado, Ofertas, Panel empresarial, Mi perfil | Perfil empresarial, necesidades con cantidad mínima/máxima y precio, buscar vendedores, ofertar, ver compras |

Nadie puede registrarse como administrador: entran como administradores los correos de la tabla `correos_administradores` (al crear la base: imsebasff@gmail.com y sebasrtw@gmail.com), o a quienes otro administrador les asigne ese tipo.

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

Para probar varios roles a la vez usa dos o más cuentas de Google, cada una en un navegador o en una ventana de incógnito distinta. Así compruebas que **los datos se comparten**.

1. **Acceso y registro.** Entra con un correo administrador: llegas directo al *Panel principal*. Con otra cuenta de Google aparece *Completa tu registro*: elige Vendedor, Comprador o Empresa recicladora (la empresa pide su nombre). Prueba dejar el tipo o la ubicación vacíos: se marcan los errores.
2. **Centro de acopio (administrador).** Crea un material; repite el nombre: "Ya existe…". Registra una recolección con cantidad 0 (se rechaza) y luego válida: el inventario sube. Registra una salida mayor a lo disponible (se rechaza) y luego válida. Revisa *Historial* (filtros y CSV), *Reportes* (rango de fechas y CSV) y *Panel principal*.
3. **Vendedor.** *Mis publicaciones → Nueva publicación* con 1 a 3 fotos. Aparece en el *Mercado* de los demás.
4. **Comprador.** En *Mercado* filtra por tipo y ubicación, abre *Ver detalle* (fotos y contacto) y *Hacer oferta*. Ofertar más de lo disponible o dos veces seguidas se rechaza.
5. **Negociación.** El vendedor pulsa *Sincronizar* (o espera 30 s): ve la oferta con el contador en el menú. *Aceptar* descuenta la cantidad; *Marcar completada* la pasa al historial de ventas. Si el comprador cancela una oferta aceptada, la cantidad vuelve.
6. **Empresa.** Publica una necesidad (máximo menor que mínimo se rechaza), edita el perfil, busca vendedores y usa *Ver publicaciones*.
7. **Administración.** *Usuarios y supervisión*: desactiva una cuenta (esa persona queda fuera en su siguiente sincronización), cambia un tipo de cuenta, revisa publicaciones, transacciones (CSV) y estadísticas.
8. **Seguridad.** Desde la consola del navegador de un comprador, `Eco.Nube.rpc('guardar_material', {...})` responde "No tienes permiso"; el servidor no depende de la interfaz.
9. **Copia SQLite.** *Copia* (barra lateral) descarga la réplica como archivo `.sqlite`, que se puede abrir con *DB Browser for SQLite*.

---

## 7. Funcionalidades

- Inicio de sesión real con Google: Supabase verifica la firma del token, con nonce contra reutilización.
- Registro con tipo de cuenta, perfil con foto de Google, cierre de sesión.
- Navegación y permisos por rol, comprobados en la interfaz **y en el servidor**.
- Centro de acopio completo: materiales, recolecciones, inventario, salidas, historial, reportes, CSV.
- Mercado con fotos (Supabase Storage), filtros por tipo, ubicación, texto y vendedor.
- Ofertas y negociaciones con transacciones; panel empresarial; administración y estadísticas.
- Datos compartidos entre todos los usuarios y equipos; actualización automática cada 30 segundos.

**No incluido:** mensajería interna (el contacto es por correo o teléfono), pagos, notificaciones, edición o anulación de recolecciones y salidas ya registradas.

---

## 8. Privacidad

- La aplicación recibe de Google solo el nombre, el correo y la foto. **Nunca la contraseña.**
- Las cuentas registradas pueden ver el nombre, correo, teléfono y ubicación de las demás, porque son necesarios para contactarse en el mercado. Infórmalo a los usuarios.
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
| "Esta cuenta está desactivada" | Un administrador la desactivó | Otro administrador debe activarla. |
| "No tienes permiso para realizar esta acción" | El tipo de cuenta no permite esa acción | Comportamiento esperado. |
| No veo lo que publicó otra persona | La réplica se actualiza cada 30 s | Pulsa *Sincronizar*. |
| Una foto no sube | Archivo que no es imagen, o de más de 10 MB | Usa JPG, PNG o WEBP. |
| IntelliJ deja `config.js` con datos viejos | El editor guardó su versión encima | Cierra la pestaña, recarga desde el disco y vuelve a pegar los datos. |

---

## 10. Funciones que siguen dependiendo de configuración externa

| Elemento | Dónde se configura |
|---|---|
| Client ID y orígenes autorizados de Google | Google Cloud Console |
| Proveedor Google, URL y clave pública | Supabase → Authentication / Project Settings |
| Administradores iniciales | Tabla `correos_administradores` (SQL Editor) |
| Publicación web | GitHub → Settings → Pages |

---

## 11. Configurar Supabase (una sola vez)

1. **Crear el proyecto.** Entra a [supabase.com](https://supabase.com), crea una cuenta y luego *New project*. Ponle un nombre (EcoGestion), una contraseña de base de datos (guárdala) y la región **South America (São Paulo)**.
2. **Crear la base.** En el proyecto abre **SQL Editor → New query**, pega **todo** el contenido de `supabase/esquema_supabase.sql` y pulsa **Run**. Debe terminar con "Success. No rows returned".
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
5. **Probar.** Abre la aplicación, entra con un correo administrador y crea un material. Debe aparecer en **Table Editor → materiales** de Supabase.

**Agregar otro administrador:** en SQL Editor ejecuta `insert into correos_administradores values ('correo@gmail.com');`. La próxima vez que esa persona inicie sesión será administradora.

**Empezar de cero:** en SQL Editor ejecuta `drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated;`, borra los usuarios en **Authentication → Users** y vuelve a ejecutar `supabase/esquema_supabase.sql`.
