Las placas de Chaldni (Chladni plates) consisten en una lámina de metal circular o cuadrada con arena o sal por encima que se hace vibrar en distintas frecuencias específicas. Es un experimento clásico de la formación de ondas estacionarias; el metal se mueve en respuesta a la vibración y la arena que está encima se acumula en zonas que no vibra (líneas nodales), formando patrones geométricos. 

Demostración  práctica: https://youtu.be/lRFysSAxWxI?si=a-rAS8YvovoLrLRZ

Esta simulación en HTML permite visualizar 

Esta simulación en HTML permite visualizar de manera simulada este fenómeno físico a través de un motor de partículas bidimensional y un renderizador tridimensional. El software resuelve de forma continua la ecuación de onda estacionaria (ver abajo) para una membrana cuadrada rígida, simulando el comportamiento de miles de partículas de arena reaccionando a la aceleración acústica.

$$Z(x, y) = \cos(n\pi x) \cdot \cos(m\pi y) + K \cdot \cos(m\pi x) \cdot \cos(n\pi y)$$

Los parámetros que se pueden mover en la simulación actúan de la siguiente manera:

### 1. Los Números de Onda Armónicos ($n$ y $m$)
Representan la cantidad de "valles y crestas" (frecuencia espacial) que se generan a lo largo de los ejes de la placa.
* **El parámetro $n$** controla el número de nodos en el eje horizontal ($x$).
* **El parámetro $m$** controla el número de nodos en el eje vertical ($y$).
Cuanto más altos sean estos valores, más alta es la frecuencia de resonancia que se está simulando. La placa se divide en subregiones más pequeñas y el patrón de arena se vuelve más intrincado y detallado.

### 2. El Parámetro de Mezcla Fásica ($K$)
En una placa cuadrada real, como es simétrica, el modo $(n, m)$ y su modo "espejo" $(m, n)$ vibran exactamente a la misma frecuencia. Al excitar la placa, se activan ambos a la vez. El parámetro $K$ dicta la proporción de energía y fase que se le da al segundo modo respecto al primero.

En la simulación, el rango de $-2$ a $+2$ permite explorar distintos comportamientos:

* **$K = 0$ (Modo Puro):** El segundo modo se anula por completo. La arena forma una cuadrícula ortogonal perfecta, alineada de forma paralela a los bordes de la placa.
* **$K = -1$ (Oposición de Fase Total):** Ambos modos se combinan restándose con la misma intensidad. Es el patrón clásico de los experimentos originales de Ernst Chladni; las líneas se vuelven diagonales y se intersectan de forma recta y limpia en el centro.
* **$K = +1$ (Sintonía de Fase Total):** Los modos se suman equitativamente. Las esquinas se cierran y las líneas rectas comienzan a curvarse hacia afuera, adquiriendo formas concéntricas romboidales.
* **$K = \pm 2$ (Dominancia y Asimetría Extrema):** El segundo modo vibra con el doble de amplitud que el primero. Físicamente, representa un experimento donde la fuente de sonido está descentrada. Visualmente, esto deforma las líneas rectas en curvas cerradas y anillos concéntricos.
