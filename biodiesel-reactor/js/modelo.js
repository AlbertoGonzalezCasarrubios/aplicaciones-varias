/* modelo.js — CONFIG, MODELO e INTEGRADOR (funciones puras, sin DOM). Lo carga también verify.mjs.
 * Simulador docente de reactor batch de biodiésel. Script clásico (no módulo ES) para que funcione con file://. */
'use strict';

/* =====================================================================
 * CONFIG — Todos los parámetros del simulador.
 * REGLA DE HONESTIDAD: todos los valores numéricos son ILUSTRATIVOS.
 * Los marcados TODO-VERIFICAR deben contrastarse con la fuente citada.
 * ===================================================================== */
const CONFIG = {
  R: 8.314,                 // J/(mol·K)
  T_amb_C: 20,              // temperatura ambiente y de las cargas (°C)
  P_atm_Pa: 101325,

  // Masas molares fijas (g/mol)
  M: { MeOH: 32.042, GL: 92.094, H2O: 18.015, NaOH: 39.997, Na: 22.990, KOH: 56.106 },

  // Ácidos grasos: masa molar del ÁCIDO (g/mol), dobles enlaces, y propiedades del ÉSTER METÍLICO puro.
  // rho15 (g/cm³) y nu40 (mm²/s): TODO-VERIFICAR (Knothe & Steidley 2005, Fuel 84:1059; Pratas et al. 2011).
  acidosGrasos: {
    'C12:0': { M: 200.32, db: 0, C: 12, rho15: 0.873, nu40: 2.43 },
    'C14:0': { M: 228.37, db: 0, C: 14, rho15: 0.867, nu40: 3.30 },
    'C16:0': { M: 256.42, db: 0, C: 16, rho15: 0.865, nu40: 4.38 },
    'C16:1': { M: 254.41, db: 1, C: 16, rho15: 0.877, nu40: 3.67 },
    'C18:0': { M: 284.48, db: 0, C: 18, rho15: 0.864, nu40: 5.85 },
    'C18:1': { M: 282.46, db: 1, C: 18, rho15: 0.877, nu40: 4.51 },
    'C18:2': { M: 280.45, db: 2, C: 18, rho15: 0.889, nu40: 3.65 },
    'C18:3': { M: 278.43, db: 3, C: 18, rho15: 0.899, nu40: 3.14 },
    'C20:0': { M: 312.53, db: 0, C: 20, rho15: 0.862, nu40: 7.00 },
    'C20:1': { M: 310.51, db: 1, C: 20, rho15: 0.874, nu40: 5.77 },
    'C22:0': { M: 340.58, db: 0, C: 22, rho15: 0.860, nu40: 8.40 },
    'C22:1': { M: 338.57, db: 1, C: 22, rho15: 0.872, nu40: 7.33 }
  },

  // Aceites: perfil de ácidos grasos (% m/m, se normaliza), valores por defecto de AGL y humedad (% m/m).
  // Perfiles típicos TODO-VERIFICAR (Codex Stan 210; Knothe et al., The Biodiesel Handbook).
  // factorCinetico: multiplicador de las constantes de soja (fuentes candidatas indicadas). TODO-VERIFICAR.
  aceites: {
    soja:    { perfil: { 'C16:0': 10.5, 'C18:0': 4.0, 'C18:1': 23.5, 'C18:2': 53.5, 'C18:3': 7.5, 'C20:0': 0.5, 'C22:0': 0.5 },
               agl: 0.10, humedad: 0.05, factorCinetico: 1.00, fuente: 'Noureddini & Zhu 1997', color: [236, 200, 70] },
    colza:   { perfil: { 'C16:0': 4.5, 'C18:0': 1.8, 'C18:1': 62.0, 'C18:2': 20.0, 'C18:3': 9.5, 'C20:0': 0.6, 'C20:1': 1.2, 'C22:1': 0.4 },
               agl: 0.10, humedad: 0.05, factorCinetico: 1.00, fuente: '—', color: [230, 205, 60] },
    palma:   { perfil: { 'C12:0': 0.3, 'C14:0': 1.1, 'C16:0': 44.0, 'C18:0': 4.5, 'C18:1': 39.2, 'C18:2': 10.1, 'C18:3': 0.3, 'C20:0': 0.4 },
               agl: 0.15, humedad: 0.05, factorCinetico: 0.90, fuente: 'Darnoko & Cheryan 2000', color: [226, 120, 40] },
    girasol: { perfil: { 'C16:0': 6.2, 'C18:0': 3.8, 'C18:1': 21.5, 'C18:2': 67.4, 'C18:3': 0.2, 'C20:0': 0.3, 'C22:0': 0.6 },
               agl: 0.10, humedad: 0.05, factorCinetico: 1.10, fuente: 'Vicente et al. 2005', color: [240, 215, 90] },
    usado:   { perfil: { 'C14:0': 0.5, 'C16:0': 17.0, 'C18:0': 5.0, 'C18:1': 40.0, 'C18:2': 34.0, 'C18:3': 2.5, 'C20:0': 0.5, 'C22:0': 0.5 },
               agl: 4.0, humedad: 0.20, factorCinetico: 1.00, fuente: '—', color: [160, 100, 40] }
  },

  // Propiedades por especie (orden: TG, DG, MG, GL, FAME, MeOH, B, W, AGL, JABON).
  // rho15 en g/cm³ (FAME: se calcula del perfil), cp en J/(g·K), nu40 en mm²/s. TODO-VERIFICAR (valores de manual).
  especies: {
    rho15: [0.918, 0.930, 0.950, 1.261, null, 0.796, 2.130, 0.999, 0.890, 1.050],
    cp:    [1.95, 2.00, 2.10, 2.43, 1.95, 2.53, 1.50, 4.18, 2.10, 2.00],
    nu40:  [32.0, 20.0, 12.0, 220.0, null, 0.55, 1.0, 0.66, 15.0, 50.0],
    dilatacion: 0.0008       // 1/K, corrección lineal de densidad con T (líquidos orgánicos)
  },

  // Cinética de transesterificación: k_i(T) = escala·factorCinetico·k_ref_i·exp(−Ea_i/R·(1/T − 1/T_ref))
  // k_ref (L·mol⁻¹·min⁻¹ a 50 °C) y Ea (cal/mol): TODO-VERIFICAR — Noureddini & Zhu (1997) JAOCS 74:1457,
  // soja, NaOH 0,20 % m/m, 6:1. Orden: [TG→DG, DG→TG, DG→MG, MG→DG, MG→GL, GL→MG].
  // 'escala' y las referencias de catalizador se CALIBRAN para cumplir los objetivos cualitativos (ver PLAN.md §9).
  cinetica: {
    T_ref: 323.15,
    k_ref: [0.050, 0.110, 0.215, 1.228, 0.242, 0.007],
    Ea_cal: [13145, 9932, 19860, 14639, 6421, 9588],
    escala: 0.10,             // calibrado (adimensional)
    // El modelo pseudohomogéneo no recoge que la glicerina segrega en otra fase durante la reacción y desplaza el
    // equilibrio; con las k inversas originales la conversión se estanca en ~85 %. Se escalan las inversas (calibrado).
    factor_inversas: 0.25,
    B_ref_molL: 0.04,         // concentración de base de referencia (≈0,2 % NaOH en la mezcla)
    B_umbral_molL: 0.015,     // por debajo de ~esta concentración la reacción casi no avanza
    dH_J_mol: [-1500, 1500, -1500, 1500, -1500, 1500]   // entalpías por etapa (casi termoneutra). TODO-VERIFICAR
  },

  // Saponificación de ésteres: FAME + B → JABON + MeOH
  // r_s = η·k_s(T)·[FAME]·[B]·([B]/B_ref)^(orden_B−1)·(1 + alfa_W·[W]). TODO-VERIFICAR (orden de magnitud: Vicente et al. 2004).
  saponificacion: { k_ref: 0.6e-4, Ea: 60000, orden_B: 2, alfa_W: 3.0, T_ref: 323.15 },  // k_ref en L/(mol·min)

  // Agitación y transferencia de materia (modelo empírico docente)
  transferencia: {
    rpm_c: 250, n: 2,          // η_rpm = 1 − exp(−(rpm/rpm_c)^n)
    x_medio: 0.10, p: 2,       // φ(x) = x^p/(x^p + x_medio^p), x = fracción de cadenas grasas como FAME
    tau_ind_s: 90, rpm_ref: 600, m: 1.8, rpm_min: 20,  // inducción: τ = tau_ind·(rpm_ref/rpm)^m
    eta_min: 0.003
  },

  // Balance de energía — reactor de laboratorio de 1 L con camisa (baño) de agua.
  energia: {
    C_recipiente: 400,         // J/K (vidrio + agitador)
    UA_camisa: 25,             // W/K
    UA_perdidas: 0.4,          // W/K reactor → ambiente (tapa aislada)
    camisa: { C: 4000, P_max: 400, Kp: 400, UA_perdidas: 1.5 },   // J/K, W, W/K, W/K
    tolerancia_K: 1.0,         // se considera "temperatura alcanzada" a T ≥ T_consigna − tolerancia
    T_aviso_C: 60, T_eb_MeOH_C: 64.7,
    dHvap_MeOH: 35200          // J/mol
  },

  // Evaporación de metanol (reactor abierto, sin reflujo): ṅ = k_ev·x_MeOH·(Psat/Patm)^p
  // Antoine (mmHg, °C) para metanol. TODO-VERIFICAR (NIST / Perry).
  evaporacion: { k_ev_mol_s: 1.5e-4, p: 8, antoine: { A: 8.08097, B: 1582.271, C: 239.726 } },

  // Geometría del reactor
  reactor: { volumen_mL: 1000, diametro_cm: 10.5, altura_cm: 14 },

  // Separación de fases. reparto = fracción de cada especie que va a la fase POLAR (glicerina).
  // El metanol se reparte por solubilidad en la fase ligera: s = a + b·w_FAME (g/g). TODO-VERIFICAR.
  separacion: {
    reparto: [0, 0, 0.05, 0.995, 0, null, 1.0, 0.90, 0, 0.85],
    solub_MeOH: { a: 0.02, b: 0.035 },
    tau0_min: 12, T_ref: 323.15, Ev: 25000,   // τ_sep a T_ref y energía de activación (viscosidad)
    beta_jabon: 1.5,                           // ×(1 + beta·%jabón)
    gamma_GL: 0.12,                            // ÷(1 + gamma·%glicerol)
    emulsion_por_jabon: 0.05, emulsion_max: 0.5 // fracción de fase polar que queda emulsionada (por % de jabón)
  },

  // Lavado con agua caliente y secado (modelo de etapas simples)
  lavado: {
    fraccion_agua: 0.30,                        // g agua por g de producto y lavado
    eficiencia: [0, 0, 0.03, 0.90, 0, 0.55, 0.98, 0, 0.30, 0.90],  // fracción extraída por lavado, por especie
    perdida_FAME: 0.004, perdida_por_jabon: 0.05,  // fracción de producto perdida (+ por cada % de jabón)
    agua_saturacion_mgkg: 1500
  },
  secado: { W_eq_mgkg: 150, tau_min: 25, T_ref: 373.15, E: 30000, factor_MeOH: 0.2 },

  // Punto de inflamación estimado frente al metanol residual (% m/m → °C). TODO-VERIFICAR (Boog et al. 2011).
  inflamacion: [[0, 170], [0.05, 150], [0.1, 130], [0.2, 105], [0.3, 85], [0.5, 60], [1, 45], [2, 35], [5, 25]],

  // Correlaciones de calidad (estimaciones). TODO-VERIFICAR.
  correlaciones: {
    cetano: { a: 46.3, b: 5458, c: 0.225 },            // Krisnangkura 1986: NC = a + b/IS − c·IY
    estabilidad: { a: 117.9295, b: 2.5905 },           // Park et al. 2008: h = a/(C18:2+C18:3) + b
    cfpp: { a: 3.1417, b: -16.477 }                    // Ramos et al. 2009: CFPP = a·LCSF + b
  },

  // Límites normativos ORIENTATIVOS. TODO-VERIFICAR contra la versión vigente de EN 14214 y ASTM D6751.
  // [mín, máx]; null = sin límite en esa norma.
  norma: [
    { clave: 'esteres',    unidad: '% m/m',          en: [96.5, null],  astm: null },
    { clave: 'densidad',   unidad: 'kg/m³',          en: [860, 900],    astm: null,         estimado: true },
    { clave: 'viscosidad', unidad: 'mm²/s',          en: [3.5, 5.0],    astm: [1.9, 6.0],   estimado: true },
    { clave: 'inflamacion',unidad: '°C',             en: [101, null],   astm: [93, null],   estimado: true },
    { clave: 'agua',       unidad: 'mg/kg',          en: [null, 500],   astm: [null, 500] },
    { clave: 'acidez',     unidad: 'mg KOH/g',       en: [null, 0.5],   astm: [null, 0.5] },
    { clave: 'metanol',    unidad: '% m/m',          en: [null, 0.2],   astm: [null, 0.2] },
    { clave: 'MG',         unidad: '% m/m',          en: [null, 0.7],   astm: [null, 0.4] },
    { clave: 'DG',         unidad: '% m/m',          en: [null, 0.2],   astm: null },
    { clave: 'TG',         unidad: '% m/m',          en: [null, 0.2],   astm: null },
    { clave: 'GLlibre',    unidad: '% m/m',          en: [null, 0.02],  astm: [null, 0.02] },
    { clave: 'GLtotal',    unidad: '% m/m',          en: [null, 0.25],  astm: [null, 0.24] },
    { clave: 'NaK',        unidad: 'mg/kg',          en: [null, 5],     astm: [null, 5],    estimado: true },
    { clave: 'yodo',       unidad: 'g I₂/100 g',     en: [null, 120],   astm: null },
    { clave: 'cetano',     unidad: '—',              en: [51, null],    astm: [47, null],   estimado: true },
    { clave: 'estabilidad',unidad: 'h (110 °C)',     en: [8, null],     astm: [3, null],    estimado: true },
    { clave: 'cfpp',       unidad: '°C',             en: null,          astm: null,         estimado: true }
  ],

  // Valores por defecto del experimento (reactor de 1 L)
  defecto: { aceite: 'soja', m_aceite: 500, m_meoh: 110, m_naoh: 4.0, rpm: 600, Tset_C: 60, caudal_g_min: 20 },

  // Límites de la interfaz
  limites: { rpm: [0, 1000], Tset_C: [20, 80], m_aceite: [100, 700], m_meoh: [0, 300], m_naoh: [0, 30], agl: [0, 20], humedad: [0, 2], caudal: [1, 200] },

  // Escenarios guiados (los textos están en I18N: reto_<id>_titulo, _desc, _preg, _sol)
  retos: [
    { id: 'usado',     params: { aceite: 'usado', m_aceite: 500, agl: 5, humedad: 0.3, m_meoh: 110, m_naoh: 2.5, rpm: 600, Tset_C: 60, camisa: true } },
    { id: 'frio',      params: { aceite: 'soja', m_aceite: 500, agl: 0.1, humedad: 0.05, m_meoh: 110, m_naoh: 4, rpm: 600, Tset_C: 20, camisa: false, sinCalentar: true } },
    { id: 'agitacion', params: { aceite: 'soja', m_aceite: 500, agl: 0.1, humedad: 0.05, m_meoh: 110, m_naoh: 4, rpm: 100, Tset_C: 60, camisa: true } },
    { id: 'exceso',    params: { aceite: 'soja', m_aceite: 500, agl: 0.1, humedad: 0.05, m_meoh: 110, m_naoh: 10, rpm: 600, Tset_C: 60, camisa: true } }
  ]
};

/* =====================================================================
 * MODELO — funciones puras (sin DOM). Estado: Float64Array de moles + T.
 * ===================================================================== */
const IDX = { TG: 0, DG: 1, MG: 2, GL: 3, FAME: 4, MEOH: 5, B: 6, W: 7, AGL: 8, JABON: 9,
              MEOH_EV: 10, T: 11, TJ: 12, TQ_MEOH: 13, TQ_B: 14, IND: 15 };
const NESP = 10, NY = 16;
const NOMBRES_ESP = ['TG', 'DG', 'MG', 'GL', 'FAME', 'MeOH', 'B', 'W', 'AGL', 'JABON'];
const K0 = 273.15;

function normalizarPerfil(perfil) {
  let s = 0; for (const k in perfil) s += perfil[k];
  const out = {}; for (const k in perfil) out[k] = perfil[k] / s;
  return out;
}

/** Propiedades derivadas del aceite: masas molares coherentes (conservan la masa por estequiometría). */
function propsAceite(clave, cfg) {
  cfg = cfg || CONFIG;
  const ac = cfg.aceites[clave];
  if (!ac) throw new Error('Aceite desconocido: ' + clave);
  const perfil = normalizarPerfil(ac.perfil);
  const M = cfg.M;
  let s = 0;
  for (const k in perfil) s += perfil[k] / cfg.acidosGrasos[k].M;
  const M_AG = 1 / s;                            // masa molar media (en número) del ácido graso
  const M_FAME = M_AG + M.MeOH - M.H2O;
  const M_TG = M.GL + 3 * M_AG - 3 * M.H2O;
  const M_DG = M_TG - M_FAME + M.MeOH;
  const M_MG = M_DG - M_FAME + M.MeOH;
  const M_JABON = M_AG + M.NaOH - M.H2O;
  const mw = [M_TG, M_DG, M_MG, M.GL, M_FAME, M.MeOH, M.NaOH, M.H2O, M_AG, M_JABON];
  // Perfil en base FAME (fracción másica de cada éster) para propiedades
  const perfilFAME = {}; let sf = 0;
  for (const k in perfil) { const n = perfil[k] / cfg.acidosGrasos[k].M; perfilFAME[k] = n * (cfg.acidosGrasos[k].M + M.MeOH - M.H2O); sf += perfilFAME[k]; }
  for (const k in perfilFAME) perfilFAME[k] /= sf;
  let inv = 0;
  for (const k in perfilFAME) inv += perfilFAME[k] / cfg.acidosGrasos[k].rho15;
  const rho = cfg.especies.rho15.slice(); rho[IDX.FAME] = 1 / inv;
  let lnnu = 0;
  for (const k in perfilFAME) lnnu += perfilFAME[k] * Math.log(cfg.acidosGrasos[k].nu40);
  const nu = cfg.especies.nu40.slice(); nu[IDX.FAME] = Math.exp(lnnu);
  return { cfg, clave, perfil, perfilFAME, mw, rho, cp: cfg.especies.cp, nu, M_AG, factorCinetico: ac.factorCinetico };
}

/** Estado inicial: aceite en el reactor y metóxido preparado en el depósito de dosificación. */
function estadoInicial(op, P) {
  const cfg = P.cfg, y = new Float64Array(NY);
  const m = op.m_aceite, fAGL = (op.agl || 0) / 100, fW = (op.humedad || 0) / 100;
  y[IDX.TG] = m * (1 - fAGL - fW) / P.mw[IDX.TG];
  y[IDX.AGL] = m * fAGL / P.mw[IDX.AGL];
  y[IDX.W] = m * fW / P.mw[IDX.W];
  const T0 = (op.T0_C != null ? op.T0_C : cfg.T_amb_C) + K0;
  y[IDX.T] = T0; y[IDX.TJ] = T0;
  y[IDX.TQ_MEOH] = (op.m_meoh || 0) / cfg.M.MeOH;
  y[IDX.TQ_B] = (op.m_naoh || 0) / cfg.M.NaOH;
  return y;
}

/** Masa total del sistema (reactor + metanol evaporado + depósito), g. */
function masaTotal(y, P) {
  let m = 0;
  for (let i = 0; i < NESP; i++) m += y[i] * P.mw[i];
  return m + y[IDX.MEOH_EV] * P.cfg.M.MeOH + y[IDX.TQ_MEOH] * P.cfg.M.MeOH + y[IDX.TQ_B] * P.cfg.M.NaOH;
}

function masaReactor(n, P) { let m = 0; for (let i = 0; i < NESP; i++) m += n[i] * P.mw[i]; return m; }

/** Volumen de una mezcla (mL) a la temperatura T (K), mezcla ideal. */
function volumen(n, P, T) {
  const f = 1 - P.cfg.especies.dilatacion * (T - K0 - 15);
  let V = 0;
  for (let i = 0; i < NESP; i++) V += n[i] * P.mw[i] / (P.rho[i] * f);
  return V;
}

function densidad(n, P, T) { const V = volumen(n, P, T); return V > 0 ? masaReactor(n, P) / V : 0; }

/** Capacidad calorífica del contenido + recipiente (J/K). */
function capacidadCalorifica(n, P) {
  let C = P.cfg.energia.C_recipiente;
  for (let i = 0; i < NESP; i++) C += n[i] * P.mw[i] * P.cp[i];
  return C;
}

function psatMeOH(T, cfg) {
  const a = cfg.evaporacion.antoine, Tc = T - K0;
  return Math.pow(10, a.A - a.B / (a.C + Tc)) * 133.322;  // Pa
}

/** Constantes cinéticas a T (L·mol⁻¹·s⁻¹). */
function constantes(T, P) {
  const c = P.cfg.cinetica, R = P.cfg.R, k = new Array(6);
  for (let i = 0; i < 6; i++)
    k[i] = c.escala * P.factorCinetico * (i % 2 ? c.factor_inversas : 1) * c.k_ref[i] / 60 * Math.exp(-(c.Ea_cal[i] * 4.184) / R * (1 / T - 1 / c.T_ref));
  return k;
}

/** Fracción de cadenas grasas que ya están como FAME (homogeneización). */
function fraccionFAME(y) {
  const c = y[IDX.FAME] + 3 * y[IDX.TG] + 2 * y[IDX.DG] + y[IDX.MG];
  return c > 0 ? y[IDX.FAME] / c : 0;
}

/** Eficiencia de transferencia de materia η (0–1). */
function eficiencia(y, rpm, P) {
  const t = P.cfg.transferencia;
  const etaRpm = 1 - Math.exp(-Math.pow(Math.max(rpm, 0) / t.rpm_c, t.n));
  const x = fraccionFAME(y), xp = Math.pow(x, t.p);
  const phi = xp / (xp + Math.pow(t.x_medio, t.p));
  return Math.max(t.eta_min, (etaRpm + (1 - etaRpm) * phi) * y[IDX.IND]);
}

function tauInduccion(rpm, P) {
  const t = P.cfg.transferencia;
  return t.tau_ind_s * Math.pow(t.rpm_ref / Math.max(rpm, t.rpm_min), t.m);
}

/** Factor de catalizador: proporcional a [B] con umbral suave. */
function factorCatalizador(Bc, P) {
  const c = P.cfg.cinetica;
  return Bc <= 0 ? 0 : (Bc / c.B_ref_molL) * (Bc / (Bc + c.B_umbral_molL));
}

/** Velocidades (mol/s en todo el volumen) y magnitudes auxiliares. u = {rpm, Tset (K), camisa, congelado} */
function velocidades(y, u, P) {
  const cfg = P.cfg, T = y[IDX.T];
  const V_L = volumen(y, P, T) / 1000;
  const c = i => Math.max(y[i], 0) / V_L;
  let r1 = 0, r2 = 0, r3 = 0, rs = 0, eta = 0, fcat = 0;
  if (!u.congelado) {
    eta = eficiencia(y, u.rpm, P);
    fcat = factorCatalizador(c(IDX.B), P);
    if (fcat > 0) {
      const k = constantes(T, P), f = eta * fcat * V_L;
      r1 = f * (k[0] * c(IDX.TG) * c(IDX.MEOH) - k[1] * c(IDX.DG) * c(IDX.FAME));
      r2 = f * (k[2] * c(IDX.DG) * c(IDX.MEOH) - k[3] * c(IDX.MG) * c(IDX.FAME));
      r3 = f * (k[4] * c(IDX.MG) * c(IDX.MEOH) - k[5] * c(IDX.GL) * c(IDX.FAME));
      const s = cfg.saponificacion;
      const ks = s.k_ref / 60 * Math.exp(-s.Ea / cfg.R * (1 / T - 1 / s.T_ref));
      rs = eta * ks * c(IDX.FAME) * c(IDX.B) * Math.pow(c(IDX.B) / cfg.cinetica.B_ref_molL, s.orden_B - 1) * (1 + s.alfa_W * c(IDX.W)) * V_L;
    }
  }
  // Evaporación de metanol
  let ntot = 0; for (let i = 0; i < NESP; i++) ntot += Math.max(y[i], 0);
  const xM = ntot > 0 ? Math.max(y[IDX.MEOH], 0) / ntot : 0;
  const ev = cfg.evaporacion;
  const rev = ev.k_ev_mol_s * xM * Math.pow(psatMeOH(T, cfg) / cfg.P_atm_Pa, ev.p);
  // Camisa
  const e = cfg.energia;
  const Pcal = u.camisa ? Math.min(Math.max(e.camisa.Kp * (u.Tset - y[IDX.TJ]), 0), e.camisa.P_max) : 0;
  const Qj = e.UA_camisa * (y[IDX.TJ] - T);
  const dH = cfg.cinetica.dH_J_mol;
  const Qr = -(dH[0] * r1 + dH[2] * r2 + dH[4] * r3);   // dH de la reacción directa; r neta
  return { r1, r2, r3, rs, rev, eta, fcat, Pcal, Qj, Qr, V_L };
}

/** Derivadas del estado (por segundo). */
function derivadas(y, u, P, dy) {
  const cfg = P.cfg, e = cfg.energia, T = y[IDX.T];
  const v = velocidades(y, u, P);
  dy.fill(0);
  dy[IDX.TG] = -v.r1;
  dy[IDX.DG] = v.r1 - v.r2;
  dy[IDX.MG] = v.r2 - v.r3;
  dy[IDX.GL] = v.r3;
  dy[IDX.FAME] = v.r1 + v.r2 + v.r3 - v.rs;
  dy[IDX.MEOH] = -(v.r1 + v.r2 + v.r3) + v.rs - v.rev;
  dy[IDX.B] = -v.rs;
  dy[IDX.JABON] = v.rs;
  dy[IDX.MEOH_EV] = v.rev;
  const C = capacidadCalorifica(y, P);
  dy[IDX.T] = (v.Qj + v.Qr - e.UA_perdidas * (T - (cfg.T_amb_C + K0)) - v.rev * e.dHvap_MeOH) / C;
  dy[IDX.TJ] = (v.Pcal - v.Qj - e.camisa.UA_perdidas * (y[IDX.TJ] - (cfg.T_amb_C + K0))) / e.camisa.C;
  // Inducción (contacto metanol–aceite)
  dy[IDX.IND] = (!u.congelado && y[IDX.MEOH] > 1e-9) ? (1 - y[IDX.IND]) / tauInduccion(u.rpm, P) : 0;
  return v;
}

/** Neutralización instantánea de AGL: AGL + B → JABON + W. */
function neutralizar(y) {
  const xi = Math.min(Math.max(y[IDX.AGL], 0), Math.max(y[IDX.B], 0));
  if (xi > 0) { y[IDX.AGL] -= xi; y[IDX.B] -= xi; y[IDX.JABON] += xi; y[IDX.W] += xi; }
  return xi;
}

/** Dosifica 'gramos' de disolución de metóxido desde el depósito (a T_amb), con mezcla de entalpías. */
function dosificar(y, gramos, P) {
  const cfg = P.cfg;
  const mM = y[IDX.TQ_MEOH] * cfg.M.MeOH, mB = y[IDX.TQ_B] * cfg.M.NaOH, mt = mM + mB;
  if (mt <= 0 || gramos <= 0) return 0;
  const f = Math.min(1, gramos / mt);
  const dM = y[IDX.TQ_MEOH] * f, dB = y[IDX.TQ_B] * f;
  const C0 = capacidadCalorifica(y, P);
  const Cadd = dM * cfg.M.MeOH * P.cp[IDX.MEOH] + dB * cfg.M.NaOH * P.cp[IDX.B];
  y[IDX.T] = (C0 * y[IDX.T] + Cadd * (cfg.T_amb_C + K0)) / (C0 + Cadd);
  y[IDX.TQ_MEOH] -= dM; y[IDX.TQ_B] -= dB;
  if (f === 1) { y[IDX.TQ_MEOH] = 0; y[IDX.TQ_B] = 0; }
  y[IDX.MEOH] += dM; y[IDX.B] += dB;
  neutralizar(y);
  return f * mt;
}

function conversionTG(y, TG0) { return TG0 > 0 ? 1 - y[IDX.TG] / TG0 : 0; }
function rendimientoFAME(y, TG0) { return TG0 > 0 ? y[IDX.FAME] / (3 * TG0) : 0; }

/** Composición másica (%) de la mezcla. */
function composicionMasica(n, P) {
  const m = masaReactor(n, P), out = {};
  for (let i = 0; i < NESP; i++) out[NOMBRES_ESP[i]] = m > 0 ? 100 * n[i] * P.mw[i] / m : 0;
  return out;
}

/* =====================================================================
 * INTEGRADOR — RK4 de paso fijo con recorte de valores negativos.
 * ===================================================================== */
const _k = [new Float64Array(NY), new Float64Array(NY), new Float64Array(NY), new Float64Array(NY)];
const _tmp = new Float64Array(NY);
function pasoRK4(y, u, P, dt) {
  derivadas(y, u, P, _k[0]);
  for (let i = 0; i < NY; i++) _tmp[i] = y[i] + 0.5 * dt * _k[0][i];
  derivadas(_tmp, u, P, _k[1]);
  for (let i = 0; i < NY; i++) _tmp[i] = y[i] + 0.5 * dt * _k[1][i];
  derivadas(_tmp, u, P, _k[2]);
  for (let i = 0; i < NY; i++) _tmp[i] = y[i] + dt * _k[2][i];
  derivadas(_tmp, u, P, _k[3]);
  for (let i = 0; i < NY; i++) y[i] += dt / 6 * (_k[0][i] + 2 * _k[1][i] + 2 * _k[2][i] + _k[3][i]);
  // Recorte de negativos de orden numérico (se registra para la verificación)
  let recorte = 0;
  for (let i = 0; i < NESP; i++) if (y[i] < 0) { recorte = Math.min(recorte, y[i]); y[i] = 0; }
  if (y[IDX.IND] > 1) y[IDX.IND] = 1;
  return recorte;
}

/** Avanza el reactor dt segundos (con subpasos internos de como máximo dtMax). */
function avanzar(y, u, P, dt, dtMax) {
  dtMax = dtMax || 0.5;
  const n = Math.max(1, Math.ceil(dt / dtMax)), h = dt / n;
  let rec = 0;
  for (let i = 0; i < n; i++) { rec = Math.min(rec, pasoRK4(y, u, P, h)); neutralizar(y); }
  return rec;
}

/* =====================================================================
 * SEPARACIÓN DE FASES, DECANTACIÓN, LAVADO Y SECADO
 * ===================================================================== */
function vec() { return new Float64Array(NESP); }
function sumaVec(a, b) { const r = vec(); for (let i = 0; i < NESP; i++) r[i] = a[i] + b[i]; return r; }

/** Reparte una mezcla en fase polar (glicerina) y fase ligera (ésteres). */
function repartirFases(n, P) {
  const s = P.cfg.separacion, H = vec(), L = vec();
  for (let i = 0; i < NESP; i++) if (i !== IDX.MEOH) { H[i] = n[i] * s.reparto[i]; L[i] = n[i] - H[i]; }
  let mL = 0; for (let i = 0; i < NESP; i++) if (i !== IDX.MEOH) mL += L[i] * P.mw[i];
  const wF = mL > 0 ? L[IDX.FAME] * P.mw[IDX.FAME] / mL : 0;
  const sol = s.solub_MeOH.a + s.solub_MeOH.b * wF;
  const nML = Math.min(n[IDX.MEOH], sol * mL / P.mw[IDX.MEOH]);
  L[IDX.MEOH] = nML; H[IDX.MEOH] = n[IDX.MEOH] - nML;
  return { H, L };
}

/** Constante de tiempo de clarificación (s). */
function tauSeparacion(n, P, T) {
  const s = P.cfg.separacion, w = composicionMasica(n, P);
  return s.tau0_min * 60 * Math.exp(s.Ev / P.cfg.R * (1 / T - 1 / s.T_ref)) * (1 + s.beta_jabon * w.JABON) / (1 + s.gamma_GL * w.GL);
}

/** Inicia la sedimentación: todo el contenido está mezclado (la fase polar está dispersa). */
function iniciarSedimentacion(y, P) {
  const n = vec(); for (let i = 0; i < NESP; i++) n[i] = Math.max(y[i], 0);
  const { H, L } = repartirFases(n, P);
  const w = composicionMasica(n, P), s = P.cfg.separacion;
  const fEm = Math.min(s.emulsion_max, s.emulsion_por_jabon * w.JABON);
  return { asentada: vec(), dispersa: H, ligera: L, dispersaInf: H.map(v => v * fEm), dispersa0: H.slice(),
           T: y[IDX.T], tau: tauSeparacion(n, P, y[IDX.T]), t: 0, drenado: vec(), fEm };
}

/** Avance de la sedimentación dt segundos (cinética congelada). */
function pasoSedimentacion(sep, dt) {
  const f = 1 - Math.exp(-dt / sep.tau);
  for (let i = 0; i < NESP; i++) {
    const ex = sep.dispersa[i] - sep.dispersaInf[i];
    if (ex > 0) { const tr = ex * f; sep.dispersa[i] -= tr; sep.asentada[i] += tr; }
  }
  sep.t += dt;
}

/** Grado de clarificación 0 (emulsión) → 1 (interfase nítida). */
function claridad(sep) {
  let a = 0, b = 0;
  for (let i = 0; i < NESP; i++) { a += sep.dispersa[i] - sep.dispersaInf[i]; b += sep.dispersa0[i] - sep.dispersaInf[i]; }
  return b > 0 ? Math.min(1, Math.max(0, 1 - a / b)) : 1;
}

/** Capas de abajo a arriba: [{nombre, n, V, rho}]. */
function capas(sep, P) {
  const pol = sep.asentada, lig = sumaVec(sep.ligera, sep.dispersa), T = sep.T;
  const cp = { nombre: 'polar', n: pol, V: volumen(pol, P, T), rho: densidad(pol, P, T) };
  const cl = { nombre: 'ligera', n: lig, V: volumen(lig, P, T), rho: densidad(lig, P, T) };
  // Si no hay glicerol, la fase polar (metanol) es menos densa y flota.
  return (cp.V > 0 && cp.rho < cl.rho) ? [cl, cp] : [cp, cl];
}

/** Drena 'mL' desde el fondo. Devuelve la masa drenada (g). */
function drenar(sep, mL, P) {
  let rest = mL, mDren = 0;
  const cs = capas(sep, P);
  for (const c of cs) {
    if (rest <= 0 || c.V <= 0) continue;
    const f = Math.min(1, rest / c.V);
    rest -= f * c.V;
    const quitar = (arr) => { for (let i = 0; i < NESP; i++) { const d = arr[i] * f; arr[i] -= d; sep.drenado[i] += d; mDren += d * P.mw[i]; } };
    if (c.nombre === 'polar') quitar(sep.asentada);
    else { quitar(sep.ligera); quitar(sep.dispersa); const fi = 1 - f; for (let i = 0; i < NESP; i++) sep.dispersaInf[i] *= fi; }
  }
  return mDren;
}

/** Producto que queda en el reactor tras decantar. */
function productoRestante(sep) { return sumaVec(sumaVec(sep.asentada, sep.ligera), sep.dispersa); }

/** Un lavado con agua caliente. Devuelve {prod, aguas (moles extraídos + agua), mAgua}. */
function lavar(prod, P) {
  const l = P.cfg.lavado, m0 = masaReactor(prod, P);
  const out = vec(), aguas = vec();
  const w = composicionMasica(prod, P);
  const perd = Math.min(0.5, l.perdida_FAME + l.perdida_por_jabon * w.JABON);
  for (let i = 0; i < NESP; i++) {
    // extracción de solubles + pérdida por emulsión de una fracción 'perd' de todo el producto
    const e = 1 - (1 - l.eficiencia[i]) * (1 - perd);
    const quit = prod[i] * (i === IDX.W ? 1 : e);
    out[i] = prod[i] - quit; aguas[i] = quit;
  }
  const mAgua = l.fraccion_agua * m0;
  aguas[IDX.W] += mAgua / P.mw[IDX.W];
  // El producto lavado queda saturado de agua
  const mSin = masaReactor(out, P);
  const nWsat = l.agua_saturacion_mgkg * 1e-6 * mSin / (1 - l.agua_saturacion_mgkg * 1e-6) / P.mw[IDX.W];
  out[IDX.W] = nWsat; aguas[IDX.W] -= nWsat;
  return { prod: out, aguas, mAgua };
}

/** Secado a T_C durante t_min: el agua tiende a W_eq y el metanol se evapora. */
function secar(prod, P, T_C, t_min) {
  const s = P.cfg.secado, out = prod.slice(), T = T_C + K0;
  const tau = s.tau_min * Math.exp(s.E / P.cfg.R * (1 / T - 1 / s.T_ref));
  const m = masaReactor(prod, P);
  const nWeq = s.W_eq_mgkg * 1e-6 * m / P.mw[IDX.W];
  if (out[IDX.W] > nWeq) out[IDX.W] = nWeq + (out[IDX.W] - nWeq) * Math.exp(-t_min / tau);
  out[IDX.MEOH] *= Math.exp(-t_min / (tau * s.factor_MeOH));
  const perdido = vec(); for (let i = 0; i < NESP; i++) perdido[i] = prod[i] - out[i];
  return { prod: out, perdido };
}

/* =====================================================================
 * CALIDAD DEL PRODUCTO
 * ===================================================================== */
function interpTabla(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return tab[tab.length - 1][1];
}

function calidad(prod, P) {
  const cfg = P.cfg, m = masaReactor(prod, P);
  if (m <= 0) return null;
  const w = composicionMasica(prod, P);
  const AG = cfg.acidosGrasos, pf = P.perfilFAME;
  // Índices a partir del perfil del éster
  let IY = 0, IS = 0, poli = 0, LCSF = 0;
  for (const k in pf) {
    const Mf = AG[k].M + cfg.M.MeOH - cfg.M.H2O;
    IY += pf[k] * 253.81 * AG[k].db / Mf * 100;
    IS += pf[k] * 56106 / Mf;
    if (k === 'C18:2' || k === 'C18:3') poli += pf[k] * 100;
    if (AG[k].db === 0) { const f = { 16: 0.1, 18: 0.5, 20: 1, 22: 1.5, 24: 2 }[AG[k].C] || 0; LCSF += f * pf[k] * 100; }
  }
  const T15 = 15 + K0;
  const rho = densidad(prod, P, T15) * 1000;
  let lnnu = 0; for (let i = 0; i < NESP; i++) lnnu += (w[NOMBRES_ESP[i]] / 100) * Math.log(P.nu[i]);
  const co = cfg.correlaciones;
  const nGlic = prod[IDX.GL] + prod[IDX.MG] + prod[IDX.DG] + prod[IDX.TG];
  return {
    esteres: w.FAME, MG: w.MG, DG: w.DG, TG: w.TG, GLlibre: w.GL,
    GLtotal: 100 * nGlic * cfg.M.GL / m,
    metanol: w.MeOH, agua: w.W * 1e4,
    acidez: prod[IDX.AGL] * 56106 / m,
    NaK: (prod[IDX.B] + prod[IDX.JABON]) * cfg.M.Na * 1000 / (m / 1000),
    yodo: IY, saponificacion: IS,
    densidad: rho, viscosidad: Math.exp(lnnu),
    cetano: co.cetano.a + co.cetano.b / IS - co.cetano.c * IY,
    estabilidad: poli > 0 ? co.estabilidad.a / poli + co.estabilidad.b : 40,
    cfpp: co.cfpp.a * LCSF + co.cfpp.b,
    inflamacion: interpTabla(cfg.inflamacion, w.MeOH),
    jabon: w.JABON, masa: m
  };
}

/** Evalúa la calidad frente a la norma ('en' o 'astm'). */
function evaluarNorma(cal, norma, cfg) {
  cfg = cfg || CONFIG;
  return cfg.norma.map(fila => {
    const lim = fila[norma], v = cal[fila.clave];
    let ok = null;
    if (lim) ok = (lim[0] == null || v >= lim[0]) && (lim[1] == null || v <= lim[1]);
    return { clave: fila.clave, unidad: fila.unidad, lim, valor: v, ok, estimado: !!fila.estimado };
  });
}

/* =====================================================================
 * PROTOCOLO COMPLETO (sin interfaz) — usado por verify.mjs y por los retos
 * op: {aceite, m_aceite, agl, humedad, m_meoh, m_naoh, rpm, Tset_C, camisa, calentar, caudal_g_min, t_min, dt, cfg}
 * ===================================================================== */
function simularProtocolo(op) {
  const P = propsAceite(op.aceite, op.cfg);
  const y = estadoInicial(op, P);
  const u = { rpm: op.rpm, Tset: op.Tset_C + K0, camisa: op.camisa !== false, congelado: false };
  const dt = op.dt || 0.5, m0 = masaTotal(y, P);
  let tCal = 0;
  if (op.calentar !== false && u.camisa) {
    while (y[IDX.T] < u.Tset - P.cfg.energia.tolerancia_K && tCal < 4 * 3600) { avanzar(y, u, P, dt, dt); tCal += dt; }
  }
  const TG0 = y[IDX.TG];
  const caudal = op.caudal_g_min == null ? Infinity : op.caudal_g_min;
  const tray = []; let t = 0, minNeg = 0, maxErr = 0, sigReg = 0;
  const tFin = op.t_min * 60;
  while (t <= tFin + 1e-9) {
    if (y[IDX.TQ_MEOH] + y[IDX.TQ_B] > 0) dosificar(y, caudal === Infinity ? 1e12 : caudal / 60 * dt, P);
    if (t >= sigReg - 1e-9) {
      const err = Math.abs(masaTotal(y, P) - m0) / m0;
      maxErr = Math.max(maxErr, err);
      tray.push({ t_min: t / 60, X: conversionTG(y, TG0), Y: rendimientoFAME(y, TG0), T_C: y[IDX.T] - K0, Tj_C: y[IDX.TJ] - K0,
                  jabon_g: y[IDX.JABON] * P.mw[IDX.JABON], err });
      sigReg += 30;
    }
    minNeg = Math.min(minNeg, avanzar(y, u, P, dt, dt));
    t += dt;
  }
  return { P, y, tray, TG0, tCal_min: tCal / 60, minNeg, maxErr, m0 };
}

/** Valor de la trayectoria en un instante (min) */
function enTiempo(tray, t_min, campo) {
  let best = tray[0];
  for (const p of tray) if (p.t_min <= t_min + 1e-9) best = p;
  return best[campo];
}

const MODELO = { CONFIG, IDX, NESP, NY, NOMBRES_ESP, K0, propsAceite, estadoInicial, masaTotal, masaReactor, volumen, densidad,
  capacidadCalorifica, psatMeOH, constantes, eficiencia, tauInduccion, factorCatalizador, velocidades, derivadas, neutralizar,
  dosificar, conversionTG, rendimientoFAME, composicionMasica, pasoRK4, avanzar, repartirFases, tauSeparacion,
  iniciarSedimentacion, pasoSedimentacion, claridad, capas, drenar, productoRestante, lavar, secar, calidad, evaluarNorma,
  simularProtocolo, enTiempo, vec, sumaVec };
