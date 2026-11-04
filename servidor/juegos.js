'use strict';
/* Registro de juegos disponibles en partidas en red.
 * Cada módulo cumple la interfaz común (create, act, accionesLegales, saltar,
 * terminarPorTiempo, view, min, max). Para sumar un juego: agregarlo aquí. */
module.exports = {
  ludo: require('../js/shared/ludo-rules.js'),
  carrera: require('../js/shared/carrera-rules.js'),
  conquista: require('../js/shared/conquista-rules.js'),
  batalla: require('../js/shared/batalla-rules.js')
};
