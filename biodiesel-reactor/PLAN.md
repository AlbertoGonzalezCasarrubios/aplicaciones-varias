# PLAN — Simulador docente de reactor batch de biodiésel

Documento previo a la programación (hito M0). Recoge el modelo, las ecuaciones, los supuestos y las dudas abiertas.
Todo valor numérico citado aquí es **ilustrativo** y va a `CONFIG` marcado `TODO-VERIFICAR` con su fuente candidata.

---

## 1. Entregables y estructura

> **Actualización (2026-11-11):** a petición del usuario, el código se ha separado en varios archivos y se ha rediseñado la interfaz:
> `index.html` (solo marcado), `css/estilos.css`, `js/modelo.js` (CONFIG + MODELO + INTEGRADOR, sin DOM), `js/i18n.js` y `js/app.js` (estados, render, UI, exportación).
> Son scripts clásicos (no módulos ES), así que la página sigue abriéndose con doble clic (file://). `verify.mjs` carga `js/modelo.js` directamente.
> La tabla de abajo describe el diseño original de un solo archivo.

| Archivo | Contenido |
|---|---|
| `index.html` | App completa, autocontenida (HTML + CSS + JS vanilla, Canvas 2D, sin red). |
| `verify.mjs` | Extrae el bloque entre `// ==MODEL-START==` y `// ==MODEL-END==`, lo evalúa con `new Function` en Node y ejecuta las pruebas. |
| `PLAN.md` | Este documento. |

Secciones dentro del `<script>` de `index.html`, en este orden:

1. **CONFIG**: un único objeto `CONFIG` congelado (propiedades físicas, cinética, transferencia, energía, separación, perfiles de ácidos grasos, límites normativos, retos).
2. **MODELO** (`==MODEL-START==` … `==MODEL-END==`): funciones puras, sin DOM ni `window`. Incluye CONFIG *dentro* del bloque para que `verify.mjs` sea autosuficiente (o CONFIG va justo antes y los marcadores lo abarcan; decisión: **CONFIG + MODELO + INTEGRADOR dentro de los marcadores**).
3. **INTEGRADOR**: RK4 de paso fijo con subpasos y control de positividad.
4. **MÁQUINA DE ESTADOS DEL EXPERIMENTO**.
5. **RENDER** (reactor y gráficas en Canvas).
6. **UI** (asistente, controles, tablas, retos).
7. **I18N** (diccionario `ES`/`EN`, función `t(clave)`).
8. **EXPORTACIÓN** (CSV, JSON, PNG con `canvas.toBlob`/`toDataURL`).

---

## 2. Especies y estado

Estado del reactor (vector `y`, **en moles**; las masas se derivan con M_i):

| Símbolo | Especie | M (g/mol) |
|---|---|---|
| TG, DG, MG | tri-, di-, monoglicéridos | derivadas del perfil del aceite (ver abajo) |
| GL | glicerol | 92,09 |
| FAME | ésteres metílicos | M_AG + 14,03 |
| MeOH | metanol líquido | 32,04 |
| B | base activa (NaOH/NaOMe, contabilizada como NaOH) | 40,00 |
| W | agua | 18,02 |
| AGL | ácidos grasos libres | M_AG |
| S | jabón sódico | M_AG + 21,98 |
| MeOH_ev | metanol evaporado (sumidero, para el balance) | 32,04 |
| T | temperatura del reactor (K) | — |
| T_j | temperatura de la camisa (K) | — |

**Masas molares coherentes** (garantizan la conservación exacta de la masa por estequiometría): a partir del perfil de ácidos grasos del aceite se calcula una masa molar media del ácido graso M_AG. Entonces:

- M_FAME = M_AG + M_MeOH − M_H2O
- M_TG = M_GL + 3·M_AG − 3·M_H2O
- M_DG = M_TG − M_FAME + M_MeOH  (y análogo para MG)

Se trabaja con un "ácido graso medio" por aceite. El perfil completo se usa solo en las propiedades de calidad (IY, cetano, densidad, viscosidad, CFPP, estabilidad).

**Supuesto del catalizador**: NaOH + MeOH ⇌ NaOMe + H2O. No se modela el equilibrio: el NaOH disuelto actúa como pool de base activa B (mismo efecto catalítico), y el agua de esa reacción se ignora salvo una fracción configurable `CONFIG.cat.waterFromMethoxide` (por defecto 0, TODO-VERIFICAR). Así la contabilidad másica es sencilla y queda documentada.

---

## 3. Reacciones

### 3.1 Transesterificación (3 etapas reversibles)

```
TG + MeOH ⇌ DG + FAME   (k1, k2)
DG + MeOH ⇌ MG + FAME   (k3, k4)
MG + MeOH ⇌ GL + FAME   (k5, k6)
```

Concentraciones en mol/L referidas al volumen total de líquido V (pseudohomogéneo):

```
r1 = η·f_cat·(k1·[TG][MeOH] − k2·[DG][FAME])
r2 = η·f_cat·(k3·[DG][MeOH] − k4·[MG][FAME])
r3 = η·f_cat·(k5·[MG][MeOH] − k6·[GL][FAME])
k_i(T) = A_i·exp(−Ea_i/(R·T))
f_cat = [B] / [B]_ref         (velocidad ∝ catalizador activo)
```

Valores de partida: Noureddini & Zhu (1997), soja, NaOH 0,2 % m/m, 6:1. Recuerdo de orden de magnitud (a confirmar):
Ea (cal/mol) ≈ 13145 / 9932 / 19860 / 14639 / 6421 / 9588 ; k(50 °C) (L·mol⁻¹·min⁻¹) ≈ 0,050 / 0,110 / 0,215 / 1,228 / 0,242 / 0,007.
Se calcularán los A_i a partir de esos k(50 °C) y Ea, y luego se ajustará un único factor de escala global y [B]_ref para cumplir los objetivos cualitativos (§9). Variantes por aceite (Vicente 2005 girasol, Darnoko & Cheryan 2000 palma) solo como multiplicador opcional en CONFIG, todos `TODO-VERIFICAR`.

### 3.2 Neutralización de AGL (instantánea)

```
AGL + B → S + W
```

Se resuelve algebraicamente en cada dosis de metóxido (es órdenes de magnitud más rápida que la transesterificación; evita rigidez): ξ = min(AGL, B).
Consecuencia docente: con aceite usado (AGL alto) y poco NaOH, B → 0 y la reacción prácticamente no arranca.

### 3.3 Saponificación de ésteres (lenta, favorecida por agua y por exceso de base)

```
FAME + B → S + MeOH
r_s = k_s(T)·[FAME]·[B]·(1 + α_W·[W]/[W]_ref)
```

Balance de masa: (M_AG+14,03) + 40,00 = (M_AG+21,98) + 32,04 ✓.
Con exceso de catalizador r_s crece con [B], consumiendo FAME y generando jabón (que después empeora la separación). Con agua, igual.
(Supuesto: no se modela la hidrólisis de TG/DG/MG por separado; queda en "Dudas".)

### 3.4 Umbral de catalizador

Además de la proporcionalidad, el catalizador efectivo se pasa por una función suave `f_cat = B/B_ref · B/(B + B_umbral)`, de modo que por debajo de un umbral (≈0,1 % m/m equivalente) la reacción casi no avanza. Parámetro en CONFIG.

---

## 4. Agitación y transferencia de masa

```
η_rpm  = 1 − exp(−(rpm/rpm_c)^n)                  (saturante; rpm_c≈250, n≈2)
φ(x)   = x^p / (x^p + x_½^p)                       (homogeneización por FAME; x = fracción molar de FAME sobre ésteres+glicéridos)
g(t)   = 1 − exp(−t_contacto/τ_ind),  τ_ind = τ_0·(rpm_ref/max(rpm, rpm_min))^m
η      = max(η_min, [η_rpm + (1 − η_rpm)·φ(x)]·g(t))
```

- A 0 rpm: η ≈ η_min (difusión) → casi nada.
- A 100–200 rpm: inducción larga (minutos) y η inicial bajo.
- Por encima de ~500 rpm η_rpm ≈ 1: más rpm no mejoran (saturación). Cumple "no indefinidamente".
- t_contacto empieza a contar desde la primera dosis de metóxido.

---

## 5. Balance de energía

Reactor:
```
m·cp·dT/dt = UA_j·(T_j − T) + Q_r − UA_p·(T − T_amb) − Σ ṁ_carga·cp_carga·(T − T_carga) − ṁ_ev·ΔH_vap,MeOH
Q_r = −Σ ΔH_i·r_i·V   (pequeño; transesterificación casi termoneutra, TODO-VERIFICAR)
```

Camisa (dinámica de 1.er orden con control proporcional y potencia máxima):
```
m_j·cp_j·dT_j/dt = P − UA_j·(T_j − T)
P = clamp(Kp·(T_set − T_j), 0, P_max)   (solo calentamiento; "camisa apagada" ⇒ P = 0)
```

Se muestran siempre T, T_j, P y Q = UA_j·(T_j − T).
Avisos: T > 60 °C (amarillo) y T ≥ 64,7 °C (rojo, ebullición del metanol).

**Evaporación de metanol** (reactor abierto, sin reflujo):
```
ṁ_ev = k_ev·x_MeOH·P_sat,MeOH(T)/P_atm   (Antoine)
```
Es despreciable a 40 °C, apreciable a 60 °C y fuerte cerca de 64,7 °C. Se acumula en MeOH_ev para el balance de masa.

---

## 6. Separación de fases y decantación

Al pulsar "Parar" se detiene la agitación y **se congela la cinética** (supuesto: en la práctica se neutraliza o se separa la glicerina; ver Dudas).

**Reparto** (fracciones a la fase pesada, CONFIG):
GL 1,00 · B 1,00 · S 0,85 · W 0,90 · MeOH f(GL) ≈ 0,6–0,8 · MG 0,05 · resto (FAME, TG, DG, AGL) 0.

**Densidades** (g/cm³): FAME 0,88; aceite 0,91; glicerol 1,26; metanol 0,79; agua 1,00; jabón ~1,0. Mezcla ideal por volúmenes aditivos.
Altura = V/(π·D²/4). Interfase a h_pesada.

**Cinética de clarificación** (emulsión turbia → interfase nítida):
```
c(t)   = 1 − exp(−t/τ_sep)
τ_sep  = τ_0·exp(E_v/R·(1/T − 1/T_ref))·(1 + β_S·w_jabón)/(1 + γ_GL·w_GL)
```
Mientras c < 1, una fracción (1 − c)·ε_0 de la fase pesada sigue dispersa en la ligera, más un arrastre permanente ε_S·w_jabón (emulsión estable por jabón).
Visualmente: banda de emulsión cuyo espesor ∝ (1 − c).

**Decantación**: el alumno abre la válvula y vacía volumen desde abajo (botón mantenido o deslizador de volumen + "cerrar válvula"). Se drena primero la pesada, luego la banda de emulsión y luego la ligera.
- Corta pronto ⇒ queda pesada en el producto (glicerol libre, jabón, metanol, Na).
- Corta tarde ⇒ pierde biodiésel (rendimiento menor).
Se registra el rendimiento másico de producto y la composición resultante.

**Fase 2 (opcional)**: lavado con agua caliente (n lavados, eficiencia de extracción por especie: MeOH, GL, S, B; se añade agua de saturación) y secado (reduce W hacia un valor según T y tiempo). Modelo de etapas de equilibrio sencillas.

---

## 7. Calidad del producto

Sobre la composición final de la fase ligera recuperada:

| Parámetro | Cálculo |
|---|---|
| Ésteres, MG, DG, TG, GL libre, MeOH, agua | directo (% m/m, mg/kg) |
| Glicerol total | GL_libre + 0,2591·MG + 0,1488·DG + 0,1044·TG (factores EN 14105, TODO-VERIFICAR) |
| Índice de acidez | AGL residual·56,1/m (mg KOH/g) |
| Índice de yodo | directo del perfil: Σ w_i·253,81·n_db,i/M_i·100 |
| Índice de saponificación | 56100·Σ w_i/M_i |
| Densidad 15 °C | mezcla ideal de valores por especie FAME + residuos *(estimado)* |
| Viscosidad 40 °C | mezcla logarítmica (Grunberg-Nissan sin interacción) de FAME puros + aceite residual *(estimado)* |
| Cetano | Krisnangkura (1986): NC = 46,3 + 5458/IS − 0,225·IY *(estimado)* |
| Estabilidad oxidativa | correlación con % (C18:2 + C18:3), p. ej. Park et al. (2008) *(estimado)* |
| CFPP | Ramos et al. (2009) con LCSF *(estimado)* |
| Punto de inflamación | función decreciente del metanol residual *(estimado, muy aproximado)* |

Todo lo "estimado" se etiqueta así en la interfaz. Límites EN 14214 (y ASTM D6751 opcional) en `CONFIG.norma`, todos `TODO-VERIFICAR`, con aviso "valores orientativos; consulta la norma vigente".

Perfiles de ácidos grasos (C12:0 … C22:1) para soja, colza, palma, girasol y aceite usado: en CONFIG, `TODO-VERIFICAR`.

---

## 8. Integrador y máquina de estados

- **RK4** de paso fijo dt = 0,5 s simulados, con subpasos por fotograma (×600 ⇒ ~20 subpasos/fotograma a 60 fps; coste despreciable). Tras cada paso: recorte de negativos de orden numérico y comprobación del balance (en modo desarrollo).
- Eventos discretos (dosis, neutralización instantánea, parada) fuera del RK4.
- **Estados**: `PREPARAR_METOXIDO → CARGAR_ACEITE → CONFIGURAR → CALENTANDO → DOSIFICANDO → REACCIONANDO → SEDIMENTANDO → DECANTANDO → (LAVADO → SECADO) → RESULTADOS`. Transiciones validadas (p. ej. no se dosifica en CALENTANDO salvo la casilla "añadir sin calentar"). Pausa y reinicio en cualquier estado dinámico.

---

## 9. Objetivos de calibración (tests de `verify.mjs`)

Escenario base: 1 L de reactor, aceite de soja, 6:1, NaOH 0,8 %, 60 °C, 600 rpm.

| # | Escenario | Criterio |
|---|---|---|
| V1 | Cualquiera | |Δmasa| ≤ 0,1 % durante toda la corrida; ninguna especie < −1e‑9 mol |
| V2 | Base | conversión de TG no decreciente hasta equilibrio (tolerancia numérica) |
| V3 | Sin reacción, UA_p = 0, T_j fijo | T → T_j; dT/dt → 0 |
| V4 | Base | conversión (ésteres) > 90 % a 60 min y > 95 % a 90 min |
| V5 | 20 °C | conversión a 60 min < 50 % |
| V6 | 40 °C | 20 °C < conv(40) < conv(60) a 60 min |
| V7 | 100 rpm vs 600 rpm | tiempo al 10 % de conversión ≥ 3× mayor |
| V8 | 1000 vs 600 rpm | diferencia de conversión a 60 min < 2 puntos (saturación) |
| V9 | Aceite usado AGL 5 %, NaOH 0,5 % | conversión final < 30 %, jabón ≫ caso base |
| V10 | NaOH 2 % | jabón > 3× base y τ_sep mayor |

Los umbrales concretos se ajustarán al calibrar; si alguno exige forzar el modelo, lo comentaré en lugar de retorcer parámetros.

---

## 10. Interfaz (resumen)

- **Izquierda**: reactor en Canvas (cuba con camisa coloreada por T_j, nivel, agitador de palas con giro ∝ rpm, vórtice y burbujas ∝ rpm, color del líquido interpolado aceite→biodiésel según conversión, turbidez, capas y banda de emulsión, válvula inferior). Rótulos: T, T_j, P, Q.
- **Derecha**: asistente por pasos con magnitudes derivadas en vivo (relación molar, % catalizador, avisos de seguridad/EPI).
- **Abajo**: 3 gráficas propias (composición, temperaturas, conversión) con superposición de hasta 3 corridas guardadas.
- **Registro**: tabla de corridas, export CSV/JSON y PNG de gráficas.
- **Retos**: 4 escenarios precargados con preguntas y solución desplegable (`<details>`).
- Paleta Okabe-Ito (apta para daltonismo), fuentes grandes, contraste alto, responsive (columna única < 900 px), `localStorage` solo para idioma y siempre en `try/catch`.
- Nota fija: "Parámetros ilustrativos, calibrados con literatura".

---

## 11. Hitos

| Hito | Contenido | Comprobación |
|---|---|---|
| M1 | CONFIG + MODELO + INTEGRADOR + `verify.mjs` | `node verify.mjs` en verde |
| M2 | Asistente, controles, reactor animado, gráficas | verify + consola sin errores |
| M3 | Separación, decantación, lavado/secado, tabla de calidad | ídem |
| M4 | Retos, comparación, exportación | ídem |
| M5 | Pulido, accesibilidad (teclado, ARIA, contraste), i18n EN completa | ídem |

---

## 12. Supuestos adoptados (salvo que digas lo contrario)

1. Modelo pseudohomogéneo con eficiencia η (no se resuelven dos fases líquidas durante la reacción).
2. Catalizador = pool de base B contabilizado como NaOH; neutralización de AGL instantánea.
3. Reactor abierto sin condensador de reflujo (de ahí la pérdida de metanol cerca de 64,7 °C).
4. Camisa solo calefactora con control proporcional; sin refrigeración.
5. Al parar, la cinética se congela.
6. Dosificación a temperatura ambiente (aporta calor sensible negativo).
7. Un "ácido graso medio" por aceite para la cinética y la estequiometría; el perfil completo solo para las propiedades.

## 13. Decisiones tomadas (2026-11-11)

1. Node.js LTS se instala con `winget` para ejecutar `verify.mjs`.
2. Escala por defecto: **laboratorio, 1 L** (≈500 g de aceite, camisa ≈300 W).
3. Se añade **Na + K (mg/kg, estimado)** a la tabla de calidad (EN 14214 ≤ 5 mg/kg, TODO-VERIFICAR).
4. Al parar, **la cinética se congela**.

## 14. Calibración resultante (M1)

- `cinetica.escala = 0,10` y `cinetica.factor_inversas = 0,25`. Las constantes inversas de Noureddini & Zhu, en un modelo pseudohomogéneo que no segrega la glicerina, dejan el equilibrio en ~85 %. Se escalan para representar el desplazamiento del equilibrio por la separación de la glicerina. Es una decisión de calibración, no un dato de literatura.
- Caso base (soja, 6:1, 0,8 % NaOH, 60 °C, 600 rpm): rendimiento a ésteres ≈ 84 % a 30 min, 95,6 % a 60 min y 97,6 % a 90 min. A 40 °C ≈ 71 % y a 20 °C ≈ 21 % (a 60 min). A 100 rpm se tarda unas 4× más en llegar al 10 %, y 1000 rpm no mejora a 600 rpm.
- Energía: UA_camisa = 25 W/K, pérdidas 0,4 W/K y Kp = 400 W/K. El calentamiento de 20 a 59 °C tarda ≈ 12 min, y con el control P el reactor queda ≈ 0,8 K por debajo de la consigna (tolerancia de «temperatura alcanzada»: 1 K).
- Con soja, un ensayo bien hecho (con 3 lavados y secado) cumple ésteres (~96,8 %) pero no cumple DG, TG ni glicerol total (una sola etapa), ni yodo, cetano y estabilidad, que son propios de la soja. Es coherente con la práctica real: hace falta una segunda etapa o aditivos.

## 15. Dudas pendientes (con valor por defecto)

1. Hidrólisis de glicéridos por agua: **no se modela**; el agua solo acelera la saponificación de FAME.
2. Comprobación de consola: Edge en modo *headless* desde PowerShell (`--enable-logging`), además de la revisión manual.
