/* ============================================================
 * LudoApp core/questionEngine.js
 * Motor único de preguntas compartido por los 4 juegos.
 * - Filtrado por curso / categorías / dificultades.
 * - Selección NO repetitiva: baraja el pool y entrega en orden
 *   hasta agotarlo; luego rebaraja (shuffle sin repetición).
 * ============================================================ */
window.App = window.App || {};
App.questionEngine = (function () {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function createEngine(options) {
    options = options || {};
    const pool = App.storage.getQuestions({
      course_id: options.courseId,
      category_id: options.categoryId,
      difficulty_id: options.difficultyId
    });

    if (!pool.length) {
      throw new Error('No hay preguntas para la configuración elegida (curso/categoría/dificultad).');
    }

    let deck = shuffle(pool);
    let cursor = 0;
    let cycle = 1;
    let entregadas = 0;

    function draw() {
      if (cursor >= deck.length) {
        deck = shuffle(deck);
        cursor = 0;
        cycle++;
      }
      const q = deck[cursor];
      cursor++;
      entregadas++;
      return q;
    }

    function check(question, selectedIndex) {
      return question.respuesta_correcta === Number(selectedIndex);
    }

    function peek() {
      if (cursor >= deck.length) return draw();
      return deck[cursor];
    }

    return {
      pool,
      draw,
      check,
      peek,
      get size() { return pool.length; },
      get entregadas() { return entregadas; },
      get cycle() { return cycle; },
      dificultadDe: function (q) {
        return App.storage.getById('difficulties', q.difficulty_id);
      },
      categoriaDe: function (q) {
        return App.storage.getById('categories', q.category_id);
      }
    };
  }

  /* Recursos globales */
  function getRecursos() {
    return {
      courses: App.storage.getCourses(),
      categories: App.storage.getCategories(),
      difficulties: App.storage.getDifficulties(),
      questions: App.storage.getQuestions()
    };
  }

  function check(question, selectedIndex) {
    return question.respuesta_correcta === Number(selectedIndex);
  }

  return { createEngine, getRecursos, check };
})();