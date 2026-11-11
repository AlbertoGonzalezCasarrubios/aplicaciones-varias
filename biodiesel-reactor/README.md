# Simulador docente de un reactor batch de biodiésel

Herramienta interactiva para estudiantes de grado y máster: reproduce, paso a paso, la producción de biodiésel por transesterificación básica de un aceite vegetal en un reactor de laboratorio de 1 L con camisa calefactora.

**▶ Abrir el simulador:** https://albertogonzalezcasarrubios.github.io/aplicaciones-varias/biodiesel-reactor/

> **Parámetros ilustrativos, calibrados con literatura.** Es una herramienta docente: reproduce el comportamiento cualitativo del proceso, pero no sirve para diseñar ni para predecir resultados de laboratorio. Los límites normativos son orientativos; consulta siempre la versión vigente de EN 14214 o ASTM D6751.

## Qué se puede hacer

El asistente guía el experimento completo en 10 pasos:

1. **Preparar el metóxido** (metanol + NaOH). Muestra en vivo la relación molar, el % de catalizador y los avisos de seguridad.
2. **Cargar el aceite**: soja, colza, palma, girasol o aceite usado de fritura, con su acidez (AGL) y humedad.
3. **Fijar la agitación** (0–1000 rpm) y la consigna de la camisa.
4. **Calentar** hasta la temperatura de trabajo, u optar por «añadir sin calentar» para comparar.
5. **Dosificar** el metóxido, de golpe o con caudal controlado.
6. **Reacción** con tiempo acelerable (×1 a ×600). El alumno decide cuándo parar.
7. **Sedimentación**: la glicerina se separa y la interfase pasa de turbia a nítida.
8. **Decantación** manual con la válvula de fondo: cortar pronto deja glicerina en el producto; cortar tarde arrastra biodiésel.
9. **Lavado y secado** (opcional).
10. **Tabla de calidad** frente a EN 14214 / ASTM D6751 y registro de la corrida.

Además:

- **Gráficas en tiempo real** de composición (TG, DG, MG, FAME, glicerol), temperaturas y conversión.
- **Registro de experimentos**: superpone hasta 3 corridas y exporta a CSV, JSON y PNG.
- **Modo «Retos»**: cuatro escenarios guiados con preguntas y solución oculta (aceite usado, sin calentar, poca agitación y exceso de catalizador).
- **Interfaz** en español e inglés, apta para daltonismo, legible en proyector y adaptada al móvil.

## Qué se aprende

| Si el alumno… | …observa |
|---|---|
| trabaja a 60 °C, 6:1, 0,5–1 % NaOH y ≥ 500 rpm | más del 95 % de conversión hacia los 60–90 min |
| no calienta (≈ 20 °C) | una reacción mucho más lenta (≈ 20 % a los 60 min) |
| agita poco (100 rpm) | un periodo de inducción largo; por encima de ~600 rpm ya no se gana nada |
| usa aceite con muchos AGL y poco NaOH | que el catalizador se neutraliza, la conversión es casi nula y se forma mucho jabón |
| pone exceso de catalizador (2 %) | más jabón, emulsiones y una separación más lenta |
| se salta el lavado | metanol, glicerina y sodio fuera de norma |

## Ejecutarlo en local

No necesita instalación ni conexión: descarga la carpeta y abre `index.html` con doble clic. Funciona offline en cualquier navegador moderno.

## Verificación del modelo

`verify.mjs` comprueba el modelo sin navegador. Requiere Node.js ≥ 18.

```bash
node verify.mjs            # 37 comprobaciones
node verify.mjs --detalle  # además, trayectorias y calidad del producto
```

Comprueba la conservación de masa (±0,1 %), la ausencia de concentraciones negativas, la conversión no decreciente, el estado estacionario térmico, los comportamientos cualitativos de la tabla anterior y la separación, decantación y lavado.

## Estructura

```
index.html        Marcado de la página
css/estilos.css   Diseño
js/modelo.js      Parámetros (CONFIG), modelo físico-químico e integrador. Sin DOM.
js/i18n.js        Textos en español e inglés
js/app.js         Máquina de estados del experimento, dibujo, gráficas, interfaz y exportación
verify.mjs        Pruebas del modelo (Node)
PLAN.md           Plan inicial: ecuaciones, supuestos y calibración
ARCHITECTURE.md   Arquitectura del código y del modelo
```

Los detalles técnicos están en [ARCHITECTURE.md](ARCHITECTURE.md).

## Fuentes y honestidad de los parámetros

Las constantes cinéticas parten de Noureddini & Zhu (1997) para soja. Las fuentes candidatas para otros aceites son Vicente et al. (2005), para girasol, y Darnoko & Cheryan (2000), para palma. Todas se han **recalibrado** para reproducir el comportamiento cualitativo esperado, y en el código llevan la marca `TODO-VERIFICAR`.

Las propiedades marcadas como **«estimado»** proceden de correlaciones: cetano (Krisnangkura 1986), estabilidad a la oxidación (Park et al. 2008) y CFPP (Ramos et al. 2009). No sustituyen a un ensayo normalizado.

## Autor

Alberto González-Casarrubios — Universidad Complutense de Madrid.
