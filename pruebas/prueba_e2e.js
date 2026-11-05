const { chromium } = require('playwright');
const os = require('os'), fs = require('fs'), path = require('path');
const URL_APP = process.env.URL_APP || 'http://localhost:8800/';
// Dos imágenes PNG pequeñas para probar la subida de fotos
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-')) + path.sep;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAV0lEQVR4Xu3RAQkAIQAEQTXQ97GK6eVTLMJMgjt2fmePl62Xx/8cqClQU6CmQE2BmgI1BWoK1BSoKVBToKZATYGaAjUFagrUFKgpUFOgpkBNgZoCNQVqF0G4AWFNBaF8AAAAAElFTkSuQmCC', 'base64');
fs.writeFileSync(S + 'foto0.png', PNG); fs.writeFileSync(S + 'foto1.png', PNG);
fs.mkdirSync(S + 'shots', { recursive: true });
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m);
const GIS = `window.google={accounts:{id:{initialize(c){window.__gis=c},disableAutoSelect(){},
 renderButton(el){el.innerHTML='<button type="button" id="gis-falso">Continuar con Google</button>';el.firstChild.onclick=()=>window.__gisLogin()}}}};`;
async function nuevoNavegador(b, cuenta) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({ contentType: 'text/javascript', body: GIS }));
  await ctx.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 404, body: '' }));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text().slice(0, 160)); });
  p.on('dialog', d => d.accept());
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
const toast = (p) => p.$eval('#toasts', e => e.innerText.split('\n').filter(Boolean).slice(-1)[0] || '');
const ir = async (p, v) => { await p.click(`.menu-item[data-vista="${v}"]`); await p.waitForTimeout(300); };
const confirmar = async (p) => { await p.waitForTimeout(250); await p.click('#btn-confirmar-accion'); await p.waitForTimeout(900); };
const q = (p, sql, params = []) => p.evaluate(([s, pr]) => Eco.DB.consultar(s, pr), [sql, params]);

(async () => {
  const b = await chromium.launch();
  // ===== ADMIN (correo configurado)
  const A = await nuevoNavegador(b, { sub: 'g-admin', email: 'imsebasff@gmail.com', name: 'Ryuuga', picture: 'https://lh3.googleusercontent.com/a' });
  ok(!(await A.$('#acceso-demo')) && !(await A.$('.cuenta-demo')), 'no existe acceso de demostración');
  await A.screenshot({ path: S + 'shots/n_login.png' });
  await A.click('#gis-falso'); await A.waitForTimeout(2500);
  ok((await A.$eval('.vista.activa', e => e.id)) === 'vista-panel', 'admin entra al panel (verificación del nonce OK)');
  ok((await A.$eval('#estado-guardado', e => e.textContent)) === 'Sincronizado con Supabase', 'estado: Sincronizado con Supabase');
  ok((await q(A, 'SELECT COUNT(*) n FROM materiales'))[0].n === 0 && (await q(A, 'SELECT COUNT(*) n FROM publicaciones'))[0].n === 0, 'sistema arranca sin datos de ejemplo');
  // material + recolección
  await ir(A, 'materiales');
  await A.click('#btn-nuevo-material'); await A.waitForTimeout(300);
  await A.fill('#material-nombre', 'Botellas PET'); await A.selectOption('#material-categoria', 'Plástico'); await A.selectOption('#material-unidad', 'kg');
  await A.click('#btn-guardar-material'); await A.waitForTimeout(1500);
  ok((await q(A, "SELECT COUNT(*) n FROM materiales WHERE nombre='Botellas PET'"))[0].n === 1, 'admin crea material en Supabase y la réplica lo muestra');
  await A.click('#btn-nuevo-material'); await A.waitForTimeout(300);
  await A.fill('#material-nombre', 'botellas pet'); await A.selectOption('#material-categoria', 'Plástico'); await A.selectOption('#material-unidad', 'kg');
  await A.click('#btn-guardar-material'); await A.waitForTimeout(800);
  ok(/Ya existe/.test(await err(A, 'material-nombre')), 'duplicado detectado: ' + await err(A, 'material-nombre'));
  await A.keyboard.press('Escape');
  await ir(A, 'recolecciones');
  await A.click('#btn-nueva-recoleccion'); await A.waitForTimeout(300);
  const idMat = (await q(A, "SELECT id_material FROM materiales"))[0].id_material;
  await A.selectOption('#recoleccion-material', String(idMat)); await A.fill('#recoleccion-cantidad', '48.5');
  const resp = await A.$$eval('#recoleccion-responsable option', os => os.map(o => o.value).filter(Boolean));
  await A.selectOption('#recoleccion-responsable', resp[0]);
  await A.click('#btn-guardar-recoleccion'); await A.waitForTimeout(1500);
  ok((await q(A, "SELECT existencia FROM vista_existencias"))[0].existencia === 48.5, 'recolección en el servidor → existencias 48,5 en la réplica');
  await ir(A, 'inventario');
  await A.click(`#tabla-inventario-body [data-accion="salida"][data-id="${idMat}"]`); await A.waitForTimeout(300);
  await A.fill('#salida-cantidad', '8.5'); await A.selectOption('#salida-responsable', resp[0]); await A.fill('#salida-observaciones', 'Planta');
  await A.click('#btn-guardar-salida'); await A.waitForTimeout(1500);
  ok((await q(A, "SELECT existencia FROM vista_existencias"))[0].existencia === 40, 'salida registrada → 40');

  // ===== VENDEDOR nuevo (registro)
  const V = await nuevoNavegador(b, { sub: 'g-vend', email: 'vende@gmail.com', name: 'Carlos Ramírez' });
  await V.click('#gis-falso'); await V.waitForTimeout(1800);
  ok(await V.$eval('#paso-registro', e => !e.hidden), 'cuenta nueva ve el registro');
  await V.check('input[name="registro-tipo"][value="vendedor"]', { force: true }); await V.fill('#registro-ubicacion', 'Bogotá · Kennedy'); await V.fill('#registro-telefono', '300 555 0123');
  await V.click('#btn-crear-cuenta'); await V.waitForTimeout(2500);
  ok((await V.$eval('.vista.activa', e => e.id)) === 'vista-mercado', 'vendedor registrado entra al mercado');
  ok((await q(V, 'SELECT COUNT(*) n FROM materiales'))[0].n === 0, 'RLS: el vendedor no recibe datos del centro de acopio');
  await ir(V, 'publicaciones');
  await V.click('#btn-nueva-publicacion'); await V.waitForTimeout(300);
  await V.selectOption('#publicacion-tipo', 'Plástico'); await V.fill('#publicacion-nombre', 'Botellas PET transparentes');
  await V.fill('#publicacion-cantidad', '85'); await V.fill('#publicacion-precio', '900');
  await V.setInputFiles('#publicacion-fotos', [S + 'foto0.png', S + 'foto1.png']); await V.waitForTimeout(1500);
  await V.click('#btn-guardar-publicacion'); await V.waitForTimeout(2500);
  const pub = await q(V, 'SELECT p.id_publicacion id, (SELECT COUNT(*) FROM fotos_publicacion f WHERE f.id_publicacion=p.id_publicacion) fotos, (SELECT imagen FROM fotos_publicacion LIMIT 1) url FROM publicaciones p');
  ok(pub.length === 1 && pub[0].fotos === 2 && /\/storage\/v1\/object\/public\/fotos\//.test(pub[0].url), 'publicación con 2 fotos subidas a Storage');
  await ir(V, 'mercado');
  const imgOk = await V.$eval('#mercado-grid .foto-material img', i => i.complete && i.naturalWidth > 0).catch(() => false);
  ok(imgOk, 'la foto se carga desde Storage en el mercado');
  await V.screenshot({ path: S + 'shots/n_mercado.png' });

  // ===== COMPRADOR nuevo
  const C = await nuevoNavegador(b, { sub: 'g-comp', email: 'compra@gmail.com', name: 'Andrea Torres' });
  await C.click('#gis-falso'); await C.waitForTimeout(1800);
  await C.check('input[name="registro-tipo"][value="comprador"]', { force: true }); await C.fill('#registro-ubicacion', 'Bogotá · Suba');
  await C.click('#btn-crear-cuenta'); await C.waitForTimeout(2500);
  ok((await C.$$('#mercado-grid .tarjeta-publicacion')).length === 1, 'OTRA persona en OTRO navegador ve la publicación (datos compartidos)');
  await C.click('#mercado-grid [data-accion="ofertar"]'); await C.waitForTimeout(400);
  await C.fill('#oferta-cantidad', '30'); await C.fill('#oferta-precio', '850');
  await C.click('#form-oferta [type="submit"]'); await C.waitForTimeout(1500);
  ok((await q(C, "SELECT estado FROM ofertas"))[0].estado === 'Pendiente', 'comprador envía oferta');
  // forzar la regla del servidor: una segunda oferta saltando la validación local
  const r2 = await C.evaluate(async (id) => { try { await Eco.Nube.rpc('enviar_oferta', { p_id_publicacion: id, p_cantidad: 1, p_precio: 1, p_mensaje: null }); return 'aceptada'; } catch (e) { return e.mensajeServidor; } }, pub[0].id);
  ok(/pendiente/.test(r2), 'servidor rechaza segunda oferta aunque se salte la interfaz: ' + r2);
  const r3 = await C.evaluate(async () => { try { await Eco.Nube.rpc('guardar_material', { p_id: null, p_nombre: 'Hack', p_categoria: 'Otros', p_unidad: 'kg', p_descripcion: null }); return 'aceptada'; } catch (e) { return e.mensajeServidor; } });
  ok(/permiso/.test(r3), 'comprador no puede llamar funciones de administrador: ' + r3);
  const r4 = await C.evaluate(async () => { const s = JSON.parse(localStorage.getItem('ecogestion_supabase_sesion'));
    const r = await fetch(location.origin + '/rest/v1/publicaciones?id_publicacion=gt.0', { method: 'PATCH', headers: { apikey: 'clave-anon-de-prueba-0123456789', Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ precio_unitario: 1 }) });
    return r.status; });
  ok(r4 === 401 || r4 === 403, 'escritura directa a la tabla bloqueada (HTTP ' + r4 + ')');

  // ===== VENDEDOR ve la oferta (sincronización periódica / botón)
  await V.evaluate(() => Eco.App.despuesDeCambio()); await V.waitForTimeout(1500); // equivale a la actualización automática
  await ir(V, 'ofertas');
  ok(await V.$eval('#menu-contador-ofertas', e => !e.hidden && e.textContent === '1'), 'vendedor recibe la oferta tras sincronizar');
  ok(await V.$eval('.panel-bd', e => e.hidden), 'el recuadro Base de datos no se muestra al vendedor');
  const idOf = (await q(V, 'SELECT id_oferta FROM ofertas'))[0].id_oferta;
  await V.click(`#tabla-recibidas-body [data-accion="aceptar"][data-id="${idOf}"]`); await confirmar(V); await V.waitForTimeout(800);
  ok((await q(V, 'SELECT cantidad_disponible c FROM publicaciones'))[0].c === 55, 'aceptar en el servidor descuenta 30 kg → 55');
  await V.click(`#tabla-recibidas-body [data-accion="completar"][data-id="${idOf}"]`); await confirmar(V); await V.waitForTimeout(800);
  ok((await q(V, 'SELECT estado FROM transacciones'))[0].estado === 'Completada', 'operación completada');
  await V.screenshot({ path: S + 'shots/n_ofertas.png', fullPage: true });

  // ===== EMPRESA
  const E = await nuevoNavegador(b, { sub: 'g-emp', email: 'empresa@gmail.com', name: 'Andina' });
  await E.click('#gis-falso'); await E.waitForTimeout(1800);
  await E.check('input[name="registro-tipo"][value="empresa"]', { force: true }); await E.fill('#registro-ubicacion', 'Bogotá'); await E.fill('#registro-razon', 'Recicladora Andina S.A.S.');
  await E.click('#btn-crear-cuenta'); await E.waitForTimeout(2500);
  await ir(E, 'empresa');
  await E.click('#btn-nueva-necesidad'); await E.waitForTimeout(300);
  await E.selectOption('#necesidad-tipo', 'Plástico'); await E.fill('#necesidad-minima', '200'); await E.fill('#necesidad-maxima', '1000'); await E.fill('#necesidad-precio', '950');
  await E.click('#form-necesidad [type="submit"]'); await E.waitForTimeout(1500);
  ok((await q(E, 'SELECT COUNT(*) n FROM necesidades_empresa'))[0].n === 1, 'empresa publica necesidad');
  ok((await E.$eval('#empresa-razon', e => e.value)) === 'Recicladora Andina S.A.S.', 'perfil empresarial creado en el registro');

  // ===== ADMIN ve todo y desactiva
  await A.click('#btn-sincronizar'); await A.waitForTimeout(1500);
  await ir(A, 'administracion');
  ok((await A.$$('#tabla-usuarios-body tr')).length === 4, 'admin ve las 4 cuentas');
  const idComp = (await q(A, "SELECT id_usuario FROM usuarios WHERE correo='compra@gmail.com'"))[0].id_usuario;
  await A.click(`#tabla-usuarios-body [data-accion="estado"][data-id="${idComp}"]`); await confirmar(A);
  ok((await q(A, 'SELECT activo FROM perfiles WHERE id_usuario=?', [idComp]))[0].activo === 0, 'admin desactiva al comprador');
  await A.click('#vista-administracion .pestana[data-pestana="estadisticas"]'); await A.waitForTimeout(400);
  ok((await A.$eval('#est-valor', e => e.textContent)).includes('25.500'), 'estadísticas con datos compartidos: ' + await A.$eval('#est-valor', e => e.textContent));
  // el comprador desactivado es expulsado en su próxima sincronización
  await C.evaluate(() => Eco.App.despuesDeCambio()); await C.waitForTimeout(2500);
  ok(await C.$eval('#capa-acceso', e => !e.hidden) || /desactivada/.test(await toast(C)), 'comprador desactivado queda fuera');
  // sesión persiste al recargar
  await V.reload(); await V.waitForTimeout(2500);
  ok((await V.$eval('.vista.activa', e => e.id)) === 'vista-mercado' && await V.$eval('#capa-acceso', e => e.hidden), 'la sesión se conserva al recargar');
  await V.click('#btn-cerrar-sesion'); await V.waitForTimeout(2000);
  ok(await V.$eval('#capa-acceso', e => !e.hidden), 'cerrar sesión');
  for (const [n, p] of [['admin', A], ['vend', V], ['comp', C], ['emp', E]]) console.log('errores', n, p.errs);
  await b.close();
})();
