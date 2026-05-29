# 🎴 Baccarat Terminal

Punto Banco jugable en la terminal. Te enseña las reglas mientras jugás — tercera carta, naturales, roads del casino, y por qué la ventaja de la casa es lo que es.

![Node.js](https://img.shields.io/badge/Node.js-builtin--only-339933?style=flat-square&logo=nodedotjs) ![Single File](https://img.shields.io/badge/Single%20file-741%20lines-f59e0b?style=flat-square) ![Zero deps](https://img.shields.io/badge/Dependencies-zero-22c55e?style=flat-square)

## 🔗 [Repositorio → github.com/tommyhanono/baccarat-terminal](https://github.com/tommyhanono/baccarat-terminal)

Cloná y corré localmente — no hay deploy web, es un juego de terminal.

---

## ▶️ Correr

```bash
node baccarat.js
```

Sin instalación. Sin dependencias externas. Solo Node.js.

---

## ¿Esto me ayuda a aprender Baccarat?

**Sí, y es el mejor juego de casino para aprender porque no hay decisiones estratégicas.**

### ✅ Lo que SÍ te enseña

**Las reglas completas de Punto Banco** — regla de tercera carta del Banker, naturales, empates como push. El panel de lecciones te explica *exactamente* por qué se repartió o no cada carta.

**Los roads del casino** — Big Road, Big Eye Boy, Small Road. Lo que significan, cómo leerlos, y por qué los casinos los muestran en pantallas gigantes.

**La matemática honesta** — la app te recuerda en cada paso que los roads son superstición. El Banker tiene el menor house edge (~1.06%). El Tie es la peor apuesta del casino (~14.4%).

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

**La mejor apuesta en Baccarat siempre es Banker.** Edge de ~1.06% vs ~1.24% Player vs ~14.4% Tie. Si vas a apostar algo, apostá siempre Banker e ignorá los roads.

---

## Interfaz

La terminal se divide en dos columnas en tiempo real:

**Columna izquierda (60%)**
- Título ASCII art
- Balance, apuesta actual y comisión acumulada
- Mesa de cartas con arte ASCII por palo, animadas una a una
- Banner de resultado (WIN / LOSS / PUSH)
- Historial de las últimas 10 rondas

**Columna derecha (40%)**
- Panel de lecciones (toggle con `L`) — explica qué pasó en la ronda y por qué
- Cheat sheet de valores de cartas y regla de tercera carta
- Tabla de pagos
- Big Road, Big Eye Boy y Small Road en tiempo real
- Insight de patrones y "predicción" (marcada como superstición)

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

---

## Comandos

| Tecla | Acción |
|---|---|
| `L` | Toggle panel de lecciones |
| `S` | Estadísticas de la sesión |
| `R` | Leyenda de los roads |
| `?` | Reglas completas |
| `Q` | Salir (muestra resumen de sesión) |

---

## Al salir

Muestra resumen completo: rondas jugadas, win rate, mayor ganancia, mayor pérdida, P&L neto y total de comisión pagada al Banker.
