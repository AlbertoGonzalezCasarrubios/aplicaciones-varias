// verify.mjs — Verificación del modelo del simulador de biodiésel.
// Uso: node verify.mjs [--detalle]
// Carga js/modelo.js (script clásico, sin DOM) y ejecuta las comprobaciones.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const codigo = readFileSync(join(aqui, 'js', 'modelo.js'), 'utf8');
const M = new Function(codigo + '\nreturn MODELO;')();
const DETALLE = process.argv.includes('--detalle');

let fallos = 0, total = 0;
function check(nombre, cond, info) {
  total++;
  if (!cond) fallos++;
  console.log(`${cond ? '  OK ' : 'FALLO'}  ${nombre}${info ? '  — ' + info : ''}`);
}
const pct = v => (100 * v).toFixed(1) + ' %';
const clonar = o => structuredClone(o);

// Escenario base: soja, 6:1, NaOH 0,8 %, 60 °C, 600 rpm, dosificación 20 g/min
const D = M.CONFIG.defecto;
const base = { aceite: 'soja', m_aceite: D.m_aceite, agl: 0.1, humedad: 0.05, m_meoh: D.m_meoh, m_naoh: D.m_naoh,
               rpm: 600, Tset_C: 60, caudal_g_min: 20, t_min: 120 };
const sim = (cambios) => M.simularProtocolo({ ...base, ...cambios });

const rB = sim({});
const X = (r, t) => M.enTiempo(r.tray, t, 'Y');      // rendimiento en FAME (conversión a ésteres)
const XT = (r, t) => M.enTiempo(r.tray, t, 'X');     // conversión de TG
const jab = r => r.tray[r.tray.length - 1].jabon_g;

if (DETALLE) {
  console.log('Calentamiento base:', rB.tCal_min.toFixed(1), 'min');
  for (const t of [5, 10, 15, 20, 30, 45, 60, 90, 120]) console.log(`  t=${t} min  X_TG=${pct(XT(rB, t))}  Y_FAME=${pct(X(rB, t))}  T=${M.enTiempo(rB.tray, t, 'T_C').toFixed(1)} °C`);
}

console.log('\n[1] Conservación de masa y positividad');
for (const [nom, r] of [['base', rB], ['usado', sim({ aceite: 'usado', agl: 5, humedad: 0.3, m_naoh: 2.5 })], ['exceso cat', sim({ m_naoh: 10 })], ['70 °C', sim({ Tset_C: 70 })]]) {
  check(`masa conservada (${nom})`, r.maxErr <= 1e-3, `error máx ${(r.maxErr * 100).toExponential(2)} %`);
  check(`sin concentraciones negativas (${nom})`, r.minNeg > -1e-9, `mín recortado ${r.minNeg.toExponential(2)} mol`);
}

console.log('\n[2] Conversión no decreciente hasta el equilibrio');
{
  let ok = true, peor = 0;
  for (let i = 1; i < rB.tray.length; i++) { const d = rB.tray[i].X - rB.tray[i - 1].X; if (d < -1e-6) { ok = false; peor = Math.min(peor, d); } }
  check('X_TG no decreciente (base)', ok, ok ? '' : `caída ${peor}`);
}

console.log('\n[3] Estado estacionario térmico');
{
  const cfg = clonar(M.CONFIG); cfg.energia.UA_perdidas = 0; cfg.energia.camisa.UA_perdidas = 0;
  const P = M.propsAceite('soja', cfg);
  const y = M.estadoInicial({ m_aceite: 500 }, P);
  const u = { rpm: 300, Tset: 60 + M.K0, camisa: true, congelado: false };
  for (let i = 0; i < 4 * 3600 * 2; i++) M.avanzar(y, u, P, 0.5, 0.5);
  const dy = new Float64Array(M.NY); M.derivadas(y, u, P, dy);
  check('T → T_camisa sin pérdidas', Math.abs(y[M.IDX.T] - y[M.IDX.TJ]) < 0.01, `T=${(y[M.IDX.T] - M.K0).toFixed(3)} °C, Tj=${(y[M.IDX.TJ] - M.K0).toFixed(3)} °C`);
  check('dT/dt ≈ 0 en el estacionario', Math.abs(dy[M.IDX.T]) < 1e-6, `dT/dt=${dy[M.IDX.T].toExponential(2)} K/s`);
  // Exactamente: con T = Tj, sin pérdidas ni reacción, dT/dt = 0
  y[M.IDX.T] = y[M.IDX.TJ]; M.derivadas(y, u, P, dy);
  check('dT/dt = 0 exacto si T = Tj', Math.abs(dy[M.IDX.T]) < 1e-12);
}

console.log('\n[4] Comportamientos cualitativos');
const r20 = sim({ Tset_C: 20, camisa: false, calentar: false });
const r40 = sim({ Tset_C: 40 });
const r100 = sim({ rpm: 100 });
const r1000 = sim({ rpm: 1000 });
const rUsado = sim({ aceite: 'usado', agl: 5, humedad: 0.3, m_naoh: 2.5 });
const rExc = sim({ m_naoh: 10 });
check('Base (60 °C, 600 rpm, 0,8 % NaOH): >90 % a 60 min', X(rB, 60) > 0.90, pct(X(rB, 60)));
check('Base: >95 % a 90 min', X(rB, 90) > 0.95, pct(X(rB, 90)));
check('Base: aún no completa a 10 min (<85 %)', X(rB, 10) < 0.85, pct(X(rB, 10)));
check('Sin calentar (20 °C): <50 % a 60 min', X(r20, 60) < 0.50, pct(X(r20, 60)));
check('40 °C intermedia', X(r40, 60) > X(r20, 60) + 0.1 && X(r40, 60) < X(rB, 60), `20 °C ${pct(X(r20, 60))} < 40 °C ${pct(X(r40, 60))} < 60 °C ${pct(X(rB, 60))}`);
const t10 = r => { for (const p of r.tray) if (p.Y >= 0.10) return p.t_min; return Infinity; };
check('100 rpm: retraso inicial ≥3× (t al 10 %)', t10(r100) >= 3 * t10(rB), `${t10(r100).toFixed(1)} vs ${t10(rB).toFixed(1)} min`);
check('1000 vs 600 rpm: mejora <2 puntos a 60 min', Math.abs(X(r1000, 60) - X(rB, 60)) < 0.02, `${pct(X(r1000, 60))} vs ${pct(X(rB, 60))}`);
check('Aceite usado (AGL 5 %, NaOH 0,5 %): conversión final <30 %', X(rUsado, 120) < 0.30, pct(X(rUsado, 120)));
check('Aceite usado: jabón ≫ base (>4×)', jab(rUsado) > 4 * jab(rB), `${jab(rUsado).toFixed(1)} g vs ${jab(rB).toFixed(1)} g`);
check('Exceso de catalizador (2 %): jabón >3× base', jab(rExc) > 3 * jab(rB), `${jab(rExc).toFixed(1)} g vs ${jab(rB).toFixed(1)} g`);
{
  const sB = M.iniciarSedimentacion(rB.y, rB.P), sE = M.iniciarSedimentacion(rExc.y, rExc.P);
  check('Exceso de catalizador: separación más lenta (τ)', sE.tau > 1.5 * sB.tau, `${(sE.tau / 60).toFixed(1)} vs ${(sB.tau / 60).toFixed(1)} min`);
  check('Exceso de catalizador: más emulsión estable', sE.fEm > sB.fEm, `${pct(sE.fEm)} vs ${pct(sB.fEm)}`);
}
// Catalizador agotado por AGL (aunque haya catalizador "nominal" de 0,5 %)
check('Catalizador agotado por AGL → conversión baja', X(rUsado, 120) < 0.3 && rUsado.y[M.IDX.B] < 1e-6, `B final ${rUsado.y[M.IDX.B].toExponential(2)} mol`);
// Con suficiente catalizador el aceite usado sí reacciona (control)
const rUsado2 = sim({ aceite: 'usado', agl: 5, humedad: 0.3, m_naoh: 8 });
check('Aceite usado con NaOH suficiente sí reacciona (>70 %)', X(rUsado2, 120) > 0.7, pct(X(rUsado2, 120)));

console.log('\n[5] Separación, decantación, lavado y calidad');
{
  const P = rB.P, sep = M.iniciarSedimentacion(rB.y, P);
  const m0 = M.masaReactor(M.productoRestante(sep), P);
  for (let i = 0; i < 240; i++) M.pasoSedimentacion(sep, 30);
  check('Interfase nítida tras 2 h (claridad >0,95)', M.claridad(sep) > 0.95, M.claridad(sep).toFixed(3));
  const c = M.capas(sep, P);
  check('Fase polar abajo (más densa)', c[0].nombre === 'polar' && c[0].rho > c[1].rho, `${c[0].rho.toFixed(3)} > ${c[1].rho.toFixed(3)} g/cm³`);
  const mDren = M.drenar(sep, c[0].V, P);
  const prod = M.productoRestante(sep);
  check('Masa conservada en la decantación', Math.abs(M.masaReactor(prod, P) + mDren - m0) / m0 < 1e-9);
  let q = M.calidad(prod, P);
  if (DETALLE) console.log('  sin lavar:', Object.fromEntries(Object.entries(q).map(([k, v]) => [k, +v.toFixed(3)])));
  check('Sin lavar: metanol fuera de norma', q.metanol > 0.2, q.metanol.toFixed(2) + ' %');
  let p2 = prod;
  for (let i = 0; i < 3; i++) p2 = M.lavar(p2, P).prod;
  p2 = M.secar(p2, P, 105, 60).prod;
  q = M.calidad(p2, P);
  if (DETALLE) console.log('  lavado+secado:', Object.fromEntries(Object.entries(q).map(([k, v]) => [k, +v.toFixed(3)])));
  check('Lavado + secado: metanol ≤0,2 %', q.metanol <= 0.2, q.metanol.toFixed(3) + ' %');
  check('Lavado + secado: agua ≤500 mg/kg', q.agua <= 500, q.agua.toFixed(0) + ' mg/kg');
  check('Lavado + secado: glicerol libre ≤0,02 %', q.GLlibre <= 0.02, q.GLlibre.toFixed(4) + ' %');
  check('Índice de yodo de soja ≈ 120–140', q.yodo > 120 && q.yodo < 140, q.yodo.toFixed(1));
  check('Viscosidad en rango plausible (3,5–5)', q.viscosidad > 3.5 && q.viscosidad < 5.0, q.viscosidad.toFixed(2) + ' mm²/s');
  check('Densidad en rango plausible (860–900)', q.densidad > 860 && q.densidad < 900, q.densidad.toFixed(1) + ' kg/m³');
  // Cortar pronto deja glicerina en el producto
  const sep2 = M.iniciarSedimentacion(rB.y, P);
  for (let i = 0; i < 240; i++) M.pasoSedimentacion(sep2, 30);
  M.drenar(sep2, 0.5 * M.capas(sep2, P)[0].V, P);
  const q2 = M.calidad(M.productoRestante(sep2), P);
  check('Cortar pronto: más glicerol libre', q2.GLlibre > 10 * M.calidad(prod, P).GLlibre, `${q2.GLlibre.toFixed(2)} %`);
}

console.log(`\n${total - fallos}/${total} comprobaciones superadas.`);
process.exit(fallos ? 1 : 0);
