# Documentación del sistema de avatares pixelados

Este documento describe, de forma estructurada, el sistema de avatares guerreros
pixelados y cómo se reutilizan en cuatro modos de juego distintos: **Batalla**,
**Ludo**, **Carrera** y **Conquista de territorios**. Está escrito para que otra
IA (o un desarrollador) pueda leerlo y entender el significado de cada dato,
estado y regla sin necesidad de inspeccionar el código fuente.

---

## 1. Los avatares (entidad base)

Cada avatar es un objeto con esta forma:

```json
{
  "id": "espadachin",
  "name": "Espadachín",
  "skin": "#e8b88a",
  "armor": "#3a5a8a",
  "head": "#9a9a9a",
  "boots": "#2a2a2a",
  "weapon": "sword",
  "weaponColor": "#c0c0c0",
  "shield": false,
  "shieldColor": null
}
```

Campos:
- `id`: identificador único, usado como clave en cualquier sistema (puntuaciones, posiciones, dueños de territorio, etc.)
- `name`: nombre visible al usuario.
- `skin`, `armor`, `head`, `boots`: colores hexadecimales usados para dibujar el sprite.
- `weapon`: uno de `sword` (espada), `axe` (hacha), `spear` (lanza), `dualblade` (dobles espadas). Determina cómo se dibuja el arma y no tiene efecto en las reglas de juego — es puramente visual.
- `shield` / `shieldColor`: opcional; si es `true`, el avatar usa un escudo en el estado `defend` en vez de bloquear con el arma.

El elenco actual (5 avatares) es:

| id | name | weapon | shield |
|---|---|---|---|
| espadachin | Espadachín | sword | no |
| barbaro | Bárbaro | axe | no |
| caballero | Caballero | sword | sí |
| lancero | Lancero | spear | no |
| sombrio | Guerrero sombrío | dualblade | no |

---

## 2. Estados / acciones (moves)

Un avatar puede estar en uno de cuatro **estados visuales**, que en el modo
Batalla también son **acciones de combate** con efecto numérico. En los demás
modos (Ludo, Carrera, Conquista) solo se usa el estado `idle` como icono de
ficha — los otros tres estados quedan disponibles para features futuras
(ej. animaciones de celebración, penalización, power-up).

```json
{
  "states": {
    "idle": {
      "meaning": "Reposo. Postura neutral, arma bajada.",
      "combat_effect": "ninguno — estado por defecto entre acciones"
    },
    "attack": {
      "meaning": "Ataca al oponente con su arma.",
      "combat_effect": "inflige 10-18 puntos de daño al objetivo; si el objetivo está en estado 'defend', el daño se reduce en un 70%"
    },
    "defend": {
      "meaning": "Se protege con escudo o arma en posición de bloqueo.",
      "combat_effect": "reduce el daño de un ataque recibido en ese turno en un 70%"
    },
    "heal": {
      "meaning": "Se cura, brazos alzados con un aura verde.",
      "combat_effect": "recupera 12-20 puntos de vida (HP máximo 100)"
    }
  }
}
```

### Regla de decisión (IA simple usada en la demo de Batalla)

Cada "turno" (tick), cada combatiente elige una acción con esta lógica:

```
si HP < 35 y random() < 0.55 → heal
si no, si random() < 0.22 → defend
si no → attack
```

Esto es una heurística simple, no un árbol de decisión real. Puede
reemplazarse por lógica más sofisticada (ej. minimax, aprendizaje por
refuerzo) manteniendo la misma interfaz de tres acciones + daño/curación.

---

## 3. Modo Batalla (ya implementado)

- Combate 1 contra 1. Cada combatiente empieza con `hp = 100`.
- En cada tick ambos combatientes eligen una acción (ver regla de decisión).
- Las acciones se resuelven simultáneamente: primero las curaciones, luego los ataques.
- El combate termina cuando `hp` de alguno llega a 0, o tras un máximo de ticks (empate se resuelve por HP restante).
- Estructura de torneo usada: 5 avatares → ronda 1 (2 combates en paralelo, avatares 1-2 y 3-4) → ronda 2 (ganador 1 vs ganador 2) → final (finalista vs 5to avatar, que esperaba).

```json
{
  "mode": "battle",
  "unit": { "id": "string", "hp": "number (0-100)", "state": "idle|attack|defend|heal" },
  "tick_resolution_order": ["heal", "attack"],
  "max_ticks_per_fight": 9,
  "bracket": ["p1_vs_p2", "p3_vs_p4", "winner1_vs_winner2", "finalist_vs_p5"]
}
```

---

## 4. Modo Ludo

Versión simplificada de Ludo: un tablero es un **camino cerrado** (loop) de
casillas por el que se mueve una ficha por jugador (no las 4 fichas del Ludo
tradicional). Cada avatar controla una ficha.

```json
{
  "mode": "ludo",
  "board": {
    "type": "perimeter_loop",
    "grid_size": 9,
    "path_length": 32
  },
  "player": {
    "avatar_id": "string",
    "start_index": "number (posición inicial en el camino, repartida uniformemente entre jugadores)",
    "steps_taken": "number (acumulado; posición actual = (start_index + steps_taken) % path_length)"
  },
  "turn": "dado de 1 a 6, se suma a steps_taken",
  "win_condition": "el primer jugador cuyo steps_taken >= path_length completa la vuelta y gana"
}
```

Esta es una base extensible: para el Ludo completo habría que añadir 4 fichas
por jugador, casillas seguras, captura de fichas rivales y tramos de llegada
privados por color.

---

## 5. Modo Carrera

Cada avatar es un "piloto" con una posición `x` en una pista horizontal.

```json
{
  "mode": "race",
  "track_length": 600,
  "racer": {
    "avatar_id": "string",
    "x": "number (0 = salida, track_length = meta)",
    "speed_per_tick": "number aleatorio 4-12 por tick"
  },
  "tick_interval_ms": 600,
  "win_condition": "el primer piloto en alcanzar x >= track_length gana; el resto se ordena por posición final"
}
```

En una versión futura conectada al banco de preguntas, `speed_per_tick`
debería depender de si el jugador respondió correctamente y con qué rapidez
(ej. respuesta correcta = boost de velocidad, incorrecta = sin boost o
penalización), en vez de ser aleatorio.

---

## 6. Modo Conquista de territorios

Mapa cuadriculado donde cada avatar es una "facción" que controla celdas.

```json
{
  "mode": "territory_conquest",
  "map": { "type": "grid", "size": [8, 8] },
  "cell": { "owner": "avatar_id | null" },
  "faction_start_cells": "1 celda inicial por avatar (esquinas + centro para el 5to)",
  "tick_logic": {
    "per_faction_per_tick": "elige una celda propia al azar, intenta capturar un vecino",
    "capture_probability_unclaimed": 0.9,
    "capture_probability_enemy": 0.35
  },
  "win_condition": "cuando no quedan celdas libres o se alcanza un máximo de ticks; gana quien controla más celdas"
}
```

En una versión conectada al banco de preguntas, la probabilidad de captura
debería depender de respuestas correctas acumuladas por el equipo, en vez de
ser fija.

---

## 7. Resumen para integración

Todos los modos comparten:
- El mismo array `CHARACTERS` (5 avatares con los mismos campos).
- El mismo `id` de avatar como clave para vincular resultados entre modos (ej. puntaje total, XP, monedas — ver documentación del proyecto `sistema-gamificado-preguntas`).
- Un sprite de 16x16 unidades de grilla, dibujado con `fillRect` sobre `<canvas>`, sin dependencias externas.

Lo que **no** comparten (por ahora, son prototipos independientes):
- Las reglas de movimiento y victoria de cada modo.
- Conexión real con el banco de preguntas (todas las decisiones dentro de estos prototipos son aleatorias, no dependen de respuestas correctas).
