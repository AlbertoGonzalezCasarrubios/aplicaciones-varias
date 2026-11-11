/* app.js — máquina de estados, render, gráficas, UI y exportación.
 * Simulador docente de reactor batch de biodiésel. Script clásico (no módulo ES) para que funcione con file://. */
'use strict';
/* =====================================================================
 * MÁQUINA DE ESTADOS DEL EXPERIMENTO
 * Pasos: 0 metóxido → 1 aceite → 2 agitación → 3 calentar → 4 dosificar → 5 reacción
 *        → 6 sedimentación → 7 decantación → 8 lavado/secado → 9 resultados
 * ===================================================================== */
const DT_SIM = 0.5;               // paso del integrador (s simulados)
const MUESTREO_S = 15;            // muestreo de las gráficas (s simulados)
const CAUDAL_VALVULA_ML_S = 3;    // caudal de la válvula (mL por segundo REAL, independiente de la velocidad)
const NPASOS = 10;

function nuevoExperimento() {
  return {
    paso: 0, P: null, y: null, u: { rpm: 600, Tset: 60 + K0, camisa: true, congelado: false },
    t: 0, tDosis: null, tFinReac: null, TG0: 0, m0: 0, metoxido: null, aceite: null,
    hist: [], sigMuestra: 0, corriendo: false, dosificando: false, sinCalentar: false,
    modoDosis: 'gradual', caudal: 20, tanque0_g: 0, Tmax: 0,
    sep: null, tSed: 0, valvula: false, prod: null, nLavados: 0, nSecados: 0, mAguasLavado: 0,
    calidad: null, guardado: false, sucio: true
  };
}
let EXP = nuevoExperimento();
let PAUSADO = false, VELOCIDAD = 60, RETO = null;
let REGISTRO = [];
const COMPARAR = new Set();

function irAPaso(i) { EXP.paso = i; EXP.sucio = true; UI.pasos(); UI.panelPaso(true); }

function leerNum(id, lim) {
  const v = parseFloat(document.getElementById(id).value);
  if (!Number.isFinite(v)) return NaN;
  if (lim && (v < lim[0] || v > lim[1])) return NaN;
  return v;
}

const ACCIONES = {
  prepararMetoxido() {
    const L = CONFIG.limites, m = leerNum('inMeOH', L.m_meoh), n = leerNum('inNaOH', L.m_naoh);
    if (!Number.isFinite(m) || !Number.isFinite(n) || m <= 0) { UI.error('derivMetoxido'); return; }
    EXP.metoxido = { m_meoh: m, m_naoh: n };
    irAPaso(1);
  },
  cargarAceite() {
    const L = CONFIG.limites;
    const a = { aceite: document.getElementById('selAceite').value, m_aceite: leerNum('inAceite', L.m_aceite),
                agl: leerNum('inAGL', L.agl), humedad: leerNum('inHum', L.humedad) };
    if (![a.m_aceite, a.agl, a.humedad].every(Number.isFinite) || a.agl + a.humedad >= 50) { UI.error('derivAceite'); return; }
    EXP.aceite = a;
    EXP.P = propsAceite(a.aceite);
    EXP.y = estadoInicial({ ...a, ...EXP.metoxido }, EXP.P);
    EXP.TG0 = EXP.y[IDX.TG];
    EXP.m0 = masaTotal(EXP.y, EXP.P);
    EXP.tanque0_g = EXP.metoxido.m_meoh + EXP.metoxido.m_naoh;
    EXP.Tmax = EXP.y[IDX.T] - K0;
    muestrear();
    irAPaso(2);
  },
  confirmarAgitacion() { irAPaso(3); },
  iniciarCalentamiento() { EXP.corriendo = true; EXP.sucio = true; },
  irADosificar() {
    if (!puedeDosificar()) return;
    EXP.corriendo = true; EXP.sinCalentar = document.getElementById('chkSinCalentar').checked;
    irAPaso(4);
  },
  iniciarDosificacion() {
    const modo = document.querySelector('input[name="dosis"]:checked').value;
    const q = leerNum('inCaudal', CONFIG.limites.caudal);
    if (modo === 'gradual' && !Number.isFinite(q)) { UI.error('derivDosis'); return; }
    EXP.modoDosis = modo; EXP.caudal = q;
    EXP.dosificando = true; EXP.tDosis = EXP.t; EXP.corriendo = true;
    if (modo === 'golpe') dosificar(EXP.y, 1e12, EXP.P);
    muestrear();
    irAPaso(5);
  },
  pararReaccion() {
    EXP.u.congelado = true; EXP.corriendo = false; EXP.dosificando = false; EXP.tFinReac = EXP.t;
    muestrear();
    EXP.sep = iniciarSedimentacion(EXP.y, EXP.P);
    EXP.tSed = 0;
    irAPaso(6);
  },
  irADecantar() { irAPaso(7); },
  alternarValvula() { EXP.valvula = !EXP.valvula; EXP.sucio = true; UI.panelPaso(true); },
  drenarML(ml) { if (EXP.sep) { drenar(EXP.sep, ml, EXP.P); EXP.sucio = true; } },
  terminarDecantacion() {
    EXP.valvula = false;
    EXP.prod = productoRestante(EXP.sep);
    irAPaso(8);
  },
  lavar() {
    const r = lavar(EXP.prod, EXP.P);
    EXP.prod = r.prod; EXP.nLavados++; EXP.mAguasLavado += masaReactor(r.aguas, EXP.P); EXP.sucio = true;
    UI.panelPaso(true);
  },
  secar() {
    const T = leerNum('inTsec', [40, 150]), tm = leerNum('inTiempoSec', [1, 600]);
    if (!Number.isFinite(T) || !Number.isFinite(tm)) { UI.error('estadoLav'); return; }
    EXP.prod = secar(EXP.prod, EXP.P, T, tm).prod; EXP.nSecados++; EXP.sucio = true;
    UI.panelPaso(true);
  },
  verResultados() { EXP.calidad = calidad(EXP.prod, EXP.P); irAPaso(9); },
  guardar() {
    if (EXP.guardado) return;
    REGISTRO.push(crearRegistro());
    EXP.guardado = true;
    guardarRegistroLocal();
    UI.registro(); UI.panelPaso(true);
  },
  nuevo() { reiniciar(false); }
};

function puedeDosificar() {
  if (!EXP.y) return false;
  const sin = document.getElementById('chkSinCalentar').checked;
  return sin || !EXP.u.camisa || EXP.y[IDX.T] >= EXP.u.Tset - CONFIG.energia.tolerancia_K;
}

function reiniciar(preguntar) {
  const enCurso = EXP.paso > 0 && !EXP.guardado;
  if (preguntar && enCurso && !window.confirm(t('confReiniciar'))) return;
  EXP = nuevoExperimento();
  leerOperacion();
  document.getElementById('chkSinCalentar').checked = !!(RETO && RETO.params.sinCalentar);
  UI.pasos(); UI.panelPaso(true); UI.graficas(); UI.lecturas();
}

/** Registra un punto de las gráficas. */
function muestrear() {
  const y = EXP.y, P = EXP.P;
  if (!y) return;
  const m = i => y[i] * P.mw[i];
  const base = m(IDX.TG) + m(IDX.DG) + m(IDX.MG) + m(IDX.GL) + m(IDX.FAME);
  EXP.hist.push({ t: EXP.t, TG: 100 * m(IDX.TG) / base, DG: 100 * m(IDX.DG) / base, MG: 100 * m(IDX.MG) / base,
    GL: 100 * m(IDX.GL) / base, FAME: 100 * m(IDX.FAME) / base, T: y[IDX.T] - K0, Tj: y[IDX.TJ] - K0,
    X: 100 * conversionTG(y, EXP.TG0), Y: 100 * rendimientoFAME(y, EXP.TG0) });
  EXP.sigMuestra = EXP.t + MUESTREO_S;
  graficasSucias = true;
}

/** Avance del reloj de simulación (dtReal en s reales). */
function avanzarSimulacion(dtReal) {
  const dtSim = dtReal * VELOCIDAD;
  if (EXP.corriendo && EXP.y && !EXP.u.congelado) {
    let resto = dtSim;
    while (resto > 1e-9) {
      const h = Math.min(DT_SIM, resto);
      if (EXP.dosificando && EXP.modoDosis === 'gradual') dosificar(EXP.y, EXP.caudal / 60 * h, EXP.P);
      if (EXP.y[IDX.TQ_MEOH] + EXP.y[IDX.TQ_B] <= 0) EXP.dosificando = false;
      avanzar(EXP.y, EXP.u, EXP.P, h, h);
      EXP.t += h; resto -= h;
      EXP.Tmax = Math.max(EXP.Tmax, EXP.y[IDX.T] - K0);
      if (EXP.t >= EXP.sigMuestra) muestrear();
    }
    EXP.sucio = true;
  }
  if (EXP.sep && (EXP.paso === 6 || EXP.paso === 7) && dtSim > 0) {
    pasoSedimentacion(EXP.sep, dtSim);
    EXP.tSed += dtSim; EXP.sucio = true;
  }
  if (EXP.paso === 7 && EXP.valvula && dtReal > 0) {
    drenar(EXP.sep, CAUDAL_VALVULA_ML_S * dtReal, EXP.P);
    const quedan = capas(EXP.sep, EXP.P).reduce((s, c) => s + c.V, 0);
    if (quedan < 1) EXP.valvula = false;
    EXP.sucio = true;
  }
}

/** Avisos operativos actuales. */
function avisosActuales() {
  const a = [], y = EXP.y;
  if (!y) return a;
  const T = y[IDX.T] - K0, e = CONFIG.energia;
  if (T >= e.T_eb_MeOH_C) a.push(['bad', t('av_Teb')]);
  else if (T > e.T_aviso_C) a.push(['warn', t('av_T60')]);
  const ev = y[IDX.MEOH_EV] * CONFIG.M.MeOH;
  if (ev > 1) a.push(['warn', t('av_evap', { g: fmt(ev, 1) })]);
  if (EXP.tDosis != null && !EXP.dosificando && EXP.paso === 5 && y[IDX.B] / (volumen(y, EXP.P, y[IDX.T]) / 1000) < CONFIG.cinetica.B_umbral_molL * 0.3)
    a.push(['bad', t('av_catAgotado')]);
  if (EXP.tDosis != null && y[IDX.JABON] * EXP.P.mw[IDX.JABON] > 0.02 * EXP.aceite.m_aceite) a.push(['warn', t('av_jabon')]);
  if (EXP.paso === 5 && y[IDX.MEOH] > 0 && eficiencia(y, EXP.u.rpm, EXP.P) < 0.3 && EXP.u.rpm < 250) a.push(['info', t('av_sinMezcla')]);
  return a;
}

/** Registro de una corrida. */
function crearRegistro() {
  const P = EXP.P, y = EXP.y, q = EXP.calidad;
  const ev = evaluarNorma(q, 'en');
  const conLim = ev.filter(r => r.ok !== null);
  const nTG = EXP.TG0;
  const histRel = EXP.hist.filter((h, i) => i % Math.max(1, Math.ceil(EXP.hist.length / 300)) === 0 || i === EXP.hist.length - 1)
    .map(h => ({ x: +((h.t - EXP.tDosis) / 60).toFixed(3), T: +h.T.toFixed(2), Tj: +h.Tj.toFixed(2), X: +h.X.toFixed(2), Y: +h.Y.toFixed(2),
                 TG: +h.TG.toFixed(2), DG: +h.DG.toFixed(2), MG: +h.MG.toFixed(2), GL: +h.GL.toFixed(2), FAME: +h.FAME.toFixed(2) }));
  return {
    id: REGISTRO.length ? REGISTRO[REGISTRO.length - 1].id + 1 : 1,
    fecha: new Date().toISOString(),
    reto: RETO ? RETO.id : null,
    entradas: { ...EXP.aceite, ...EXP.metoxido, rpm: EXP.u.rpm, Tset_C: EXP.u.Tset - K0, camisa: EXP.u.camisa,
                sinCalentar: EXP.sinCalentar, modoDosis: EXP.modoDosis, caudal_g_min: EXP.caudal },
    derivadas: { relacionMolar: (EXP.metoxido.m_meoh / CONFIG.M.MeOH) / nTG, NaOH_pct: 100 * EXP.metoxido.m_naoh / EXP.aceite.m_aceite },
    resultados: {
      t_reaccion_min: (EXP.tFinReac - EXP.tDosis) / 60, conversionTG_pct: 100 * conversionTG(y, nTG), rendimientoFAME_pct: 100 * rendimientoFAME(y, nTG),
      Tmax_C: EXP.Tmax, jabon_g: y[IDX.JABON] * P.mw[IDX.JABON], metanolEvaporado_g: y[IDX.MEOH_EV] * CONFIG.M.MeOH,
      t_sedimentacion_min: EXP.tSed / 60, masaProducto_g: q.masa, rendimientoMasico_pct: 100 * EXP.prod[IDX.FAME] * P.mw[IDX.FAME] / EXP.aceite.m_aceite,
      lavados: EXP.nLavados, secados: EXP.nSecados, cumpleEN: conLim.filter(r => r.ok).length, totalEN: conLim.length
    },
    calidad: q,
    hist: histRel
  };
}

function guardarRegistroLocal() {
  try { localStorage.setItem('biodiesel_registro_v1', JSON.stringify(REGISTRO)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}
function cargarRegistroLocal() {
  try { const s = localStorage.getItem('biodiesel_registro_v1'); if (s) { const r = JSON.parse(s); if (Array.isArray(r)) REGISTRO = r; } } catch (e) { REGISTRO = []; }
}

/* =====================================================================
 * RENDER — reactor animado (Canvas 2D)
 * ===================================================================== */
const COL = {
  fame: [247, 226, 140], glic: [122, 72, 30], meoh: [214, 232, 246], vidrio: '#8fa0ad', tinta: '#132230', tinta2: '#3f4e5c', muted: '#677585',
  acero1: '#e9eef2', acero2: '#9aa7b2', acero3: '#5d6b77',
  frio: [86, 180, 233], templado: [230, 159, 0], caliente: [213, 94, 0]
};
const mezclaRGB = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, f))));
const rgb = (c, al) => al == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${al})`;
const sombra = (c, f) => c.map(v => Math.round(v * f));
const aclarar = (c, f) => c.map(v => Math.round(v + (255 - v) * f));
function colorTemp(Tc) {
  const f = (Tc - 15) / 65;
  return f < 0.5 ? mezclaRGB(COL.frio, COL.templado, f * 2) : mezclaRGB(COL.templado, COL.caliente, (f - 0.5) * 2);
}
const ANIM = { ang: 0, gotas: [], burbujas: [], gotasValvula: [] };
for (let i = 0; i < 70; i++) ANIM.gotas.push({ r: Math.random(), z: Math.random(), ph: Math.random() * 6.283, s: 1.5 + Math.random() * 2.5, w: 0.6 + Math.random() * 0.8 });

const REACTOR = { cv: null, ctx: null, w: 0, h: 0 };
function ajustarCanvas(cv, ctxHolder) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return false;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctxHolder.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctxHolder.w = w; ctxHolder.h = h;
  return true;
}
const FUENTE_CV = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

/** Etiqueta tipo "píldora" con punto de color opcional y línea guía opcional hacia (lx, ly). */
function etiqueta(ctx, txt, x, y, opts) {
  opts = opts || {};
  const size = opts.size || 13;
  ctx.font = (opts.bold ? '650 ' : '500 ') + size + 'px ' + FUENTE_CV;
  const w = ctx.measureText(txt).width, padX = 8, hgt = size + 10, punto = opts.punto ? 12 : 0;
  const ancho = w + 2 * padX + punto;
  const x0 = opts.align === 'right' ? x - ancho : opts.align === 'center' ? x - ancho / 2 : x;
  if (opts.guia) {
    ctx.strokeStyle = 'rgba(63,78,92,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(opts.align === 'right' ? x0 + ancho : x0, y); ctx.lineTo(opts.guia[0], opts.guia[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(63,78,92,0.8)'; ctx.beginPath(); ctx.arc(opts.guia[0], opts.guia[1], 2.5, 0, 6.283); ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(16,32,48,0.14)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
  ctx.fillStyle = opts.fondo || 'rgba(255,255,255,0.96)';
  ctx.beginPath(); ctx.roundRect(x0, y - hgt / 2, ancho, hgt, hgt / 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = opts.borde || 'rgba(16,32,48,0.10)'; ctx.lineWidth = opts.borde ? 2 : 1; ctx.stroke();
  if (opts.punto) { ctx.fillStyle = opts.punto; ctx.beginPath(); ctx.arc(x0 + padX + 4, y, 4.5, 0, 6.283); ctx.fill(); }
  ctx.fillStyle = opts.color || COL.tinta; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(txt, x0 + padX + punto, y + 0.5);
}

/** Rellena el área con un degradado cilíndrico (bordes más oscuros) sobre un color base. */
function sombreadoCilindrico(ctx, x, y, w, h, intensidad) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, `rgba(0,0,0,${0.16 * intensidad})`);
  g.addColorStop(0.18, `rgba(0,0,0,${0.03 * intensidad})`);
  g.addColorStop(0.32, `rgba(255,255,255,${0.10 * intensidad})`);
  g.addColorStop(0.65, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.20 * intensidad})`);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
function degradadoVertical(ctx, x, y, w, h, c) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, rgb(aclarar(c, 0.18))); g.addColorStop(1, rgb(sombra(c, 0.86)));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
function acero(ctx, x, y, w, h, r, vertical) {
  const g = vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, COL.acero2); g.addColorStop(0.35, COL.acero1); g.addColorStop(1, COL.acero3);
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

function dibujarReactor(dtReal) {
  const R = REACTOR;
  if (!ajustarCanvas(R.cv, R)) return;
  const ctx = R.ctx, W = R.w, H = R.h, g = CONFIG.reactor;
  ctx.clearRect(0, 0, W, H);
  // --- Geometría ---
  const vw = W * 0.40, vx = W * 0.30, vTop = H * 0.21, vH = H * 0.54, vBot = vTop + vH, cx = vx + vw / 2;
  const rFondo = vw * 0.16;
  const pxcm = vH / g.altura_cm, area = Math.PI * Math.pow(g.diametro_cm / 2, 2);
  const y = EXP.y, P = EXP.P;
  const Tc = y ? y[IDX.T] - K0 : CONFIG.T_amb_C, Tjc = y ? y[IDX.TJ] - K0 : CONFIG.T_amb_C;
  const rpm = (EXP.paso >= 6 || !y) ? 0 : EXP.u.rpm;
  const fl = Math.max(10.5, Math.min(13.5, W / 38));
  const t_s = performance.now() / 1000;

  // --- Sombra en la mesa ---
  const sueloY = Math.min(H - 8, vBot + H * 0.2);
  const gs = ctx.createRadialGradient(cx, sueloY, 4, cx, sueloY, vw * 0.9);
  gs.addColorStop(0, 'rgba(16,32,48,0.16)'); gs.addColorStop(1, 'rgba(16,32,48,0)');
  ctx.fillStyle = gs; ctx.beginPath(); ctx.ellipse(cx, sueloY, vw * 0.9, 10, 0, 0, 6.283); ctx.fill();

  // --- Camisa (con sombreado cilíndrico y conexiones) ---
  const jk = Math.max(14, W * 0.036), jTop = vTop + vH * 0.10, jBot = vBot + jk;
  const cJ = colorTemp(Tjc);
  // conexiones de entrada (abajo) y salida (arriba) del fluido térmico
  ctx.fillStyle = COL.acero2;
  ctx.fillRect(vx - jk - 18, jBot - 26, 20, 9); ctx.fillRect(vx + vw + jk - 2, jTop + 10, 20, 9);
  ctx.beginPath(); ctx.roundRect(vx - jk, jTop, vw + 2 * jk, jBot - jTop, [6, 6, rFondo + jk, rFondo + jk]);
  const gj = ctx.createLinearGradient(vx - jk, 0, vx + vw + jk, 0);
  gj.addColorStop(0, rgb(sombra(cJ, 0.72))); gj.addColorStop(0.3, rgb(aclarar(cJ, 0.25))); gj.addColorStop(0.7, rgb(cJ)); gj.addColorStop(1, rgb(sombra(cJ, 0.66)));
  ctx.fillStyle = gj; ctx.fill();
  ctx.strokeStyle = rgb(sombra(cJ, 0.55)); ctx.lineWidth = 1.5; ctx.stroke();
  // ondas de calor cuando la camisa calienta
  const vel = y ? velocidades(y, EXP.u, P) : null;
  if (vel && vel.Pcal > 5 && EXP.paso < 6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const yy = jTop + 20 + ((t_s * 18 + k * 30) % (jBot - jTop - 40));
      for (const xx of [vx - jk / 2, vx + vw + jk / 2]) {
        ctx.beginPath(); ctx.moveTo(xx, yy + 8);
        ctx.bezierCurveTo(xx - 3, yy + 4, xx + 3, yy + 2, xx, yy - 3); ctx.stroke();
      }
    }
  }

  // --- Recipiente de vidrio (interior) ---
  const caminoVaso = () => { ctx.beginPath(); ctx.roundRect(vx, vTop, vw, vH, [0, 0, rFondo, rFondo]); };
  caminoVaso();
  const gv = ctx.createLinearGradient(vx, 0, vx + vw, 0);
  gv.addColorStop(0, '#eef3f7'); gv.addColorStop(0.5, '#fbfdfe'); gv.addColorStop(1, '#e8eef3');
  ctx.fillStyle = gv; ctx.fill();

  // --- Contenido ---
  ctx.save(); caminoVaso(); ctx.clip();
  let hLiq = 0;
  if (EXP.sep && EXP.paso >= 6 && EXP.paso <= 7) {
    const cs = capas(EXP.sep, P), cl = claridad(EXP.sep);
    let base = vBot;
    cs.forEach((c, k) => {
      const hpx = c.V / area * pxcm;
      const esPolar = c.nombre === 'polar';
      const col = esPolar ? mezclaRGB(COL.glic, COL.meoh, composicionMasica(c.n, P).MeOH / 100 * 0.8) : mezclaRGB(rgb2arr(P), COL.fame, rendimientoFAME(EXP.y, EXP.TG0));
      degradadoVertical(ctx, vx, base - hpx, vw, hpx + 1, col);
      if (!esPolar) {
        const turb = Math.min(0.75, 0.6 * (1 - cl) + 0.6 * EXP.sep.fEm);
        const grd = ctx.createLinearGradient(0, base, 0, base - hpx);
        grd.addColorStop(0, rgb([205, 180, 135], turb)); grd.addColorStop(Math.min(1, 0.25 + 0.75 * (1 - cl)), rgb([220, 200, 155], turb * 0.5)); grd.addColorStop(1, rgb([235, 220, 175], 0));
        ctx.fillStyle = grd; ctx.fillRect(vx, base - hpx, vw, hpx);
      }
      if (k === 0 && cs[1].V > 0 && hpx > 0.5) {
        ctx.strokeStyle = cl > 0.8 ? 'rgba(19,34,48,0.85)' : 'rgba(60,60,60,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash(cl > 0.8 ? [] : [5, 4]);
        ctx.beginPath(); ctx.moveTo(vx, base - hpx); ctx.lineTo(vx + vw, base - hpx); ctx.stroke(); ctx.setLineDash([]);
      }
      base -= hpx;
    });
    hLiq = vBot - base;
    if (hLiq > 1) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(vx, base, vw, 1.5); }
  } else if (EXP.prod && EXP.paso >= 8) {
    const hpx = volumen(EXP.prod, P, 50 + K0) / area * pxcm;
    const w = composicionMasica(EXP.prod, P);
    degradadoVertical(ctx, vx, vBot - hpx, vw, hpx + 1, mezclaRGB(rgb2arr(P), COL.fame, w.FAME / 100));
    if (w.W > 0.1 || w.JABON > 0.05) { ctx.fillStyle = 'rgba(235,235,225,0.35)'; ctx.fillRect(vx, vBot - hpx, vw, hpx); }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(vx, vBot - hpx, vw, 1.5);
    hLiq = hpx;
  } else if (y) {
    const V = volumen(y, P, y[IDX.T]);
    const hpx = V / area * pxcm;
    const tr = P.cfg.transferencia;
    const etaRpm = 1 - Math.exp(-Math.pow(rpm / tr.rpm_c, tr.n));
    const x = fraccionFAME(y), phi = Math.pow(x, tr.p) / (Math.pow(x, tr.p) + Math.pow(tr.x_medio, tr.p));
    const VMeOH = y[IDX.MEOH] * P.mw[IDX.MEOH] / P.rho[IDX.MEOH];
    const separada = (1 - phi) * (1 - etaRpm) * (1 - y[IDX.IND] * etaRpm);
    const hMeOH = Math.max(0, separada) * VMeOH / area * pxcm;
    const dV = Math.min(hpx * 0.35, pxcm * 3.2 * Math.pow(rpm / 1000, 2));
    const colLiq = mezclaRGB(rgb2arr(P), COL.fame, rendimientoFAME(y, EXP.TG0));
    const sup = (xx, h) => vBot - h - dV * (0.5 - Math.pow((xx - cx) / (vw / 2), 2));
    const gl = ctx.createLinearGradient(0, vBot - hpx, 0, vBot);
    gl.addColorStop(0, rgb(aclarar(colLiq, 0.2))); gl.addColorStop(1, rgb(sombra(colLiq, 0.84)));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.moveTo(vx, vBot);
    for (let i = 0; i <= 40; i++) { const xx = vx + vw * i / 40; ctx.lineTo(xx, sup(xx, hpx - hMeOH)); }
    ctx.lineTo(vx + vw, vBot); ctx.closePath(); ctx.fill();
    // brillo de la superficie libre
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let i = 0; i <= 40; i++) { const xx = vx + vw * i / 40; i ? ctx.lineTo(xx, sup(xx, hpx - hMeOH)) : ctx.moveTo(xx, sup(xx, hpx - hMeOH)); } ctx.stroke();
    if (hMeOH > 0.5) {
      ctx.fillStyle = rgb(COL.meoh, 0.92);
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const xx = vx + vw * i / 40; ctx.lineTo(xx, sup(xx, hpx)); }
      for (let i = 40; i >= 0; i--) { const xx = vx + vw * i / 40; ctx.lineTo(xx, sup(xx, hpx - hMeOH)); }
      ctx.closePath(); ctx.fill();
    }
    const disperso = y[IDX.MEOH] > 1e-6 ? (1 - phi) * etaRpm * Math.min(1, y[IDX.IND] + 0.2) : 0;
    if (disperso > 0.02) { ctx.fillStyle = `rgba(255,255,255,${0.32 * disperso})`; ctx.fillRect(vx, vBot - hpx - dV, vw, hpx + dV); }
    const nG = Math.round(ANIM.gotas.length * Math.min(1, disperso * 1.2));
    const omega = rpm / 60 * 2 * Math.PI * 0.12;
    for (let i = 0; i < ANIM.gotas.length; i++) {
      const gt = ANIM.gotas[i];
      gt.ph += omega * gt.w * dtReal;
      gt.z += (Math.sin(gt.ph * 0.7 + i) * 0.15) * dtReal * (rpm / 600);
      if (gt.z < 0.03) gt.z = 0.97; if (gt.z > 0.97) gt.z = 0.03;
      if (i >= nG) continue;
      const gx = cx + Math.sin(gt.ph) * gt.r * vw * 0.45, gy = vBot - gt.z * (hpx - hMeOH - dV) - 3;
      const gg = ctx.createRadialGradient(gx - gt.s * 0.35, gy - gt.s * 0.35, 0.3, gx, gy, gt.s);
      gg.addColorStop(0, 'rgba(255,255,255,0.98)'); gg.addColorStop(1, 'rgba(200,220,236,0.75)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, gt.s, 0, 6.283); ctx.fill();
    }
    if (Tc > 62 && y[IDX.MEOH] > 1e-3) {
      const intens = Math.min(1, (Tc - 62) / 4);
      if (Math.random() < intens * dtReal * 40) ANIM.burbujas.push({ x: vx + 8 + Math.random() * (vw - 16), y: vBot - 4, v: 25 + Math.random() * 30 });
    }
    hLiq = hpx;
  }
  ANIM.burbujas = ANIM.burbujas.filter(b => { b.y -= b.v * dtReal; return b.y > vBot - hLiq; });
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.2;
  for (const b of ANIM.burbujas) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 6.283); ctx.stroke(); }
  // Sombreado cilíndrico del contenido y brillos del vidrio
  sombreadoCilindrico(ctx, vx, vTop, vw, vH, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fillRect(vx + vw * 0.08, vTop, vw * 0.045, vH);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(vx + vw * 0.15, vTop, vw * 0.015, vH);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(vx + vw * 0.86, vTop, vw * 0.02, vH);
  ctx.restore();
  // Contorno del vidrio
  caminoVaso(); ctx.strokeStyle = COL.vidrio; ctx.lineWidth = 2.5; ctx.stroke();

  // --- Escala de nivel ---
  ctx.font = '500 ' + Math.max(9, fl - 3) + 'px ' + FUENTE_CV; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let ml = 100; ml <= g.volumen_mL; ml += 100) {
    const yy = vBot - ml / area * pxcm; if (yy < vTop + 6) break;
    const largo = ml % 200 === 0 ? 10 : 5;
    ctx.strokeStyle = 'rgba(63,78,92,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(vx + vw - largo, yy); ctx.lineTo(vx + vw, yy); ctx.stroke();
    if (ml % 200 === 0) { ctx.fillStyle = 'rgba(19,34,48,0.75)'; ctx.fillText(String(ml), vx + vw - 13, yy); }
  }
  ctx.fillStyle = 'rgba(19,34,48,0.6)'; ctx.fillText('mL', vx + vw - 13, vBot - 100 / area * pxcm);

  // --- Tapa, motor y agitador ---
  acero(ctx, vx - jk - 8, vTop - 10, vw + 2 * jk + 16, 12, 4, true);
  ctx.fillStyle = COL.acero3; for (const bx of [vx - jk, vx + vw + jk - 4]) { ctx.beginPath(); ctx.arc(bx + 2, vTop - 4, 2.2, 0, 6.283); ctx.fill(); }
  const mW = Math.max(62, vw * 0.36), mH = Math.max(46, H * 0.085), mY = vTop - 14 - mH;
  acero(ctx, cx - 9, vTop - 16, 18, 8, 2, false);
  ctx.save(); ctx.shadowColor = 'rgba(16,32,48,0.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  const gm = ctx.createLinearGradient(cx - mW / 2, 0, cx + mW / 2, 0);
  gm.addColorStop(0, '#2b3a47'); gm.addColorStop(0.4, '#4a5b6a'); gm.addColorStop(1, '#22303c');
  ctx.fillStyle = gm; ctx.beginPath(); ctx.roundRect(cx - mW / 2, mY, mW, mH, 9); ctx.fill(); ctx.restore();
  // display LCD
  const lw = mW - 14, lh = Math.min(22, mH * 0.48);
  ctx.fillStyle = '#0b1722'; ctx.beginPath(); ctx.roundRect(cx - lw / 2, mY + 7, lw, lh, 4); ctx.fill();
  ctx.fillStyle = rpm > 0 ? '#7ee3a6' : '#5f8a74'; ctx.font = '700 ' + Math.min(13, lh * 0.62) + 'px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(EXP.u.rpm) + ' rpm', cx, mY + 7 + lh / 2 + 0.5);
  ctx.fillStyle = rpm > 0 ? '#1fd174' : '#4b5b68'; ctx.beginPath(); ctx.arc(cx - mW / 2 + 9, mY + mH - 9, 3, 0, 6.283); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) { const xx = cx - 12 + k * 8; ctx.beginPath(); ctx.moveTo(xx, mY + mH - 13); ctx.lineTo(xx, mY + mH - 5); ctx.stroke(); }
  // eje e impulsor
  const yImp = vBot - vH * 0.17;
  const ge = ctx.createLinearGradient(cx - 3, 0, cx + 3, 0); ge.addColorStop(0, COL.acero3); ge.addColorStop(0.5, COL.acero1); ge.addColorStop(1, COL.acero3);
  ctx.fillStyle = ge; ctx.fillRect(cx - 2.5, vTop - 8, 5, yImp - vTop + 8);
  ANIM.ang += Math.min(rpm, 600) / 60 * 2 * Math.PI * 0.25 * dtReal;
  const larg = vw * 0.22;
  const palas = [0, 1, 2, 3].map(k => ANIM.ang + k * Math.PI / 2).sort((a, b) => Math.sin(a) - Math.sin(b));
  for (const a of palas) {
    const wpx = larg * Math.cos(a), frente = Math.sin(a) > 0;
    const gp = ctx.createLinearGradient(0, yImp - 8, 0, yImp + 8);
    gp.addColorStop(0, frente ? '#c9d2da' : '#7d8a95'); gp.addColorStop(1, frente ? '#6f7d89' : '#4c5964');
    ctx.fillStyle = gp; ctx.beginPath(); ctx.roundRect(Math.min(cx, cx + wpx), yImp - 8, Math.abs(wpx), 16, 2); ctx.fill();
  }
  ctx.fillStyle = COL.acero3; ctx.beginPath(); ctx.ellipse(cx, yImp, 9, 4, 0, 0, 6.283); ctx.fill();
  if (rpm > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.6, rpm / 1200)})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cx, yImp, larg + 4, 9, 0, 0.15, Math.PI - 0.15); ctx.stroke();
  }

  // --- Sonda de temperatura ---
  const sx = vx + vw * 0.2;
  ctx.fillStyle = COL.acero3; ctx.fillRect(sx - 1.5, vTop - 22, 3, vH * 0.62 + 22);
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(sx, vTop + vH * 0.62, 3.5, 0, 6.283); ctx.fill();
  acero(ctx, sx - 5, vTop - 26, 10, 8, 2, false);

  // --- Bureta de metóxido ---
  const tw = Math.max(26, W * 0.07), tx = Math.min(W - tw - 12, vx + vw + jk + W * 0.08), tTop = H * 0.04, tH = H * 0.2;
  const mTq = y ? y[IDX.TQ_MEOH] * CONFIG.M.MeOH + y[IDX.TQ_B] * CONFIG.M.NaOH : (EXP.metoxido ? EXP.metoxido.m_meoh + EXP.metoxido.m_naoh : 0);
  const fTq = EXP.tanque0_g > 0 ? mTq / EXP.tanque0_g : (EXP.metoxido ? 1 : 0);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.roundRect(tx, tTop, tw, tH, [6, 6, 10, 10]); ctx.fill();
  if (fTq > 0) {
    const hq = (tH - 6) * fTq, gq = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    gq.addColorStop(0, '#b9d6ec'); gq.addColorStop(0.4, '#e6f1fa'); gq.addColorStop(1, '#a8c9e2');
    ctx.fillStyle = gq; ctx.beginPath(); ctx.roundRect(tx + 3, tTop + tH - 3 - hq, tw - 6, hq, [2, 2, 8, 8]); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(63,78,92,0.45)'; ctx.lineWidth = 1;
  for (let k = 1; k < 5; k++) { const yy = tTop + tH * k / 5; ctx.beginPath(); ctx.moveTo(tx + tw - 8, yy); ctx.lineTo(tx + tw, yy); ctx.stroke(); }
  ctx.strokeStyle = COL.vidrio; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(tx, tTop, tw, tH, [6, 6, 10, 10]); ctx.stroke();
  // llave y tubo hasta la tapa
  const llaveY = tTop + tH + 8;
  ctx.fillStyle = (EXP.dosificando && !PAUSADO) ? '#1a7a44' : COL.acero3;
  ctx.beginPath(); ctx.roundRect(tx + tw / 2 - 9, llaveY - 4, 18, 8, 3); ctx.fill();
  ctx.strokeStyle = COL.vidrio; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  const entX = vx + vw - vw * 0.12;
  ctx.beginPath(); ctx.moveTo(tx + tw / 2, tTop + tH); ctx.lineTo(tx + tw / 2, llaveY + 10);
  ctx.quadraticCurveTo(tx + tw / 2, vTop - 26, entX + 12, vTop - 26); ctx.lineTo(entX, vTop - 26); ctx.lineTo(entX, vTop + 8); ctx.stroke();
  if (EXP.dosificando && EXP.modoDosis === 'gradual' && EXP.corriendo && !PAUSADO) {
    const caida = Math.max(10, vBot - hLiq - vTop - 10);
    for (let k = 0; k < 2; k++) {
      const yy = vTop + 10 + ((t_s * 140 + k * caida / 2) % caida);
      ctx.fillStyle = '#7fb2d8'; ctx.beginPath(); ctx.ellipse(entX, yy, 2.6, 3.6, 0, 0, 6.283); ctx.fill();
    }
  }
  ctx.fillStyle = COL.tinta2; ctx.font = '600 ' + (fl - 1.5) + 'px ' + FUENTE_CV; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(t('cv_metoxido'), tx + tw / 2, tTop + tH + 30);
  if (mTq > 0) { ctx.fillStyle = COL.muted; ctx.font = '500 ' + (fl - 2) + 'px ' + FUENTE_CV; ctx.fillText(fmt(mTq, 0) + ' g', tx + tw / 2, tTop + tH + 30 + fl); }

  // --- Válvula de fondo y vaso de recogida ---
  const vlvY = jBot + 8;
  acero(ctx, cx - 4, vBot - 2, 8, vlvY - vBot + 14, 2, false);
  ctx.save(); ctx.translate(cx, vlvY + 4);
  ctx.fillStyle = EXP.valvula ? '#1a7a44' : '#4a5b6a'; ctx.beginPath(); ctx.roundRect(-11, -7, 22, 14, 4); ctx.fill();
  ctx.rotate(EXP.valvula ? Math.PI / 2 : 0);
  ctx.fillStyle = EXP.valvula ? '#1a7a44' : '#c0392b'; ctx.beginPath(); ctx.roundRect(-17, -11, 34, 4.5, 2); ctx.fill();
  ctx.restore();
  if (EXP.sep) {
    const P2 = P, Vd = volumen(EXP.sep.drenado, P2, EXP.sep.T);
    const bw = Math.max(64, W * 0.17), bx = cx - bw / 2 + W * 0.1, bTop = vlvY + 26, bH = Math.max(24, H - bTop - 10);
    const colD = mezclaRGB(COL.glic, rgb2arr(P2), fraccionLigeraDrenaje());
    // tubo de salida hacia el vaso
    ctx.strokeStyle = COL.vidrio; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, vlvY + 14); ctx.lineTo(cx, vlvY + 18); ctx.lineTo(bx + bw / 2, vlvY + 18); ctx.lineTo(bx + bw / 2, bTop - 2); ctx.stroke();
    if (EXP.valvula) {
      ctx.strokeStyle = rgb(colD); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx + bw / 2, bTop - 2); ctx.lineTo(bx + bw / 2, bTop + bH - 3); ctx.stroke();
    }
    const capVaso = 400, hb = Math.min(1, Vd / capVaso) * (bH - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.roundRect(bx, bTop, bw, bH, [0, 0, 6, 6]); ctx.fill();
    if (hb > 0) { degradadoVertical(ctx, bx + 2, bTop + bH - 2 - hb, bw - 4, hb, colD); }
    ctx.strokeStyle = COL.vidrio; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 3, bTop); ctx.lineTo(bx, bTop + 2); ctx.lineTo(bx, bTop + bH - 6);
    ctx.quadraticCurveTo(bx, bTop + bH, bx + 6, bTop + bH); ctx.lineTo(bx + bw - 6, bTop + bH); ctx.quadraticCurveTo(bx + bw, bTop + bH, bx + bw, bTop + bH - 6); ctx.lineTo(bx + bw, bTop + 2); ctx.lineTo(bx + bw + 3, bTop); ctx.stroke();
    etiqueta(ctx, t('cv_drenado') + ' ' + fmt(Vd, 0) + ' mL', bx + bw + 8, bTop + bH / 2, { size: fl - 1.5, punto: rgb(colD) });
  }

  // --- Etiquetas de proceso ---
  if (y) {
    const e = CONFIG.energia;
    const cT = Tc >= e.T_eb_MeOH_C ? '#a3221a' : Tc > e.T_aviso_C ? '#7a4f00' : COL.tinta;
    etiqueta(ctx, t('Treactor') + '  ' + fmt(Tc, 1) + ' °C', 12, vTop - H * 0.065, { bold: true, size: fl + 1.5, color: cT, punto: rgb(colorTemp(Tc)),
      borde: Tc > e.T_aviso_C ? cT : null, guia: [sx, vTop + vH * 0.3] });
    const parado = EXP.paso >= 6;
    const yj = jTop + vH * 0.3;
    etiqueta(ctx, t('Tcamisa') + '  ' + fmt(Tjc, 1) + ' °C', 12, yj, { bold: true, size: fl, punto: rgb(cJ), guia: [vx - jk / 2, yj + 4] });
    etiqueta(ctx, 'P  ' + fmt(parado ? 0 : vel.Pcal, 0) + ' W', 12, yj + fl * 2.3, { size: fl - 1, color: COL.tinta2 });
    etiqueta(ctx, 'Q → ' + fmt(parado ? 0 : vel.Qj, 0) + ' W', 12, yj + fl * 4.4, { size: fl - 1, color: COL.tinta2 });
  } else {
    etiqueta(ctx, t('cv_vacio'), cx, vTop + vH * 0.42, { size: fl + 1, align: 'center', color: COL.tinta2 });
  }
}
function rgb2arr(P) { return P ? CONFIG.aceites[P.clave].color : [236, 200, 70]; }
function fraccionLigeraDrenaje() {
  const d = EXP.sep.drenado, P = EXP.P; const m = masaReactor(d, P);
  if (m <= 0) return 0;
  return (d[IDX.FAME] * P.mw[IDX.FAME] + d[IDX.TG] * P.mw[IDX.TG] + d[IDX.DG] * P.mw[IDX.DG]) / m;
}

/* =====================================================================
 * RENDER — gráficas propias (Canvas 2D) con leyenda, etiquetas directas y tooltip
 * ===================================================================== */
const DASH = { solido: [], guion: [7, 4], punto: [2, 3], guionPunto: [8, 3, 2, 3], largo: [12, 4] };
let graficasSucias = true;
class Grafica {
  constructor(id, opts) {
    this.cv = document.getElementById(id); this.ctx = this.cv.getContext('2d');
    this.tip = this.cv.parentElement.querySelector('.tip'); this.opts = opts; this.series = []; this.hx = null;
    this.cv.addEventListener('pointermove', e => { const r = this.cv.getBoundingClientRect(); this.hx = e.clientX - r.left; this.dibujar(); });
    this.cv.addEventListener('pointerleave', () => { this.hx = null; this.tip.hidden = true; this.dibujar(); });
  }
  dibujar() {
    if (!ajustarCanvas(this.cv, this)) return;
    const ctx = this.ctx, w = this.w, h = this.h, o = this.opts;
    const L = 44, Rm = 64, T = 10, B = 34, pw = w - L - Rm, ph = h - T - B;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    let xmin = Infinity, xmax = -Infinity, ymin = o.yMin, ymax = o.yMax;
    for (const s of this.series) for (const p of s.pts) {
      if (p[0] < xmin) xmin = p[0]; if (p[0] > xmax) xmax = p[0];
      if (o.autoY) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
    }
    if (!Number.isFinite(xmin)) { xmin = 0; xmax = 10; }
    xmin = Math.min(xmin, 0); xmax = Math.max(xmax, xmin + 10);
    if (o.autoY) { ymin = Math.floor((ymin - 2) / 5) * 5; ymax = Math.ceil((ymax + 2) / 5) * 5; }
    const X = v => L + (v - xmin) / (xmax - xmin) * pw, Y = v => T + ph - (v - ymin) / (ymax - ymin) * ph;
    this.esc = { X, xmin, xmax, L, pw };
    // Rejilla y ejes (recesivos)
    ctx.font = '11px ' + FUENTE_CV; ctx.fillStyle = '#677585'; ctx.strokeStyle = '#e6ebf0'; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of marcas(ymin, ymax, 5)) { const yy = Y(v); ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke(); ctx.fillText(fmt(v, 0), L - 6, yy); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of marcas(xmin, xmax, 6)) { const xx = X(v); ctx.beginPath(); ctx.moveTo(xx, T); ctx.lineTo(xx, T + ph); ctx.stroke(); ctx.fillText(fmt(v, 0), xx, T + ph + 4); }
    if (xmin < 0) { ctx.strokeStyle = '#b4bfca'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(0), T); ctx.lineTo(X(0), T + ph); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = '#b4bfca'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.fillStyle = '#3f4e5c'; ctx.fillText(t('ejeX'), L + pw / 2, T + ph + 18);
    // Series
    ctx.save(); ctx.beginPath(); ctx.rect(L, T - 2, pw, ph + 4); ctx.clip();
    for (const s of this.series) {
      if (s.pts.length < 1) continue;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.ancho || 2; ctx.setLineDash(s.dash || []); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); s.pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.restore();
    // Etiquetas directas al final de cada serie (texto en tinta, muestra de color al lado)
    const ets = this.series.filter(s => s.pts.length && s.etiqueta !== false).map(s => ({ s, y: Y(s.pts[s.pts.length - 1][1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ets.length; i++) if (ets[i].y - ets[i - 1].y < 14) ets[i].y = ets[i - 1].y + 14;
    const desb = ets.length ? Math.max(0, ets[ets.length - 1].y - (T + ph)) : 0;
    ctx.font = '11px ' + FUENTE_CV; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const e of ets) {
      const yy = e.y - desb;
      ctx.strokeStyle = e.s.color; ctx.lineWidth = 2.5; ctx.setLineDash(e.s.dash || []);
      ctx.beginPath(); ctx.moveTo(L + pw + 4, yy); ctx.lineTo(L + pw + 16, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#132230'; ctx.fillText(e.s.corto || e.s.nombre, L + pw + 19, yy);
    }
    // Capa de interacción: cruz + puntos + tooltip
    if (this.hx != null && this.hx >= L && this.hx <= L + pw && this.series.some(s => s.pts.length)) {
      const xv = xmin + (this.hx - L) / pw * (xmax - xmin);
      ctx.strokeStyle = '#3f4e5c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(this.hx, T); ctx.lineTo(this.hx, T + ph); ctx.stroke();
      let html = `<div><strong>t = ${fmt(xv, 1)} ${t('min')}</strong></div>`;
      for (const s of this.series) {
        const p = cercano(s.pts, xv); if (!p || Math.abs(p[0] - xv) > (xmax - xmin) * 0.05) continue;
        ctx.fillStyle = s.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 4.5, 0, 6.283); ctx.fill(); ctx.stroke();
        html += `<div class="r">${muestraSVG(s)}<span>${s.nombre}: <strong>${fmt(p[1], 1)}</strong></span></div>`;
      }
      this.tip.innerHTML = html; this.tip.hidden = false;
      const tw = this.tip.offsetWidth;
      this.tip.style.left = (this.hx + 12 + tw > w ? this.hx - tw - 12 : this.hx + 12) + 'px';
      this.tip.style.top = (T + 4) + 'px';
    }
  }
}
function marcas(a, b, n) {
  const paso0 = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(paso0))), r = paso0 / mag;
  const paso = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(a / paso) * paso; v <= b + 1e-9; v += paso) out.push(Math.abs(v) < 1e-9 ? 0 : v);
  return out;
}
function cercano(pts, x) {
  if (!pts.length) return null;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] < x) lo = m; else hi = m; }
  return Math.abs(pts[lo][0] - x) < Math.abs(pts[hi][0] - x) ? pts[lo] : pts[hi];
}
function muestraSVG(s) {
  const d = (s.dash || []).join(',');
  return `<svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="${s.color}" stroke-width="2.5" ${d ? `stroke-dasharray="${d}"` : ''} stroke-linecap="round"/></svg>`;
}

let GRAF = null;
const COLORES_COMP = ['var(--c2)', 'var(--c3)', 'var(--c4)'];
const COLORES_COMP_HEX = ['#E69F00', '#CC79A7', '#009E73'];
const DASH_COMP = [DASH.guion, DASH.punto, DASH.guionPunto];

function seriesGraficas() {
  const ref = EXP.tDosis != null ? EXP.tDosis : EXP.t;
  const hs = EXP.hist, xs = hs.map(h => (h.t - ref) / 60);
  const ser = (campo) => hs.map((h, i) => [xs[i], h[campo]]);
  const comp = [
    { nombre: 'FAME', color: '#0072B2', dash: DASH.solido, pts: ser('FAME') },
    { nombre: 'TG', color: '#E69F00', dash: DASH.guion, pts: ser('TG') },
    { nombre: 'DG', color: '#CC79A7', dash: DASH.punto, pts: ser('DG') },
    { nombre: 'MG', color: '#009E73', dash: DASH.guionPunto, pts: ser('MG') },
    { nombre: 'GL', color: '#D55E00', dash: DASH.largo, pts: ser('GL') }
  ];
  const temp = [
    { nombre: t('serieT') + ' (' + t('actual') + ')', corto: 'T', color: '#0072B2', dash: DASH.solido, pts: ser('T') },
    { nombre: t('serieTj') + ' (' + t('actual') + ')', corto: 'T cam.', color: '#D55E00', dash: DASH.guion, pts: ser('Tj') }
  ];
  const conv = [
    { nombre: t('serieY') + ' (' + t('actual') + ')', corto: 'FAME', color: '#0072B2', dash: DASH.solido, pts: ser('Y') },
    { nombre: t('serieX') + ' (' + t('actual') + ')', corto: 'X TG', color: '#0072B2', dash: DASH.punto, ancho: 1.5, pts: ser('X') }
  ];
  // Corridas comparadas (color = entidad: se asigna por orden de id, no por posición en la lista)
  [...COMPARAR].sort((a, b) => a - b).forEach((id, k) => {
    const r = REGISTRO.find(z => z.id === id); if (!r) return;
    const nom = t('rCorrida') + ' ' + r.id;
    temp.push({ nombre: nom + ' — ' + t('serieT'), corto: 'R' + r.id, color: COLORES_COMP_HEX[k], dash: DASH_COMP[k], pts: r.hist.map(h => [h.x, h.T]) });
    conv.push({ nombre: nom + ' — ' + t('serieY'), corto: 'R' + r.id, color: COLORES_COMP_HEX[k], dash: DASH_COMP[k], pts: r.hist.map(h => [h.x, h.Y]) });
  });
  return { comp, temp, conv };
}

/* =====================================================================
 * UI — asistente, lecturas, tablas, retos
 * ===================================================================== */
const $ = id => document.getElementById(id);
const UI = {
  pasos() {
    const ol = $('listaPasos'); ol.innerHTML = '';
    for (let i = 0; i < NPASOS; i++) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="num">${i < EXP.paso ? '✓' : i + 1}</span><span class="lbl">${t('paso_' + i)}</span>`;
      li.title = t('paso_' + i);
      if (i < EXP.paso) li.className = 'hecho';
      if (i === EXP.paso) { li.className = 'actual'; li.setAttribute('aria-current', 'step'); }
      ol.appendChild(li);
    }
    $('txtPaso').innerHTML = `<strong>${t('pasoDe', { n: EXP.paso + 1, t: NPASOS })}</strong> · ${t('paso_' + EXP.paso)}`;
    const pct = Math.round(100 * EXP.paso / (NPASOS - 1));
    $('txtPct').textContent = t('completado', { p: pct });
    $('barraPaso').style.width = pct + '%';
    document.querySelectorAll('.paso').forEach(d => { d.hidden = +d.dataset.paso !== EXP.paso; });
  },
  error(id) { $(id).innerHTML = `<div class="aviso bad">${t('errEntrada')}</div>`; },
  dl(filas) { return '<dl>' + filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '</dl>'; },
  avisosHTML(lista) { return lista.map(([n, txt]) => `<div class="aviso ${n}">${txt}</div>`).join(''); },
  tesela(k, v, destacada) { return `<div class="lectura${destacada ? ' destacada' : ''}"><span class="k">${k}</span><span class="v">${v}</span></div>`; },

  /** Contenido vivo del paso actual (forzar = reconstruir aunque no haya cambios). */
  panelPaso(forzar) {
    const p = EXP.paso;
    if (p === 0 || p === 1) { UI.derivMetoxido(); UI.derivAceite(); }
    if (p === 2) UI.derivAgit();
    if (p === 3) {
      const y = EXP.y, ok = puedeDosificar();
      $('btnCalentar').disabled = EXP.corriendo || !EXP.u.camisa;
      $('btnCalentar').textContent = EXP.corriendo ? t('calentando') : t('btnCalentar');
      $('btnADosificar').disabled = !ok;
      $('btnADosificar').className = ok ? 'btn primario' : 'btn';
      $('btnCalentar').className = (EXP.corriendo || !EXP.u.camisa) ? 'btn' : 'btn primario';
      $('estadoCal').innerHTML = UI.dl([[t('Treactor'), fmt(y[IDX.T] - K0, 1) + ' °C'], [t('Tcamisa'), fmt(y[IDX.TJ] - K0, 1) + ' °C'],
        [t('objetivo'), EXP.u.camisa ? fmt(EXP.u.Tset - K0, 0) + ' °C' : '—']]) +
        UI.avisosHTML([ok ? ['ok', t('alcanzada')] : ['info', t('falta')]].concat(EXP.u.camisa ? [] : [['warn', t('avCamisaOff')]]));
    }
    if (p === 4) {
      const modo = document.querySelector('input[name="dosis"]:checked').value, q = parseFloat($('inCaudal').value);
      $('inCaudal').disabled = modo === 'golpe';
      const m = EXP.tanque0_g;
      $('derivDosis').innerHTML = UI.dl([[t('masaMetoxido'), fmt(m, 1) + ' g'], [t('tDosis'), modo === 'golpe' ? '≈ 0 min' : (q > 0 ? fmt(m / q, 1) + ' min' : '—')]]);
    }
    if (p === 5) {
      const y = EXP.y, P = EXP.P, v = velocidades(y, EXP.u, P);
      const Vl = v.V_L, Bpct = y[IDX.B] * CONFIG.M.NaOH / EXP.aceite.m_aceite * 100;
      $('estadoReac').innerHTML = UI.dl([[t('tReac'), fmt((EXP.t - EXP.tDosis) / 60, 1) + ' min'], [t('convTG'), fmt(100 * conversionTG(y, EXP.TG0), 1) + ' %'],
        [t('rendFAME'), fmt(100 * rendimientoFAME(y, EXP.TG0), 1) + ' %'], [t('catActivo'), fmt(Bpct, 2) + ' % (' + fmt(y[IDX.B] / Vl, 3) + ' mol/L)'],
        [t('tanque'), fmt(y[IDX.TQ_MEOH] * CONFIG.M.MeOH + y[IDX.TQ_B] * CONFIG.M.NaOH, 1) + ' g']]);
    }
    if (p === 6 || p === 7) {
      const s = EXP.sep, P = EXP.P, cs = capas(s, P), A = Math.PI * Math.pow(CONFIG.reactor.diametro_cm / 2, 2);
      const filas = [[t('tSed'), fmt(EXP.tSed / 60, 1) + ' min'], [t('claridad'), fmt(100 * claridad(s), 0) + ' %'],
        [t('tauSep'), fmt(s.tau / 60, 1) + ' min'], [t('fEm'), fmt(100 * s.fEm, 1) + ' %'], [t('hInter'), fmt(cs[0].V / A, 2) + ' cm']];
      if (p === 6) $('estadoSed').innerHTML = UI.dl(filas);
      else {
        const d = s.drenado, Vd = volumen(d, P, s.T);
        const bio = d[IDX.FAME] * P.mw[IDX.FAME] + d[IDX.TG] * P.mw[IDX.TG] + d[IDX.DG] * P.mw[IDX.DG];
        $('estadoDec').innerHTML = UI.dl([[t('drenado'), fmt(Vd, 1) + ' mL'], [t('masaDrenada'), fmt(masaReactor(d, P), 1) + ' g'],
          [t('glicDrenada'), fmt(d[IDX.GL] * P.mw[IDX.GL], 1) + ' g'], [t('bioPerdido'), fmt(bio, 1) + ' g'],
          [t('faseInfRest'), fmt(cs[0].nombre === 'polar' ? cs[0].V : 0, 1) + ' mL'], [t('claridad'), fmt(100 * claridad(s), 0) + ' %']]);
        const b = $('btnValvula'); b.textContent = EXP.valvula ? t('cerrarValvula') : t('abrirValvula'); b.setAttribute('aria-pressed', EXP.valvula ? 'true' : 'false');
      }
    }
    if (p === 8) {
      const q = calidad(EXP.prod, EXP.P);
      $('estadoLav').innerHTML = UI.dl([[t('lavados'), EXP.nLavados], [t('secados'), EXP.nSecados], [t('masaProd'), fmt(q.masa, 1) + ' g'],
        [t('metanolProd'), fmt(q.metanol, 2) + ' %'], [t('aguaProd'), fmt(q.agua, 0) + ' mg/kg'], [t('glProd'), fmt(q.GLlibre, 3) + ' %'], [t('jabonProd'), fmt(q.jabon, 3) + ' %']]);
    }
    if (p === 9 && forzar) UI.calidad();
  },

  derivMetoxido() {
    const m = parseFloat($('inMeOH').value), n = parseFloat($('inNaOH').value);
    const ac = $('selAceite').value, mA = parseFloat($('inAceite').value), agl = parseFloat($('inAGL').value) || 0, hum = parseFloat($('inHum').value) || 0;
    if (![m, n, mA].every(Number.isFinite)) { UI.error('derivMetoxido'); return; }
    const P = propsAceite(ac), nTG = mA * (1 - (agl + hum) / 100) / P.mw[IDX.TG];
    const rel = (m / CONFIG.M.MeOH) / nTG, cat = 100 * n / mA;
    const av = [];
    if (rel < 4.5) av.push(['warn', t('avRelBaja')]); if (rel > 12) av.push(['warn', t('avRelAlta')]);
    if (cat < 0.3) av.push(['warn', t('avCatBajo')]); if (cat > 1.5) av.push(['warn', t('avCatAlto')]);
    $('derivMetoxido').innerHTML = UI.dl([[t('relMolar'), fmt(rel, 1) + ' : 1'], [t('catPct'), fmt(cat, 2) + ' % m/m'], [t('volMeOH'), fmt(m / 0.792, 0) + ' mL']]) +
      `<p class="nota-calc">${t('refAceite', { m: fmt(mA, 0), a: t('ac_' + ac).toLowerCase() })}</p>` + UI.avisosHTML(av);
  },
  derivAceite() {
    const ac = $('selAceite').value, mA = parseFloat($('inAceite').value), agl = parseFloat($('inAGL').value), hum = parseFloat($('inHum').value);
    if (![mA, agl, hum].every(Number.isFinite)) { UI.error('derivAceite'); return; }
    const P = propsAceite(ac), nTG = mA * (1 - (agl + hum) / 100) / P.mw[IDX.TG];
    const naohAGL = mA * agl / 100 / P.mw[IDX.AGL] * CONFIG.M.NaOH;
    const mN = EXP.metoxido ? EXP.metoxido.m_naoh : parseFloat($('inNaOH').value);
    const efec = 100 * (mN - naohAGL) / mA;
    const q = calidad((() => { const v = vec(); v[IDX.FAME] = 1; return v; })(), P);
    const av = [];
    if (agl > 1) av.push(['warn', t('avAGL')]); if (hum > 0.1) av.push(['warn', t('avHum')]);
    if (efec < 0.1) av.push(['bad', t('avCatAgotado')]);
    $('derivAceite').innerHTML = UI.dl([[t('MTG'), fmt(P.mw[IDX.TG], 1) + ' g/mol'], [t('nTG'), fmt(nTG, 3) + ' mol'],
      [t('naohAGL'), fmt(naohAGL, 2) + ' g'], [t('catEfectivo'), fmt(Math.max(0, efec), 2) + ' % m/m'], [t('yodoAceite'), fmt(q.yodo, 0) + ' g I₂/100 g']]) + UI.avisosHTML(av);
  },
  derivAgit() {
    const tr = CONFIG.transferencia, rpm = EXP.u.rpm;
    const etaRpm = 1 - Math.exp(-Math.pow(rpm / tr.rpm_c, tr.n));
    const av = [];
    const Ts = EXP.u.Tset - K0;
    if (!EXP.u.camisa) av.push(['warn', t('avCamisaOff')]);
    else if (Ts >= CONFIG.energia.T_eb_MeOH_C) av.push(['bad', t('avTeb')]);
    else if (Ts > CONFIG.energia.T_aviso_C) av.push(['warn', t('avT60')]);
    if (rpm < 50) av.push(['bad', t('avRpm0')]);
    $('derivAgit').innerHTML = UI.dl([[t('agitacion'), fmt(rpm, 0) + ' rpm'], [t('etaRpm'), fmt(etaRpm, 2)], [t('tauInd'), '≈ ' + fmt(tauInduccion(rpm, EXP.P || propsAceite('soja')) / 60, 1) + ' min'],
      [t('consigna'), EXP.u.camisa ? fmt(Ts, 0) + ' °C' : '—']]) + UI.avisosHTML(av);
  },

  lecturas() {
    const y = EXP.y, cont = $('lecturas');
    if (!y) { cont.innerHTML = ''; $('avisos').innerHTML = ''; return; }
    const P = EXP.P, v = velocidades(y, EXP.u, P), parado = EXP.paso >= 6;
    const items = [
      [t('tReac'), EXP.tDosis != null ? fmt(((EXP.tFinReac != null ? EXP.tFinReac : EXP.t) - EXP.tDosis) / 60, 1) + ' min' : '—', true],
      [t('rendFAME'), fmt(100 * rendimientoFAME(y, EXP.TG0), 1) + ' %', true], [t('convTG'), fmt(100 * conversionTG(y, EXP.TG0), 1) + ' %', true],
      [t('Treactor'), fmt(y[IDX.T] - K0, 1) + ' °C'], [t('Tcamisa'), fmt(y[IDX.TJ] - K0, 1) + ' °C'],
      [t('potencia'), fmt(parado ? 0 : v.Pcal, 0) + ' W'], [t('calorReactor'), fmt(parado ? 0 : v.Qj, 0) + ' W'],
      [t('eta').replace('η', '<span style="text-transform:none">η</span>'), parado ? '—' : fmt(eficiencia(y, EXP.u.rpm, P), 2)], [t('jabon'), fmt(y[IDX.JABON] * P.mw[IDX.JABON], 1) + ' g'],
      [t('meohEv'), fmt(y[IDX.MEOH_EV] * CONFIG.M.MeOH, 1) + ' g']
    ];
    cont.innerHTML = items.map(([k, val, d]) => UI.tesela(k, val, d)).join('');
    const av = avisosActuales();
    const html = UI.avisosHTML(av);
    if ($('avisos').dataset.html !== html) { $('avisos').innerHTML = html; $('avisos').dataset.html = html; }
    REACTOR.cv.setAttribute('aria-label', `${t('reactor')}: ${t('Treactor')} ${fmt(y[IDX.T] - K0, 1)} °C, ${t('Tcamisa')} ${fmt(y[IDX.TJ] - K0, 1)} °C, ${t('rendFAME')} ${fmt(100 * rendimientoFAME(y, EXP.TG0), 1)} %`);
  },

  calidad() {
    const q = EXP.calidad; if (!q) return;
    const norma = $('selNorma').value, ev = evaluarNorma(q, norma);
    const dec = { esteres: 2, densidad: 1, viscosidad: 2, inflamacion: 0, agua: 0, acidez: 2, metanol: 3, MG: 3, DG: 3, TG: 3, GLlibre: 4, GLtotal: 3, NaK: 1, yodo: 1, cetano: 1, estabilidad: 1, cfpp: 1 };
    const lim = l => !l ? '—' : (l[0] != null && l[1] != null) ? `${fmt(l[0], dec0(l[0]))} – ${fmt(l[1], dec0(l[1]))}` : l[0] != null ? `≥ ${fmt(l[0], dec0(l[0]))}` : `≤ ${fmt(l[1], dec0(l[1]))}`;
    let html = `<caption>${t('avisoNorma')}</caption>
      <thead><tr><th scope="col">${t('thParam')}</th><th scope="col">${t('thUnidad')}</th><th scope="col" class="num">${t('thLimite')}</th><th scope="col" class="num">${t('thValor')}</th><th scope="col">${t('thEstado')}</th></tr></thead><tbody>`;
    for (const r of ev) {
      const est = r.ok === null ? `<span class="chip neutro">${t('sinLimite')}</span>` : r.ok ? `<span class="chip ok">${t('cumple')}</span>` : `<span class="chip bad">${t('noCumple')}</span>`;
      html += `<tr><th scope="row">${t('q_' + r.clave)}${r.estimado ? `<span class="est">${t('estimado')}</span>` : ''}</th><td>${r.unidad}</td><td class="num">${lim(r.lim)}</td><td class="num">${fmt(r.valor, dec[r.clave])}</td><td>${est}</td></tr>`;
    }
    $('tablaCalidad').innerHTML = html + '</tbody>';
    const conLim = ev.filter(r => r.ok !== null);
    const rend = 100 * EXP.prod[IDX.FAME] * EXP.P.mw[IDX.FAME] / EXP.aceite.m_aceite;
    const nOk = conLim.filter(r => r.ok).length;
    $('resumenRes').innerHTML = UI.tesela(t('cumplen'), `${nOk} / ${conLim.length}<div class="medidor"><span style="width:${100 * nOk / Math.max(1, conLim.length)}%"></span></div>`, true) +
      UI.tesela(t('q_esteres'), fmt(q.esteres, 1) + ' %') + UI.tesela(t('rendimiento'), fmt(rend, 1) + ' %') +
      UI.tesela(t('masaProd'), fmt(q.masa, 0) + ' g') + UI.tesela(t('lavados'), EXP.nLavados);
    $('btnGuardar').disabled = EXP.guardado;
    $('btnGuardar').textContent = EXP.guardado ? t('guardado') : t('btnGuardar');
  },

  registro() {
    const tb = $('tablaReg');
    if (!REGISTRO.length) { tb.innerHTML = `<tbody><tr><td class="tabla-vacia">${t('regVacio')}</td></tr></tbody>`; return; }
    let html = `<thead><tr><th scope="col">${t('rComp')}</th><th scope="col">${t('rCorrida')}</th><th scope="col">${t('rAceite')}</th><th class="num">${t('rRel')}</th><th class="num">${t('rCat')}</th>
      <th class="num">${t('rT')}</th><th class="num">${t('rRpm')}</th><th class="num">${t('rTreac')}</th><th class="num">${t('rY')}</th><th class="num">${t('rJabon')}</th>
      <th class="num">${t('rProd')}</th><th class="num">${t('rEst')}</th><th class="num">${t('rLav')}</th><th class="num">${t('rCumple')}</th></tr></thead><tbody>`;
    for (const r of REGISTRO) {
      const e = r.entradas, d = r.derivadas, s = r.resultados;
      html += `<tr><td><input type="checkbox" data-comp="${r.id}" ${COMPARAR.has(r.id) ? 'checked' : ''} aria-label="${t('rComp')} ${r.id}"></td>
        <td>${r.id}${r.reto ? ' · ' + t('reto_' + r.reto + '_titulo') : ''}</td><td>${t('ac_' + e.aceite)}</td><td class="num">${fmt(d.relacionMolar, 1)}</td>
        <td class="num">${fmt(d.NaOH_pct, 2)}</td><td class="num">${e.camisa ? fmt(e.Tset_C, 0) : '—'}</td><td class="num">${fmt(e.rpm, 0)}</td>
        <td class="num">${fmt(s.t_reaccion_min, 0)}</td><td class="num">${fmt(s.rendimientoFAME_pct, 1)}</td><td class="num">${fmt(s.jabon_g, 1)}</td>
        <td class="num">${fmt(s.masaProducto_g, 0)}</td><td class="num">${fmt(r.calidad.esteres, 1)}</td><td class="num">${s.lavados}</td><td class="num">${s.cumpleEN}/${s.totalEN}</td></tr>`;
    }
    tb.innerHTML = html + '</tbody>';
  },

  retos() {
    const franjas = ['#D55E00', '#0072B2', '#009E73', '#CC79A7'];
    $('retosLista').innerHTML = CONFIG.retos.map((r, i) => {
      const act = RETO && RETO.id === r.id;
      return `<div class="reto-card${act ? ' activo' : ''}" style="--franja:${franjas[i % franjas.length]}"><span class="reto-num">${i + 1}</span>
        <strong>${t('reto_' + r.id + '_titulo')}</strong><p>${t('reto_' + r.id + '_desc')}</p>
        <button data-reto="${r.id}" class="btn ${act ? 'primario' : ''}">${t('cargarReto')}</button></div>`;
    }).join('');
    const ra = $('retoActivo');
    if (!RETO) { ra.hidden = true; ra.innerHTML = ''; return; }
    ra.hidden = false;
    ra.innerHTML = `<div class="tarjeta-cab"><div><span class="ceja">${t('retoActivo')}</span><h2>${t('reto_' + RETO.id + '_titulo')}</h2>
      <p class="subtitulo">${t('reto_' + RETO.id + '_desc')}</p></div><button class="btn pequeno" id="btnSalirReto">${t('salirReto')}</button></div>
      <h3 style="font-size:1rem">${t('preguntas')}</h3>${t('reto_' + RETO.id + '_preg')}
      <details><summary>${t('verSolucion')}</summary>${t('reto_' + RETO.id + '_sol')}</details>`;
  },

  graficas() {
    if (!GRAF) return;
    const s = seriesGraficas();
    GRAF.comp.series = s.comp; GRAF.temp.series = s.temp; GRAF.conv.series = s.conv;
    for (const [k, idL] of [['comp', 'leyComp'], ['temp', 'leyTemp'], ['conv', 'leyConv']]) {
      const html = GRAF[k].series.map(z => `<span>${muestraSVG(z)}${z.nombre}</span>`).join('');
      if ($(idL).dataset.html !== html) { $(idL).innerHTML = html; $(idL).dataset.html = html; }
      GRAF[k].dibujar();
    }
    graficasSucias = false;
  },

  textos() {
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.title = t('titulo');
    $('btnLang').textContent = LANG === 'es' ? 'EN' : 'ES';
    UI.botonPausa();
    const sel = $('selAceite'), v = sel.value;
    sel.innerHTML = Object.keys(CONFIG.aceites).map(k => `<option value="${k}">${t('ac_' + k)}</option>`).join('');
    sel.value = v || CONFIG.defecto.aceite;
  },

  botonPausa() {
    $('txtPausa').textContent = PAUSADO ? t('reanudar') : t('pausa');
    $('btnPausa').querySelector('use').setAttribute('href', PAUSADO ? '#i-play' : '#i-pausa');
    $('btnPausa').setAttribute('aria-pressed', PAUSADO ? 'true' : 'false');
  },

  /** Chip de estado sobre el lienzo del reactor. */
  chipEstado() {
    const c = $('chipEstado'), p = EXP.paso;
    let clave = 'est_espera', activo = false;
    if (PAUSADO && EXP.y) clave = 'est_pausa';
    else if (p === 3) { clave = EXP.corriendo ? 'est_calentando' : 'est_listo'; activo = EXP.corriendo; }
    else if (p === 5) { clave = EXP.dosificando ? 'est_dosificando' : 'est_reaccion'; activo = true; }
    else if (p === 4) { clave = 'est_calentando'; activo = EXP.corriendo; }
    else if (p === 6) { clave = 'est_sedimentando'; activo = true; }
    else if (p === 7) { clave = 'est_decantando'; activo = true; }
    else if (p === 8) clave = 'est_lavado';
    else if (p === 9) clave = 'est_resultados';
    else if (EXP.y) clave = 'est_listo';
    const txt = t(clave), est = PAUSADO && EXP.y ? 'pausa' : activo ? 'activo' : 'espera';
    if (c.textContent !== txt) c.textContent = txt;
    if (c.dataset.estado !== est) c.dataset.estado = est;
  }
};
/** Pinta la parte recorrida de un deslizador (variable CSS --pct). */
function pintarRango(r) { r.style.setProperty('--pct', (100 * (r.value - r.min) / (r.max - r.min)) + '%'); }
/** Decimales justos para mostrar un límite normativo sin redondearlo (96,5 → 1; 0,02 → 2; 500 → 0). */
function dec0(v) { const s = String(v), i = s.indexOf('.'); return i < 0 ? 0 : Math.min(3, s.length - i - 1); }

/* =====================================================================
 * EXPORTACIÓN — CSV, JSON y PNG
 * ===================================================================== */
function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function csvNum(v, d) {
  if (v == null || !Number.isFinite(v)) return '';
  const s = v.toFixed(d == null ? 4 : d);
  return LANG === 'es' ? s.replace('.', ',') : s;
}
function csv(filas) {
  const sep = LANG === 'es' ? ';' : ',';
  return '﻿' + filas.map(f => f.map(c => { const s = String(c); return /[";,\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(sep)).join('\r\n');
}
function exportarRegistroCSV() {
  const claves = CONFIG.norma.map(n => n.clave);
  const cab = ['id', 'fecha', 'reto', 'aceite', 'm_aceite_g', 'AGL_pct', 'humedad_pct', 'm_metanol_g', 'm_NaOH_g', 'relacion_molar', 'NaOH_pct', 'rpm', 'Tconsigna_C', 'camisa',
    'sin_calentar', 'modo_dosis', 'caudal_g_min', 't_reaccion_min', 'conversion_TG_pct', 'rendimiento_FAME_pct', 'Tmax_C', 'jabon_g', 'metanol_evaporado_g',
    't_sedimentacion_min', 'masa_producto_g', 'rendimiento_masico_pct', 'lavados', 'secados', 'cumple_EN'].concat(claves);
  const filas = [cab];
  for (const r of REGISTRO) {
    const e = r.entradas, d = r.derivadas, s = r.resultados;
    filas.push([r.id, r.fecha, r.reto || '', e.aceite, csvNum(e.m_aceite, 1), csvNum(e.agl, 2), csvNum(e.humedad, 2), csvNum(e.m_meoh, 1), csvNum(e.m_naoh, 2),
      csvNum(d.relacionMolar, 2), csvNum(d.NaOH_pct, 3), e.rpm, csvNum(e.Tset_C, 1), e.camisa ? 1 : 0, e.sinCalentar ? 1 : 0, e.modoDosis, csvNum(e.caudal_g_min, 1),
      csvNum(s.t_reaccion_min, 2), csvNum(s.conversionTG_pct, 2), csvNum(s.rendimientoFAME_pct, 2), csvNum(s.Tmax_C, 2), csvNum(s.jabon_g, 2),
      csvNum(s.metanolEvaporado_g, 2), csvNum(s.t_sedimentacion_min, 1), csvNum(s.masaProducto_g, 1), csvNum(s.rendimientoMasico_pct, 2), s.lavados, s.secados,
      s.cumpleEN + '/' + s.totalEN].concat(claves.map(k => csvNum(r.calidad[k], 4))));
  }
  descargar('registro_biodiesel.csv', csv(filas), 'text/csv;charset=utf-8');
}
function exportarSerieCSV() {
  if (!EXP.hist.length) return;
  const ref = EXP.tDosis != null ? EXP.tDosis : EXP.t;
  const filas = [['t_min', 'T_reactor_C', 'T_camisa_C', 'conversion_TG_pct', 'rendimiento_FAME_pct', 'TG_pct', 'DG_pct', 'MG_pct', 'FAME_pct', 'GL_pct']];
  for (const h of EXP.hist) filas.push([csvNum((h.t - ref) / 60, 3), csvNum(h.T, 2), csvNum(h.Tj, 2), csvNum(h.X, 3), csvNum(h.Y, 3), csvNum(h.TG, 3), csvNum(h.DG, 3), csvNum(h.MG, 3), csvNum(h.FAME, 3), csvNum(h.GL, 3)]);
  descargar('serie_actual.csv', csv(filas), 'text/csv;charset=utf-8');
}
function exportarJSON() {
  descargar('registro_biodiesel.json', JSON.stringify({ version: 1, generado: new Date().toISOString(), nota: t('notaParam'), corridas: REGISTRO }, null, 2), 'application/json');
}
function exportarPNG() {
  const lista = [['gComp', GRAF.comp, 'leyComp'], ['gTemp', GRAF.temp, 'leyTemp'], ['gConv', GRAF.conv, 'leyConv']];
  const ancho = Math.max(...lista.map(l => l[1].cv.width)), dpr = window.devicePixelRatio || 1, cab = Math.round(30 * dpr), ley = Math.round(22 * dpr);
  const alto = lista.reduce((s, l) => s + l[1].cv.height + cab + ley, 0) + Math.round(30 * dpr);
  const c = document.createElement('canvas'); c.width = ancho; c.height = alto;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, ancho, alto);
  let yy = 0;
  for (const [k, g] of lista) {
    x.fillStyle = '#132230'; x.font = `600 ${Math.round(15 * dpr)}px ${FUENTE_CV}`; x.textBaseline = 'middle';
    x.fillText(t(k), 10 * dpr, yy + cab / 2);
    x.font = `${Math.round(11 * dpr)}px ${FUENTE_CV}`;
    let lx = 10 * dpr;
    for (const s of g.series) {
      x.strokeStyle = s.color; x.lineWidth = 2.5 * dpr; x.setLineDash((s.dash || []).map(v => v * dpr));
      x.beginPath(); x.moveTo(lx, yy + cab + ley / 2); x.lineTo(lx + 18 * dpr, yy + cab + ley / 2); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#3f4e5c'; x.fillText(s.nombre, lx + 22 * dpr, yy + cab + ley / 2);
      lx += x.measureText(s.nombre).width + 40 * dpr;
    }
    yy += cab + ley;
    x.drawImage(g.cv, 0, yy); yy += g.cv.height;
  }
  x.fillStyle = '#677585'; x.font = `${Math.round(11 * dpr)}px ${FUENTE_CV}`;
  x.fillText(t('notaParam'), 10 * dpr, yy + 15 * dpr);
  c.toBlob(b => { if (b) descargar('graficas_biodiesel.png', b, 'image/png'); }, 'image/png');
}

/* =====================================================================
 * UI — enlaces de eventos y bucle principal
 * ===================================================================== */
function leerOperacion() {
  EXP.u.rpm = Math.min(1000, Math.max(0, parseFloat($('inRpm').value) || 0));
  EXP.u.Tset = Math.min(80, Math.max(20, parseFloat($('inTset').value) || 20)) + K0;
  EXP.u.camisa = $('chkCamisa').checked;
}
function enlazarPar(idRange, idNum) {
  const r = $(idRange), n = $(idNum);
  r.addEventListener('input', () => { n.value = r.value; pintarRango(r); leerOperacion(); UI.panelPaso(); });
  n.addEventListener('change', () => { const v = Math.min(+r.max, Math.max(+r.min, parseFloat(n.value) || 0)); n.value = v; r.value = v; pintarRango(r); leerOperacion(); UI.panelPaso(); });
}
function fijarVelocidad(v) {
  VELOCIDAD = v;
  document.querySelectorAll('#segVel button').forEach(b => b.setAttribute('aria-checked', +b.dataset.vel === v ? 'true' : 'false'));
}
function aplicarParametros(p) {
  $('inMeOH').value = p.m_meoh; $('inNaOH').value = p.m_naoh; $('selAceite').value = p.aceite; $('inAceite').value = p.m_aceite;
  $('inAGL').value = p.agl; $('inHum').value = p.humedad;
  $('inRpm').value = $('inRpmN').value = p.rpm; $('inTset').value = $('inTsetN').value = p.Tset_C;
  $('chkCamisa').checked = p.camisa !== false;
  $('chkSinCalentar').checked = !!p.sinCalentar;
  pintarRango($('inRpm')); pintarRango($('inTset'));
}
function iniciarUI() {
  try { const l = localStorage.getItem('biodiesel_idioma'); if (l === 'en' || l === 'es') LANG = l; } catch (e) { /* sin almacenamiento */ }
  cargarRegistroLocal();
  REACTOR.cv = $('cvReactor'); REACTOR.ctx = REACTOR.cv.getContext('2d');
  GRAF = {
    comp: new Grafica('cvComp', { yMin: 0, yMax: 100 }),
    temp: new Grafica('cvTemp', { yMin: 15, yMax: 70, autoY: true }),
    conv: new Grafica('cvConv', { yMin: 0, yMax: 100 })
  };
  UI.textos();
  const D = CONFIG.defecto;
  aplicarParametros({ ...D, agl: CONFIG.aceites[D.aceite].agl, humedad: CONFIG.aceites[D.aceite].humedad });
  leerOperacion();

  enlazarPar('inRpm', 'inRpmN'); enlazarPar('inTset', 'inTsetN');
  $('chkCamisa').addEventListener('change', () => { leerOperacion(); UI.panelPaso(); });
  $('segVel').addEventListener('click', e => { const b = e.target.closest('button[data-vel]'); if (b) fijarVelocidad(+b.dataset.vel); });
  $('segVel').addEventListener('keydown', e => {   // flechas para moverse por el grupo de radio
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const bs = [...document.querySelectorAll('#segVel button')], i = bs.findIndex(b => +b.dataset.vel === VELOCIDAD);
    const j = Math.min(bs.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
    fijarVelocidad(+bs[j].dataset.vel); bs[j].focus(); e.preventDefault();
  });
  fijarVelocidad(VELOCIDAD);
  $('btnPausa').addEventListener('click', () => { PAUSADO = !PAUSADO; UI.botonPausa(); });
  $('btnReiniciar').addEventListener('click', () => reiniciar(true));
  ['inMeOH', 'inNaOH', 'inAceite', 'inAGL', 'inHum'].forEach(id => $(id).addEventListener('input', () => UI.panelPaso()));
  $('selAceite').addEventListener('change', () => { const a = CONFIG.aceites[$('selAceite').value]; $('inAGL').value = a.agl; $('inHum').value = a.humedad; UI.panelPaso(); });
  $('chkSinCalentar').addEventListener('change', () => UI.panelPaso());
  document.querySelectorAll('input[name="dosis"]').forEach(r => r.addEventListener('change', () => UI.panelPaso()));
  $('inCaudal').addEventListener('input', () => UI.panelPaso());
  const clic = (id, f) => $(id).addEventListener('click', f);
  clic('btnPreparar', ACCIONES.prepararMetoxido); clic('btnCargar', ACCIONES.cargarAceite); clic('btnAgitOK', ACCIONES.confirmarAgitacion);
  clic('btnCalentar', ACCIONES.iniciarCalentamiento); clic('btnADosificar', ACCIONES.irADosificar); clic('btnDosificar', ACCIONES.iniciarDosificacion);
  clic('btnParar', ACCIONES.pararReaccion); clic('btnADecantar', ACCIONES.irADecantar); clic('btnValvula', ACCIONES.alternarValvula);
  clic('btnDrenar1', () => ACCIONES.drenarML(1)); clic('btnDrenar10', () => ACCIONES.drenarML(10)); clic('btnFinDec', ACCIONES.terminarDecantacion);
  clic('btnLavar', ACCIONES.lavar); clic('btnSecar', ACCIONES.secar); clic('btnResultados', ACCIONES.verResultados);
  clic('btnGuardar', ACCIONES.guardar); clic('btnNuevo', ACCIONES.nuevo);
  $('selNorma').addEventListener('change', () => UI.calidad());
  clic('btnCSV', exportarRegistroCSV); clic('btnJSON', exportarJSON); clic('btnPNG', exportarPNG); clic('btnSerieCSV', exportarSerieCSV);
  clic('btnBorrarReg', () => { if (REGISTRO.length && window.confirm(t('confBorrar'))) { REGISTRO = []; COMPARAR.clear(); guardarRegistroLocal(); UI.registro(); graficasSucias = true; } });
  $('tablaReg').addEventListener('change', e => {
    const id = +e.target.dataset.comp; if (!id) return;
    if (e.target.checked) { if (COMPARAR.size >= 3) { e.target.checked = false; alert(t('max3')); return; } COMPARAR.add(id); } else COMPARAR.delete(id);
    graficasSucias = true;
  });
  clic('btnLang', () => {
    LANG = LANG === 'es' ? 'en' : 'es';
    try { localStorage.setItem('biodiesel_idioma', LANG); } catch (e) { /* sin almacenamiento */ }
    UI.textos(); UI.pasos(); UI.panelPaso(true); UI.registro(); UI.retos(); UI.lecturas(); graficasSucias = true;
  });
  const modo = retos => { $('btnModoRetos').setAttribute('aria-pressed', retos); $('btnModoLibre').setAttribute('aria-pressed', !retos); $('secRetos').hidden = !retos; };
  clic('btnModoLibre', () => { modo(false); });
  clic('btnModoRetos', () => { modo(true); UI.retos(); });
  $('secRetos').addEventListener('click', e => {
    const id = e.target.dataset && e.target.dataset.reto; if (!id) return;
    const r = CONFIG.retos.find(z => z.id === id);
    if (EXP.paso > 0 && !EXP.guardado && !window.confirm(t('confReiniciar'))) return;
    RETO = r; aplicarParametros(r.params); EXP.guardado = true; reiniciar(false); UI.retos();
    $('retoActivo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('retoActivo').addEventListener('click', e => { if (e.target.id === 'btnSalirReto') { RETO = null; UI.retos(); } });
  window.addEventListener('resize', () => { graficasSucias = true; });

  UI.pasos(); UI.panelPaso(true); UI.registro(); UI.retos();
  let ultimo = null, acumUI = 0;
  function bucle(ts) {
    const dtReal = ultimo == null ? 0 : Math.min(0.1, (ts - ultimo) / 1000);
    ultimo = ts;
    if (!PAUSADO) avanzarSimulacion(dtReal);
    dibujarReactor(PAUSADO ? 0 : dtReal);
    UI.chipEstado();
    acumUI += dtReal;
    if (acumUI > 0.25) { acumUI = 0; if (EXP.sucio) { UI.lecturas(); UI.panelPaso(); EXP.sucio = false; } if (graficasSucias) UI.graficas(); }
    requestAnimationFrame(bucle);
  }
  UI.graficas(); UI.lecturas();
  requestAnimationFrame(bucle);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarUI); else iniciarUI();
}
