# Arquitectura

Este documento explica cómo está organizado el simulador, para quien quiera modificarlo, recalibrarlo o reutilizar el modelo.

## Principios

- **Sin dependencias ni compilación.** HTML, CSS y JavaScript sin frameworks ni CDN, con Canvas 2D para el reactor y las gráficas.
- **Funciona con `file://`.** Los scripts son clásicos (no módulos ES), porque los navegadores bloquean los módulos al abrir la página con doble clic. Comparten el ámbito global y se cargan en orden: `modelo.js` → `i18n.js` → `app.js`.
- **Modelo puro y separado de la interfaz.** `js/modelo.js` no toca el DOM; se ejecuta igual en el navegador y en Node (`verify.mjs`).
- **Todos los números en un solo sitio.** Cada parámetro físico, límite normativo o valor por defecto vive en el objeto `CONFIG`.

## Archivos y responsabilidades

| Archivo | Contenido |
|---|---|
| `js/modelo.js` | `CONFIG`; propiedades del aceite; ecuaciones del reactor; integrador RK4; separación, decantación, lavado y secado; calidad y evaluación frente a la norma; `simularProtocolo()`. Expone todo en el objeto `MODELO`. |
| `js/i18n.js` | Diccionario `I18N.es` / `I18N.en`, `t(clave, vars)` y `fmt(número, decimales)` con formato local. |
| `js/app.js` | Máquina de estados del experimento, bucle de simulación, dibujo del reactor, clase `Grafica`, objeto `UI` (render del asistente, lecturas, tablas y retos), exportación y enlace de eventos. |
| `css/estilos.css` | Variables de diseño en `:root` (paleta, radios, sombras) y componentes. |
| `index.html` | Marcado estático. Los textos llevan `data-i18n` / `data-i18n-html`; los iconos son `<symbol>` SVG reutilizados con `<use>`. |
| `verify.mjs` | Carga `js/modelo.js` con `new Function` y ejecuta las comprobaciones. |

## El modelo (`js/modelo.js`)

### Estado

El estado es un `Float64Array` de 16 posiciones indexado por `IDX`:

- **10 especies, en moles**: TG, DG, MG, glicerol, FAME, metanol, base activa (B, contabilizada como NaOH), agua, AGL y jabón.
- **Variables auxiliares**: metanol evaporado (sumidero para el balance), T del reactor, T de la camisa, metanol y NaOH que quedan en el depósito de dosificación, e inducción (0–1).

**Las masas molares son coherentes por construcción.** A partir del perfil de ácidos grasos se calcula un ácido graso medio, y las demás masas molares (TG, DG, MG, FAME, jabón) se derivan estequiométricamente. Así cada reacción conserva la masa exactamente, sin errores de redondeo.

### Ecuaciones

- **Transesterificación**: tres etapas reversibles (TG→DG→MG→GL, cada una con MeOH → FAME). Constantes `k_i = escala·k_ref,i·exp(−Ea_i/R·(1/T − 1/T_ref))`. Las inversas se multiplican por `factor_inversas`.
- **Catalizador**: la velocidad es proporcional a `[B]/B_ref·[B]/([B]+B_umbral)`. Por debajo del umbral, la reacción casi no avanza.
- **Neutralización de los AGL**: AGL + B → jabón + H₂O. Se aplica de forma instantánea (algebraica) en cada dosis y en cada paso, porque es mucho más rápida que la transesterificación.
- **Saponificación**: FAME + B → jabón + MeOH, de orden 2 en B y acelerada por el agua.
- **Transferencia de materia**: `η = [η_rpm + (1 − η_rpm)·φ(x_FAME)]·g`, donde:
  - `η_rpm = 1 − exp(−(rpm/rpm_c)^n)` satura con las rpm;
  - `φ` crece a medida que los FAME homogeneizan la mezcla;
  - `g` es un estado de inducción que se acerca a 1 con una constante de tiempo que se acorta con las rpm.
- **Energía**:
  - **Reactor:** recibe el calor de la camisa y el de reacción, y pierde calor al ambiente y por la evaporación de metanol.
  - **Camisa:** se modela con su propia capacidad calorífica y un control proporcional con potencia máxima (solo calienta).
  - **Dosificación:** el metóxido entra a temperatura ambiente y se mezcla con la entalpía del contenido.
- **Evaporación de metanol**: proporcional a `x_MeOH·(Psat/Patm)^p`, con la ecuación de Antoine.

### Integrador

`pasoRK4()` es un Runge-Kutta 4 de paso fijo (0,5 s simulados). Tras cada paso recorta los negativos de orden numérico (y lo registra para verificarlo) y aplica la neutralización. `avanzar()` divide un intervalo en subpasos.

### Después de la reacción

Al parar, la cinética se **congela** y comienza la separación:

- **`repartirFases()`** divide la mezcla en fase polar y fase ligera. Cada especie se reparte con un coeficiente fijo, salvo el metanol, que se reparte según su solubilidad en la fase rica en FAME.
- **`iniciarSedimentacion()` / `pasoSedimentacion()`**:
  - al empezar, toda la fase polar está **dispersa** en la ligera;
  - después pasa a la capa **asentada** con una constante de tiempo `τ_sep`, que depende de la temperatura, del jabón y del glicerol;
  - una parte, proporcional al jabón, queda emulsionada de forma estable.
- **`capas()`** ordena las capas por densidad: sin glicerol, el metanol flota sobre el aceite.
- **`drenar()`** vacía desde el fondo. **`productoRestante()`** es lo que queda en el reactor.
- **`lavar()` / `secar()`** son etapas simples con eficiencias por especie.

### Calidad

`calidad()` calcula, sobre el producto final:

- **Medida directa**: contenido de ésteres, MG/DG/TG, glicerol libre y total (en moles), metanol, agua, acidez y Na + K.
- **A partir del perfil de ácidos grasos**: índice de yodo e índice de saponificación.
- **Estimaciones por correlación**: densidad, viscosidad, cetano, estabilidad a la oxidación, CFPP y punto de inflamación.

`evaluarNorma(cal, 'en' | 'astm')` compara cada valor con los límites de `CONFIG.norma`.

## La aplicación (`js/app.js`)

### Máquina de estados

El objeto global `EXP` guarda todo el experimento: paso actual, estado del modelo, historial, separación, producto, etc. Los pasos van del 0 al 9 y solo avanzan; cada transición es una función de `ACCIONES`, como `prepararMetoxido`, `cargarAceite`, `iniciarDosificacion` o `pararReaccion`. **Reiniciar** crea un experimento nuevo y conserva los valores introducidos.

### Bucle principal

`requestAnimationFrame` llama a `avanzarSimulacion(dtReal)`:

- convierte el tiempo real en simulado (`× VELOCIDAD`) y lo integra en subpasos de 0,5 s;
- durante la sedimentación, avanza la separación;
- con la válvula abierta, drena a un caudal **en tiempo real** (3 mL/s), independiente de la velocidad, para que el alumno pueda cortar a tiempo.

En cada fotograma se dibuja el reactor. Las lecturas, el panel del paso y las gráficas se refrescan como mucho 4 veces por segundo y solo si algo ha cambiado (`EXP.sucio`, `graficasSucias`).

### Dibujo

- **`dibujarReactor()`** construye la escena en capas: camisa coloreada según su temperatura, vaso de vidrio, contenido (mezcla con vórtice y gotas, o capas con turbidez), agitador, sonda, bureta, válvula, vaso de recogida y etiquetas.
- **`Grafica`** es una clase de gráfica de líneas sobre Canvas, con:
  - rejilla discreta;
  - etiquetas directas al final de cada serie;
  - cruz y tooltip al pasar el ratón;
  - colores Okabe-Ito con un patrón de trazo distinto por serie, para no depender solo del color.

### Persistencia

El registro de corridas y el idioma se guardan en `localStorage`, siempre dentro de `try/catch`. Si el navegador lo bloquea, la aplicación funciona igual, aunque sin recordar nada.

## Cómo extender

| Quiero… | Dónde |
|---|---|
| Añadir un aceite | `CONFIG.aceites` (perfil, AGL, humedad, color) y las claves `ac_<id>` en `i18n.js` |
| Recalibrar la cinética | `CONFIG.cinetica` (`escala`, `factor_inversas`, `B_ref_molL`, `B_umbral_molL`) y ejecutar `node verify.mjs` |
| Cambiar un límite normativo | `CONFIG.norma` |
| Añadir un reto | `CONFIG.retos` (parámetros) y las claves `reto_<id>_titulo/_desc/_preg/_sol` en `i18n.js` |
| Añadir un texto a la interfaz | Clave en `I18N.es` e `I18N.en`, y `data-i18n="clave"` en el HTML o `t('clave')` en el código |
| Añadir una comprobación | `verify.mjs`, con `check(nombre, condición, info)` |

Después de cualquier cambio en el modelo, `node verify.mjs` debe seguir terminando con todas las comprobaciones superadas.
