# Simulador de Evolución de Bioformas

Aplicación interactiva en p5.js y HTML para visualizar los principios de la evolución genética, la mutación y la selección artificial aplicados a estructuras morfológicas simples.

Esto es, en realidad, la adaptación de un código que hizo mi padre en Processing, basado en el famoso programa de simulación biológica creado por Richard Dawkins en 1986 para "El relojero ciego".

---

## Concepto teórico: Las Bioformas (o Biomorfos) de Dawkins

En su obra, Dawkins quería demostrar cómo la complejidad de la vida de nuestro planeta no requiere un "diseñador", sino que puede surgir mediante la selección acumulativa. Para explicarlo visualmente a través del ordenador, creó los Biomorfos: "organismos" abstractos cuya estructura (longitud de ramas, ángulos de bifurcación, número de subdivisiones y pigmentación) viene determinada por un genotipo (una cadena de números que actúan como genes).

En este simulador, el usuario (o un algoritmo de emparejamiento automatizado) actúa como la presión selectiva de la naturaleza:
1. El Progenitor está en el centro.
2. Genera 6 Hijos a su alrededor, cada uno con mutaciones aleatorias en su ADN. Hay 14 genes en total: 5 para las longitudes dicotómicas, 3 para los ángulos y 5 para los colores de las ramificaciones.
3. Al seleccionar al hijo que mejor se adapta o que visualmente más le gusta al usuario, este se convierte en el nuevo progenitor de la siguiente generación.
4. Se puede elegir una forma geométrica y dirigir la evolución de las Bioformas parra que se adapten a ellas. El fitness del progenitor aparece en el menú de selección. 

---

## Mejoras futuras

Si alguien coge este código y quiere mejorarlo (o yo en el futuro), algunos cambios interesantes que mi padre y yo pensamos son: 
1. Árbol filogenético que registre toda la historia evolutiva de una bioforma (y poder exportarlo).
2. Poder dibujar una forma (o subir una imagen) y que la bioforma se adapte al dibujo.
3. Simulación en 3D en lugar de 2D. 

Script originales: 

Script de mi padre (pre-IA): https://openprocessing.org/@artatoele/418714
Fork: https://openprocessing.org/@u79651/2975767
