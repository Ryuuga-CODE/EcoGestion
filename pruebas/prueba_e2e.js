// Prueba de extremo a extremo del flujo municipal con navegadores reales (Playwright).
// Requiere: base recién creada, PostgREST (puerto 3000) y servidor_supabase.js (puerto 8800).
const { chromium } = require('playwright');
const os = require('os'), fs = require('fs'), path = require('path');
const URL_APP = process.env.URL_APP || 'http://localhost:8800/';
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-')) + path.sep;
fs.mkdirSync(S + 'shots', { recursive: true });
let fallas = 0;
const ok = (c, m) => { if (!c) fallas += 1; console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); };
const GIS = `window.google={accounts:{id:{initialize(c){window.__gis=c},disableAutoSelect(){},
 renderButton(el){el.innerHTML='<button type="button" id="gis-falso">Continuar con Google</button>';el.firstChild.onclick=()=>window.__gisLogin()}}}};`;

async function nuevoNavegador(b, cuenta) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({ contentType: 'text/javascript', body: GIS }));
  await ctx.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 404, body: '' }));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/40[0-4]/.test(m.text())) p.errs.push(m.text().slice(0, 160)); });
  await p.goto(URL_APP); await p.waitForTimeout(1500);
  await p.evaluate((c) => {
    window.__gisLogin = () => {
      const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const t = b64({ alg: 'RS256' }) + '.' + b64({ iss: 'https://accounts.google.com', aud: 'cliente-prueba.apps.googleusercontent.com', exp: Math.floor(Date.now()/1000)+600, email_verified: true, nonce: window.__gis.nonce, ...c }) + '.firma';
      window.__gis.callback({ credential: t });
    };
  }, cuenta);
  return p;
}
const err = (p, id) => p.$eval('#error-' + id, e => e.textContent.trim()).catch(() => '');
const ir = async (p, v) => { await p.click(`.menu-item[data-vista="${v}"]`); await p.waitForTimeout(300); };
const confirmar = async (p) => { await p.waitForTimeout(250); await p.click('#btn-confirmar-accion'); await p.waitForTimeout(1200); };
const texto = async (p, valor) => { await p.waitForTimeout(250); if (valor) await p.fill('#texto-valor', valor); await p.click('#btn-texto-confirmar'); await p.waitForTimeout(1200); };
const q = (p, sql, params = []) => p.evaluate(([s, pr]) => Eco.DB.consultar(s, pr), [sql, params]);
const vista = (p) => p.$eval('.vista.activa', e => e.id);
const sincronizar = async (p) => { await p.evaluate(() => Eco.App.despuesDeCambio()); await p.waitForTimeout(1200); };
async function registrar(p, { tipo, dep, mun, direccion, telefono, razon }) {
  await p.click('#gis-falso'); await p.waitForTimeout(1800);
  if (tipo) await p.check(`input[name="registro-tipo"][value="${tipo}"]`, { force: true });
  await p.selectOption('#registro-departamento', dep);
  await p.selectOption('#registro-municipio', mun);
  if (direccion) await p.fill('#registro-direccion', direccion);
  if (telefono) await p.fill('#registro-telefono', telefono);
  if (razon) await p.fill('#registro-razon', razon);
  await p.click('#btn-crear-cuenta'); await p.waitForTimeout(2500);
}

(async () => {
  const b = await chromium.launch();

  // ===== ADMINISTRADOR de Soacha (correo autorizado)
  const A = await nuevoNavegador(b, { sub: 'g-admin', email: 'imsebasff@gmail.com', name: 'Ryuuga', picture: 'https://lh3.googleusercontent.com/a' });
  await A.click('#gis-falso'); await A.waitForTimeout(1800);
  ok(await A.$eval('#registro-aviso-admin', e => !e.hidden) && await A.$eval('#registro-campo-tipo', e => e.hidden),
    'correo autorizado: el registro solo pide el municipio');
  ok((await A.$$eval('#registro-departamento option', os => os.length)) === 34, 'lista de 33 departamentos');
  await A.click('#btn-crear-cuenta'); await A.waitForTimeout(400);
  ok(/departamento/.test(await err(A, 'registro-departamento')), 'exige el departamento');
  await A.selectOption('#registro-departamento', '25');
  ok((await A.$$eval('#registro-municipio option', os => os.length)) === 117, 'Cundinamarca carga sus 116 municipios');
  await A.selectOption('#registro-municipio', '25754');
  await A.click('#btn-crear-cuenta'); await A.waitForTimeout(2500);
  ok((await vista(A)) === 'vista-panel', 'administrador entra al panel');
  ok((await A.$eval('#marca-municipio', e => e.textContent)) === 'Soacha, Cundinamarca', 'la barra lateral muestra el municipio');
  await ir(A, 'materiales');
  for (const [nombre, cat] of [['Botellas PET', 'Plástico'], ['Cartón corrugado', 'Papel y cartón']]) {
    await A.click('#btn-nuevo-material'); await A.waitForTimeout(300);
    await A.fill('#material-nombre', nombre); await A.selectOption('#material-categoria', cat); await A.selectOption('#material-unidad', 'kg');
    await A.click('#btn-guardar-material'); await A.waitForTimeout(1300);
  }
  ok((await q(A, 'SELECT COUNT(*) n FROM materiales'))[0].n === 2, 'administrador crea 2 materiales del centro de acopio');

  // ===== CIUDADANO de Soacha
  const C = await nuevoNavegador(b, { sub: 'g-ciu', email: 'ciuda@gmail.com', name: 'Ana Pérez' });
  await C.click('#gis-falso'); await C.waitForTimeout(1800);
  ok(await C.$eval('#paso-registro', e => !e.hidden) && (await C.$$('input[name="registro-tipo"]')).length === 3, 'cuenta nueva elige entre ciudadano, repartidor y empresa');
  await C.check('input[name="registro-tipo"][value="ciudadano"]', { force: true });
  await C.selectOption('#registro-departamento', '25'); await C.selectOption('#registro-municipio', '25754');
  await C.click('#btn-crear-cuenta'); await C.waitForTimeout(400);
  ok(/dirección/.test(await err(C, 'registro-direccion')), 'el ciudadano debe dar su dirección');
  await C.fill('#registro-direccion', 'Cra 7 # 12-30, San Mateo');
  await C.click('#btn-crear-cuenta'); await C.waitForTimeout(2500);
  ok((await vista(C)) === 'vista-mis-solicitudes', 'ciudadano entra a Mis solicitudes');
  ok((await q(C, 'SELECT COUNT(*) n FROM movimientos'))[0].n === 0, 'RLS: el ciudadano no recibe el inventario');
  await C.click('#btn-nueva-solicitud'); await C.waitForTimeout(400);
  ok((await C.$eval('#solicitud-direccion', e => e.value)) === 'Cra 7 # 12-30, San Mateo', 'la solicitud trae la dirección del perfil');
  await C.click('#form-solicitud [type="submit"]'); await C.waitForTimeout(300);
  ok(/tipo/.test(await err(C, 'solicitud-tipos')), 'exige marcar un tipo de residuo');
  await C.check('input[name="solicitud-tipo"][value="Plástico"]', { force: true });
  await C.check('input[name="solicitud-tipo"][value="Papel y cartón"]', { force: true });
  await C.fill('#solicitud-cantidad', '15'); await C.fill('#solicitud-descripcion', 'Bolsas en la portería');
  await C.click('#form-solicitud [type="submit"]'); await C.waitForTimeout(1800);
  ok((await q(C, 'SELECT estado, tipos_residuo t FROM solicitudes_recoleccion'))[0].t === 'Papel y cartón, Plástico', 'solicitud creada en el servidor');
  ok((await C.$$('#lista-mis-solicitudes .tarjeta-solicitud')).length === 1, 'la tarjeta aparece en Mis solicitudes');

  // ===== REPARTIDOR: se registra y queda pendiente
  const R = await nuevoNavegador(b, { sub: 'g-rep', email: 'repa@gmail.com', name: 'Luis Gómez' });
  await registrar(R, { tipo: 'repartidor', dep: '25', mun: '25754', telefono: '311 555 0202' });
  ok(await R.$eval('#capa-acceso', e => !e.hidden) && /aprobación/.test(await R.$eval('#acceso-error', e => e.textContent)),
    'repartidor nuevo espera la aprobación del administrador');

  // ===== ADMINISTRADOR aprueba y asigna
  await sincronizar(A);
  ok(await A.$eval('#menu-contador-usuarios', e => !e.hidden && e.textContent === '1'), 'menú: 1 repartidor por aprobar');
  ok(await A.$eval('#menu-contador-solicitudes', e => !e.hidden && e.textContent === '1'), 'menú: 1 solicitud sin asignar');
  await ir(A, 'administracion');
  const idR = (await q(A, "SELECT id_usuario FROM usuarios WHERE correo='repa@gmail.com'"))[0].id_usuario;
  await A.click(`#tabla-usuarios-body [data-accion="aprobar"][data-id="${idR}"]`); await confirmar(A);
  ok((await q(A, 'SELECT activo, pendiente FROM perfiles WHERE id_usuario = ?', [idR]))[0].activo === 1, 'administrador aprueba al repartidor');
  await ir(A, 'solicitudes');
  await A.click('#tabla-solicitudes-body [data-accion="asignar"]'); await A.waitForTimeout(400);
  await A.selectOption('#asignar-repartidor', String(idR));
  await A.click('#form-asignar [type="submit"]'); await A.waitForTimeout(1500);
  ok((await q(A, 'SELECT estado, id_repartidor FROM solicitudes_recoleccion'))[0].estado === 'Asignada', 'solicitud asignada al repartidor');

  // ===== REPARTIDOR recoge y registra los kilos
  await R.click('#gis-falso'); await R.waitForTimeout(2500); // vuelve a entrar desde la misma pantalla
  ok((await vista(R)) === 'vista-rutas', 'repartidor aprobado entra a Mis rutas');
  ok(await R.$eval('#menu-contador-rutas', e => e.textContent === '1'), 'menú del repartidor: 1 por recoger');
  ok(/Ana Pérez/.test(await R.$eval('#lista-rutas', e => e.textContent)), 'el repartidor ve al ciudadano y su dirección');
  await R.click('#lista-rutas [data-accion="completar"]'); await R.waitForTimeout(500);
  ok((await R.$$('#completar-lineas .linea-material')).length === 2, 'una línea por cada tipo marcado por el ciudadano');
  const cantidades = await R.$$('#completar-lineas [data-campo="cantidad"]');
  await cantidades[0].fill('6'); await cantidades[1].fill('8.5');
  ok((await R.$eval('#completar-total', e => e.textContent)) === '14,5 kg', 'total en kilos: 14,5 kg');
  await R.screenshot({ path: S + 'shots/completar.png' });
  await R.click('#btn-guardar-completar'); await R.waitForTimeout(1800);
  ok((await q(R, 'SELECT COUNT(*) n FROM solicitudes_recoleccion WHERE estado = \'Asignada\''))[0].n === 0
     && (await q(R, 'SELECT COUNT(*) n FROM recolecciones'))[0].n === 2, 'recolección registrada: 2 materiales');
  const r1 = await R.evaluate(async () => { try { await Eco.Nube.rpc('registrar_salida', { p_id_material: 1, p_id_responsable: 3, p_cantidad: 1, p_fecha: '2026-01-01', p_observaciones: 'x' }); return 'aceptada'; } catch (e) { return e.mensajeServidor; } });
  ok(/permiso/.test(r1), 'el repartidor no puede sacar material del inventario: ' + r1);

  await sincronizar(C);
  ok((await C.$eval('#ciudadano-kilos', e => e.textContent)) === '14,5 kg', 'el ciudadano ve sus 14,5 kg aprovechados');

  // ===== EMPRESA de Soacha pide material
  const E = await nuevoNavegador(b, { sub: 'g-emp', email: 'empresa@gmail.com', name: 'Andina' });
  await registrar(E, { tipo: 'empresa', dep: '25', mun: '25754', razon: 'Recicladora Andina S.A.S.' });
  ok((await vista(E)) === 'vista-empresa', 'empresa entra al panel empresarial');
  ok((await E.$$('#tabla-disponible-body tr')).length === 2, 've los 2 materiales disponibles del municipio');
  ok((await q(E, 'SELECT COUNT(*) n FROM movimientos'))[0].n === 0, 'RLS: la empresa ve existencias pero no movimientos');
  const idPet = (await q(E, "SELECT id_material FROM existencias_municipio WHERE nombre = 'Botellas PET'"))[0].id_material;
  await E.click(`#tabla-disponible-body [data-accion="pedir"][data-id="${idPet}"]`); await E.waitForTimeout(400);
  await E.fill('#pedido-cantidad', '20'); await E.fill('#pedido-precio', '900');
  await E.click('#form-pedido [type="submit"]'); await E.waitForTimeout(300);
  ok(/disponible/.test(await err(E, 'pedido-cantidad')), 'no deja pedir más de lo disponible');
  await E.fill('#pedido-cantidad', '5');
  ok((await E.$eval('#pedido-total', e => e.textContent)).includes('4.500'), 'valor del pedido: $ 4.500');
  await E.click('#form-pedido [type="submit"]'); await E.waitForTimeout(1500);
  ok((await q(E, 'SELECT estado FROM pedidos_empresa'))[0].estado === 'Pendiente', 'pedido enviado al municipio');
  const r2 = await E.evaluate(async () => { const s = JSON.parse(localStorage.getItem('ecogestion_supabase_sesion'));
    const r = await fetch(location.origin + '/rest/v1/pedidos_empresa?id_pedido=gt.0', { method: 'PATCH', headers: { apikey: 'clave-anon-de-prueba-0123456789', Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'Entregado' }) });
    return r.status; });
  ok(r2 === 401 || r2 === 403, 'escritura directa a la tabla bloqueada (HTTP ' + r2 + ')');

  // ===== ADMINISTRADOR aprueba y entrega
  await sincronizar(A);
  await ir(A, 'pedidos');
  await A.click('#tabla-pedidos-body [data-accion="aprobar"]'); await texto(A, 'Recoger el martes');
  ok((await q(A, 'SELECT existencia, comprometido FROM existencias_municipio WHERE id_material = ?', [idPet]))[0].comprometido === 5, 'aprobado: 5 kg reservados');
  await A.click('#tabla-pedidos-body [data-accion="entregar"]'); await confirmar(A);
  ok((await q(A, 'SELECT existencia FROM vista_existencias WHERE id_material = ?', [idPet]))[0].existencia === 3.5, 'entrega registrada: salida automática del inventario (8,5 − 5 = 3,5 kg)');
  await ir(A, 'panel');
  await A.screenshot({ path: S + 'shots/panel.png', fullPage: true });

  // ===== Otro municipio no ve nada de Soacha
  const M = await nuevoNavegador(b, { sub: 'g-med', email: 'sebasrtw@gmail.com', name: 'Sebas' });
  await registrar(M, { dep: '05', mun: '05001' });
  ok((await M.$eval('#marca-municipio', e => e.textContent)) === 'Medellín, Antioquia', 'segundo administrador en Medellín');
  ok((await q(M, 'SELECT COUNT(*) n FROM usuarios'))[0].n === 1 && (await q(M, 'SELECT COUNT(*) n FROM solicitudes_recoleccion'))[0].n === 0
     && (await q(M, 'SELECT COUNT(*) n FROM materiales'))[0].n === 0, 'Medellín no ve cuentas, solicitudes ni materiales de Soacha');

  // ===== Cuenta desactivada y sesión persistente
  await ir(A, 'administracion');
  const idC = (await q(A, "SELECT id_usuario FROM usuarios WHERE correo='ciuda@gmail.com'"))[0].id_usuario;
  await A.click(`#tabla-usuarios-body [data-accion="estado"][data-id="${idC}"]`); await confirmar(A);
  await C.evaluate(() => Eco.App.despuesDeCambio()); await C.waitForTimeout(2500);
  ok(await C.$eval('#capa-acceso', e => !e.hidden) || /desactivada/.test(await C.$eval('#toasts', e => e.innerText)), 'ciudadano desactivado queda fuera');
  await R.reload(); await R.waitForTimeout(2500);
  ok((await vista(R)) === 'vista-rutas' && await R.$eval('#capa-acceso', e => e.hidden), 'la sesión se conserva al recargar');
  ok(await R.$eval('.panel-bd', e => e.hidden), 'el recuadro Base de datos no se muestra al repartidor');
  await R.click('#btn-cerrar-sesion'); await R.waitForTimeout(2000);
  ok(await R.$eval('#capa-acceso', e => !e.hidden), 'cerrar sesión');

  for (const [n, p] of [['admin', A], ['ciudadano', C], ['repartidor', R], ['empresa', E], ['medellín', M]]) console.log('errores', n, p.errs);
  console.log(fallas ? `${fallas} comprobaciones fallaron` : 'Todas las comprobaciones pasaron', '· capturas en', S + 'shots');
  await b.close();
  process.exit(fallas ? 1 : 0);
})();
