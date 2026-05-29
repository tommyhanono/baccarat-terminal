# 🎴 Baccarat

Baccarat (Punto Banco) jugable en el browser. Te enseña las reglas interactivamente — pregunta, espera tu respuesta, y te explica exactamente qué pasó y por qué.

![Web App](https://img.shields.io/badge/Web%20App-No%20install-3b82f6?style=flat-square) ![Zero deps](https://img.shields.io/badge/Dependencies-zero-22c55e?style=flat-square) ![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-f59e0b?style=flat-square)

## 🔗 [Jugar → tommyhanono.github.io/baccarat-terminal](https://tommyhanono.github.io/baccarat-terminal/)

No requiere instalación. Funciona en cualquier browser.

---

## ¿Qué hace diferente este juego?

**Te enseña a leer los roads.** Después de cada mano el coach explica qué significan los nuevos puntos en Big Road, Big Eye Boy y Small Road — en texto plano, no en jerga de casino. A partir de la mano 9, lee los tres roads en tiempo real y te dice qué patrón detecta y qué apuesta sugieren.

**Te hace preguntas.** Después de cada mano te pregunta sobre lo que acaba de pasar — ¿por qué sacó carta el Player? ¿qué significa este patrón? ¿qué señal dan los roads? Respondés, feedback inmediato en verde o rojo.

**Te da contexto antes de apostar.** Las primeras 8 manos tienen lecciones progresivas (puntuación, comisión, Big Road, Dragon Tail, Ping-Pong, Double Road, Big Eye Boy, Small Road). Después, el coach lee los roads en vivo cada mano.

---

## ¿Esto me ayuda a aprender Baccarat?

**Sí, y es el mejor juego de casino para aprender porque no hay decisiones estratégicas.**

### ✅ Lo que SÍ te enseña

**Las reglas completas de Punto Banco** — regla de tercera carta del Banker, naturales, empates como push. El panel de lecciones te explica *exactamente* por qué se repartió o no cada carta.

**Quiz interactivo** — después de cada mano te pregunta sobre lo que pasó. Tres opciones, feedback inmediato en verde o rojo, con explicación de por qué.

**Los roads del casino** — Big Road, Big Eye Boy, Small Road. El juego detecta Dragon Tail, Ping-Pong y Double Road, explica cada punto nuevo en plain English, y combina los tres roads en una señal de apuesta con el disclaimer matemático honesto.

**La matemática honesta** — te recuerda en cada paso que los roads son superstición. El Banker tiene el menor house edge (~1.06%). El Tie es la peor apuesta (~14.4%).

**Comisión del Banker** — el 5% se trackea por separado y te lo muestra en pantalla, igual que un casino real.

### ❌ Lo que NO te enseña

- **A ganar** — Baccarat es puro azar. No existe estrategia que cambie el outcome.
- **A leer patrones** — los roads no predicen nada. El juego te lo dice explícitamente.
- **El ambiente del casino** — la presión, el ritmo, apostar con plata real.

### 🎯 La realidad honesta

| Objetivo | ¿Te sirve? |
|---|---|
| Aprender las reglas antes de jugar en un casino | ✅ Mucho |
| Entender la regla de tercera carta del Banker | ✅ Sí |
| Leer los roads sin parecer turista | ✅ Sí |
| Desarrollar una estrategia ganadora | ❌ No existe |
| Reducir la ventaja del casino | ❌ Solo apostando Banker siempre |

**La mejor apuesta en Baccarat siempre es Banker.** Edge de ~1.06% vs ~1.24% Player vs ~14.4% Tie.

---

## Interfaz

**Mesa (centro)** — felt verde con animación de cartas, score visible en tiempo real, banner de resultado (WIN / LOSS / PUSH), historial de las últimas 10 rondas.

**Panel derecho** — dos tabs:
- **Roads**: Big Road, Big Eye Boy, Small Road en tiempo real + insight de patrones
- **Lessons**: Coach tip antes de apostar / Quiz interactivo después de cada mano

**Footer** — seleccionás lado (Player / Tie / Banker) + fichas ($10–$500) → botón DEAL → resultado → Next Hand.

---

## Roads del casino

| Road | Qué muestra |
|---|---|
| **Big Road** | Rachas: misma columna mientras gana el mismo lado, nueva columna al cambiar |
| **Big Eye Boy** | Compara la columna actual con la de 2 atrás — ¿se repite el patrón? |
| **Small Road** | Lo mismo pero comparando 3 columnas atrás |

Los tres son herramientas tradicionales de los casinos para darle la ilusión de patrones a un juego aleatorio.

---

## Reglas implementadas

| Regla | Valor |
|---|---|
| Barajas | 8 |
| Reshuffle cuando quedan | < 15 cartas |
| Player 3ra carta | Total 0–5 pide, 6–7 planta, 8–9 Natural |
| Banker 3ra carta | Tabla completa según total y carta del Player |
| Pago Player | 1:1 |
| Pago Banker | 0.95:1 (5% comisión) |
| Pago Tie | 8:1 |
| Balance inicial | $1,000 |
| Apuesta mínima / máxima | $10 / $500 |
