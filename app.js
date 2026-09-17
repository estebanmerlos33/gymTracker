// ============================================================
// Capa de persistencia: IndexedDB
// Estructura: Entrenamiento -> Ejercicio -> Serie -> {peso, reps, sensacion}
// ============================================================

const DB_NAME = "entrenamiento-db";
const STORE = "entrenamientos";
const DB_VERSION = 2; // v2: pasa de series sueltas a entrenamientos con jerarquía
let dbPromise;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function abrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }

      // Migración desde la versión anterior (store "series", plana, sin jerarquía)
      if (db.objectStoreNames.contains("series")) {
        const oldStore = tx.objectStore("series");
        const newStore = tx.objectStore(STORE);

        oldStore.getAll().onsuccess = (e) => {
          const viejas = e.target.result || [];
          // Agrupa series viejas por día y por nombre de ejercicio
          const porFecha = {};
          for (const s of viejas) {
            const d = new Date(s.fecha);
            const tzOffset = d.getTimezoneOffset() * 60000;
            const fechaISO = new Date(d - tzOffset).toISOString().slice(0, 10);

            if (!porFecha[fechaISO]) porFecha[fechaISO] = {};
            if (!porFecha[fechaISO][s.ejercicio]) porFecha[fechaISO][s.ejercicio] = [];
            porFecha[fechaISO][s.ejercicio].push({
              id: uid(),
              peso: s.peso,
              reps: s.reps,
              sensacion: "" // el modelo viejo no tenía este campo
            });
          }

          for (const [fechaISO, ejerciciosMap] of Object.entries(porFecha)) {
            const ejercicios = Object.entries(ejerciciosMap).map(([nombre, series]) => ({
              id: uid(),
              nombre,
              series
            }));
            newStore.add({ fecha: fechaISO, ejercicios });
          }

          db.deleteObjectStore("series");
        };
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function crearEntrenamiento(fechaISO) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add({ fecha: fechaISO, ejercicios: [] });
    req.onsuccess = () => resolve(req.result); // devuelve el id nuevo
    tx.onerror = () => reject(tx.error);
  });
}

async function obtenerEntrenamientos() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha.localeCompare(a.fecha)));
    req.onerror = () => reject(req.error);
  });
}

async function obtenerEntrenamiento(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function guardarEntrenamiento(entrenamiento) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entrenamiento);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function borrarEntrenamiento(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function reemplazarTodo(entrenamientos) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const e of entrenamientos) {
      const { id, ...resto } = e; // el id lo regenera autoIncrement
      store.add(resto);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// Utilidades
// ============================================================

const SENSACION_LABEL = { facil: "Fácil", normal: "Normal", dificil: "Difícil", extremo: "Extremo" };

const EJERCICIOS_COMUNES = [
  // Pecho
  "Press banca", "Press banca inclinado", "Press banca declinado",
  "Press con mancuernas", "Press inclinado con mancuernas",
  "Aperturas con mancuernas", "Aperturas en polea (cruce de poleas)",
  "Press en máquina", "Pec deck (contractora)",
  // Espalda
  "Dominadas", "Dominadas supinas (chin-up)", "Jalón al pecho",
  "Remo con barra", "Remo con mancuerna", "Remo en polea baja",
  "Remo en máquina", "Peso muerto", "Peso muerto rumano",
  "Pull-over", "Hiperextensiones",
  // Piernas
  "Sentadilla", "Sentadilla frontal", "Sentadilla búlgara",
  "Sentadilla hack", "Prensa de piernas", "Zancadas",
  "Peso muerto a una pierna", "Extensión de cuádriceps",
  "Curl femoral (isquios)", "Elevación de talones (gemelos)",
  "Hip thrust", "Puente de glúteos", "Abducción de cadera",
  // Hombros
  "Press militar", "Press militar con mancuernas", "Press Arnold",
  "Elevaciones laterales", "Elevaciones frontales",
  "Pájaros (deltoide posterior)", "Face pull", "Encogimientos (trapecio)",
  // Brazos
  "Curl de bíceps con barra", "Curl de bíceps con mancuernas",
  "Curl martillo", "Curl predicador", "Press francés",
  "Extensión de tríceps en polea", "Fondos en banco (tríceps)",
  "Fondos en paralelas",
  // Core
  "Plancha (plank)", "Abdominales crunch", "Elevación de piernas colgado",
  "Rueda abdominal (ab wheel)", "Russian twist", "Plancha lateral",
  // Calistenia
  "Flexiones de brazos (push-up)", "Flexiones diamante",
  "Flexiones con palmada", "Fondos en anillas", "Muscle-up",
  "Sentadilla pistol", "Sentadilla a una pierna asistida",
  "Handstand (parada de manos)", "Handstand push-up",
  "Front lever", "Back lever", "Planche", "L-sit",
  "Dominadas australianas (remo invertido)", "Burpees",
  "Mountain climbers", "Saltos al cajón (box jump)"
];

function hoyISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function formatearFechaISO(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ============================================================
// Estado y navegación entre vistas
// ============================================================

let entrenamientoActual = null; // objeto completo mientras se edita el detalle
let colapsados = new Set(); // ids de ejercicios colapsados en la vista actual

const viewLista = document.getElementById("view-lista");
const viewDetalle = document.getElementById("view-detalle");

function irALista() {
  entrenamientoActual = null;
  viewDetalle.classList.add("hidden");
  viewLista.classList.remove("hidden");
  renderLista();
}

async function irADetalle(id) {
  entrenamientoActual = await obtenerEntrenamiento(id);
  colapsados = new Set();
  viewLista.classList.add("hidden");
  viewDetalle.classList.remove("hidden");
  renderDetalle();
}

// ============================================================
// Vista: lista de entrenamientos
// ============================================================

const listaEntrenamientos = document.getElementById("lista-entrenamientos");
const vacio = document.getElementById("vacio");
const btnNuevo = document.getElementById("btn-nuevo");
const formNuevoWrap = document.getElementById("form-nuevo-wrap");
const fechaNuevo = document.getElementById("fecha-nuevo");

async function renderLista() {
  const entrenamientos = await obtenerEntrenamientos();
  vacio.style.display = entrenamientos.length ? "none" : "block";

  listaEntrenamientos.innerHTML = entrenamientos.map((e) => {
    const totalSeries = e.ejercicios.reduce((acc, ej) => acc + ej.series.length, 0);
    return `
      <li data-id="${e.id}">
        <div>
          <div class="entrenamiento-fecha">${formatearFechaISO(e.fecha)}</div>
          <div class="entrenamiento-resumen">
            ${e.ejercicios.length} ejercicio${e.ejercicios.length !== 1 ? "s" : ""}
            · ${totalSeries} serie${totalSeries !== 1 ? "s" : ""}
          </div>
        </div>
        <button class="ghost btn-abrir" data-id="${e.id}">Ver</button>
      </li>
    `;
  }).join("");
}

btnNuevo.addEventListener("click", () => {
  fechaNuevo.value = hoyISO();
  formNuevoWrap.classList.remove("hidden");
  btnNuevo.classList.add("hidden");
});

document.getElementById("btn-cancelar-nuevo").addEventListener("click", () => {
  formNuevoWrap.classList.add("hidden");
  btnNuevo.classList.remove("hidden");
});

document.getElementById("btn-crear-entrenamiento").addEventListener("click", async () => {
  if (!fechaNuevo.value) {
    alert("Elegí una fecha para el entrenamiento.");
    return;
  }
  const id = await crearEntrenamiento(fechaNuevo.value);
  formNuevoWrap.classList.add("hidden");
  btnNuevo.classList.remove("hidden");
  await irADetalle(id);
});

listaEntrenamientos.addEventListener("click", (e) => {
  if (e.target.matches(".btn-abrir")) {
    irADetalle(Number(e.target.dataset.id));
  }
});

document.getElementById("btn-volver").addEventListener("click", irALista);

// ============================================================
// Vista: detalle de un entrenamiento
// ============================================================

const detalleFecha = document.getElementById("detalle-fecha");
const listaEjercicios = document.getElementById("lista-ejercicios");
const datalistSugeridos = document.getElementById("ejercicios-sugeridos");

function templateSerie(ejercicioId, serie) {
  const pill = serie.sensacion
    ? `<span class="sensacion-pill sensacion-${serie.sensacion}">${SENSACION_LABEL[serie.sensacion]}</span>`
    : "";
  return `
    <li>
      <span class="serie-detalle">${serie.peso} kg × ${serie.reps} reps</span>
      ${pill}
      <button class="btn-borrar-serie" data-ejercicio-id="${ejercicioId}" data-serie-id="${serie.id}" title="Borrar serie">×</button>
    </li>
  `;
}

function templateEjercicio(ej) {
  const colapsado = colapsados.has(ej.id);
  const totalSeries = ej.series.length;

  return `
    <section class="card ejercicio-card" data-ejercicio-id="${ej.id}">
      <div class="ejercicio-head">
        <button type="button" class="btn-toggle-ejercicio" data-ejercicio-id="${ej.id}" aria-expanded="${!colapsado}">
          <span class="toggle-icono">${colapsado ? "▸" : "▾"}</span>
          <h3>${ej.nombre}</h3>
          ${colapsado ? `<span class="ejercicio-resumen">${totalSeries} serie${totalSeries !== 1 ? "s" : ""}</span>` : ""}
        </button>
        <button class="ghost danger btn-borrar-ejercicio" data-ejercicio-id="${ej.id}">X</button>
      </div>

      <div class="ejercicio-contenido ${colapsado ? "hidden" : ""}">
        <ul class="lista-series">
          ${ej.series.map((s) => templateSerie(ej.id, s)).join("") || `<li class="serie-vacia">Sin series todavía.</li>`}
        </ul>

        <form class="form-serie" data-ejercicio-id="${ej.id}">
          <div class="row">
            <input type="number" class="input-peso" placeholder="kg" step="0.5" min="0" required>
            <input type="number" class="input-reps" placeholder="reps" min="1" required>
          </div>
          <select class="input-sensacion">
            <option value="">Sensación (opcional)</option>
            <option value="facil">Fácil</option>
            <option value="normal">Normal</option>
            <option value="dificil">Difícil</option>
            <option value="extremo">Extremo</option>
          </select>
          <button type="submit">+ Agregar serie</button>
        </form>
      </div>
    </section>
  `;
}

function renderEjercicios() {
  listaEjercicios.innerHTML = entrenamientoActual.ejercicios.map(templateEjercicio).join("");
}

async function renderDetalle() {
  detalleFecha.textContent = formatearFechaISO(entrenamientoActual.fecha);
  renderEjercicios();

  // Autocompletar: nombres que el usuario ya usó + lista de ejercicios comunes
  const todos = await obtenerEntrenamientos();
  const nombres = new Set();
  todos.forEach((e) => e.ejercicios.forEach((ej) => nombres.add(ej.nombre)));
  EJERCICIOS_COMUNES.forEach((n) => nombres.add(n));
  datalistSugeridos.innerHTML = [...nombres].map((n) => `<option value="${n}">`).join("");
}

async function persistirYRenderizar() {
  await guardarEntrenamiento(entrenamientoActual);
  await renderDetalle();
}

document.getElementById("form-ejercicio").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("nombre-ejercicio");
  const nombre = input.value.trim();
  if (!nombre) return;

  entrenamientoActual.ejercicios.push({ id: uid(), nombre, series: [] });
  input.value = "";
  await persistirYRenderizar();
});

document.getElementById("btn-borrar-entrenamiento").addEventListener("click", async () => {
  if (!confirm("¿Borrar este entrenamiento completo? No se puede deshacer.")) return;
  await borrarEntrenamiento(entrenamientoActual.id);
  irALista();
});

// Delegación de eventos dentro de la lista de ejercicios
listaEjercicios.addEventListener("submit", async (e) => {
  if (!e.target.matches(".form-serie")) return;
  e.preventDefault();

  const form = e.target;
  const ejercicioId = form.dataset.ejercicioId;
  const peso = parseFloat(form.querySelector(".input-peso").value);
  const reps = parseInt(form.querySelector(".input-reps").value, 10);
  const sensacion = form.querySelector(".input-sensacion").value;

  const ejercicio = entrenamientoActual.ejercicios.find((ej) => ej.id === ejercicioId);
  ejercicio.series.push({ id: uid(), peso, reps, sensacion });

  await persistirYRenderizar();
});

listaEjercicios.addEventListener("click", async (e) => {
  const btnToggle = e.target.closest(".btn-toggle-ejercicio");
  if (btnToggle) {
    const id = btnToggle.dataset.ejercicioId;
    if (colapsados.has(id)) colapsados.delete(id);
    else colapsados.add(id);
    renderEjercicios();
    return;
  }

  if (e.target.matches(".btn-borrar-ejercicio")) {
    const ejercicioId = e.target.dataset.ejercicioId;
    if (!confirm("¿Borrar este ejercicio y todas sus series?")) return;
    entrenamientoActual.ejercicios = entrenamientoActual.ejercicios.filter((ej) => ej.id !== ejercicioId);
    await persistirYRenderizar();
  }

  if (e.target.matches(".btn-borrar-serie")) {
    const { ejercicioId, serieId } = e.target.dataset;
    const ejercicio = entrenamientoActual.ejercicios.find((ej) => ej.id === ejercicioId);
    ejercicio.series = ejercicio.series.filter((s) => s.id !== serieId);
    await persistirYRenderizar();
  }
});

// ============================================================
// Exportar / Importar
// ============================================================

document.getElementById("btn-export").addEventListener("click", async () => {
  const entrenamientos = await obtenerEntrenamientos();
  const blob = new Blob([JSON.stringify(entrenamientos, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entrenamientos-${hoyISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("input-import").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const texto = await archivo.text();
  try {
    const datos = JSON.parse(texto);
    if (!Array.isArray(datos)) throw new Error("formato inválido");
    await reemplazarTodo(datos);
    await renderLista();
    alert(`Se importaron ${datos.length} entrenamientos.`);
  } catch (err) {
    alert("No se pudo leer el archivo. ¿Es un export válido de esta app?");
  }
  e.target.value = "";
});

// ============================================================
// Storage persistente + Service worker
// ============================================================

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

const pill = document.getElementById("status-pill");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("sw.js");
      pill.textContent = "offline listo";
      pill.classList.add("online");
    } catch {
      pill.textContent = "sin cache offline";
    }
  });
} else {
  pill.textContent = "sw no soportado";
}

// ============================================================
// Arranque
// ============================================================

renderLista();