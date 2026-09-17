// ============================================================
// Capa de persistencia: IndexedDB
// Estructura: Entrenamiento -> Ejercicio -> Serie -> {peso, reps, sensacion}
// Además: Plantillas -> {nombre, ejercicios: [nombreEjercicio, ...]}
// ============================================================

const DB_NAME = "entrenamiento-db";
const STORE = "entrenamientos";
const STORE_PLANTILLAS = "plantillas";
const DB_VERSION = 3; // v2: jerarquía entrenamiento/ejercicio/serie. v3: plantillas
let dbPromise;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const PLANTILLAS_POR_DEFECTO = [
  { nombre: "Empuje 1", ejercicios: ["Press banca", "Press militar con mancuernas", "Fondos en paralelas", "Extensión de tríceps en polea", "Elevaciones laterales"] },
  { nombre: "Tirón 1", ejercicios: ["Dominadas", "Remo con barra", "Jalón al pecho", "Curl de bíceps con barra", "Face pull"] },
  { nombre: "Pierna 1", ejercicios: ["Sentadilla", "Peso muerto rumano", "Prensa de piernas", "Curl femoral (isquios)", "Elevación de talones (gemelos)"] },
  { nombre: "Full Body", ejercicios: ["Sentadilla", "Press banca", "Remo con barra", "Press militar", "Curl de bíceps con mancuernas"] }
];

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

      if (!db.objectStoreNames.contains(STORE_PLANTILLAS)) {
        const plantillasStore = db.createObjectStore(STORE_PLANTILLAS, { keyPath: "id", autoIncrement: true });
        PLANTILLAS_POR_DEFECTO.forEach((p) => plantillasStore.add(p));
      }

      // Migración desde la versión anterior (store "series", plana, sin jerarquía)
      if (db.objectStoreNames.contains("series")) {
        const oldStore = tx.objectStore("series");
        const newStore = tx.objectStore(STORE);

        oldStore.getAll().onsuccess = (e) => {
          const viejas = e.target.result || [];
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
              sensacion: ""
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

// ---------- Entrenamientos ----------

async function crearEntrenamiento(fechaISO, ejercicios = []) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add({ fecha: fechaISO, ejercicios });
    req.onsuccess = () => resolve(req.result);
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
      const { id, ...resto } = e;
      store.add(resto);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Plantillas ----------

async function obtenerPlantillas() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLANTILLAS, "readonly");
    const req = tx.objectStore(STORE_PLANTILLAS).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.id - b.id));
    req.onerror = () => reject(req.error);
  });
}

async function obtenerPlantilla(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLANTILLAS, "readonly");
    const req = tx.objectStore(STORE_PLANTILLAS).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function crearPlantilla(nombre) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLANTILLAS, "readwrite");
    const req = tx.objectStore(STORE_PLANTILLAS).add({ nombre, ejercicios: [] });
    req.onsuccess = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function guardarPlantilla(plantilla) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLANTILLAS, "readwrite");
    tx.objectStore(STORE_PLANTILLAS).put(plantilla);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function borrarPlantilla(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLANTILLAS, "readwrite");
    tx.objectStore(STORE_PLANTILLAS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// Utilidades
// ============================================================

const SENSACION_LABEL = { facil: "Fácil", normal: "Normal", dificil: "Difícil", extremo: "Extremo" };

const EJERCICIOS_COMUNES = [
  "Press banca", "Press banca inclinado", "Press banca declinado",
  "Press con mancuernas", "Press inclinado con mancuernas",
  "Aperturas con mancuernas", "Aperturas en polea (cruce de poleas)",
  "Press en máquina", "Pec deck (contractora)",
  "Dominadas", "Dominadas supinas (chin-up)", "Jalón al pecho",
  "Remo con barra", "Remo con mancuerna", "Remo en polea baja",
  "Remo en máquina", "Peso muerto", "Peso muerto rumano",
  "Pull-over", "Hiperextensiones",
  "Sentadilla", "Sentadilla frontal", "Sentadilla búlgara",
  "Sentadilla hack", "Prensa de piernas", "Zancadas",
  "Peso muerto a una pierna", "Extensión de cuádriceps",
  "Curl femoral (isquios)", "Elevación de talones (gemelos)",
  "Hip thrust", "Puente de glúteos", "Abducción de cadera",
  "Press militar", "Press militar con mancuernas", "Press Arnold",
  "Elevaciones laterales", "Elevaciones frontales",
  "Pájaros (deltoide posterior)", "Face pull", "Encogimientos (trapecio)",
  "Curl de bíceps con barra", "Curl de bíceps con mancuernas",
  "Curl martillo", "Curl predicador", "Press francés",
  "Extensión de tríceps en polea", "Fondos en banco (tríceps)",
  "Fondos en paralelas",
  "Plancha (plank)", "Abdominales crunch", "Elevación de piernas colgado",
  "Rueda abdominal (ab wheel)", "Russian twist", "Plancha lateral",
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

const datalistSugeridos = document.getElementById("ejercicios-sugeridos");

async function actualizarDatalistSugeridos() {
  const nombres = new Set(EJERCICIOS_COMUNES);
  const [entrenamientos, plantillas] = await Promise.all([obtenerEntrenamientos(), obtenerPlantillas()]);
  entrenamientos.forEach((e) => e.ejercicios.forEach((ej) => nombres.add(ej.nombre)));
  plantillas.forEach((p) => p.ejercicios.forEach((n) => nombres.add(n)));
  datalistSugeridos.innerHTML = [...nombres].map((n) => `<option value="${escapeHtml(n)}">`).join("");
}

// ============================================================
// Estado y navegación entre vistas
// ============================================================

let entrenamientoActual = null;
let colapsados = new Set();
let plantillasCache = [];

const viewLista = document.getElementById("view-lista");
const viewDetalle = document.getElementById("view-detalle");
const viewPlantillas = document.getElementById("view-plantillas");

function ocultarTodasLasVistas() {
  viewLista.classList.add("hidden");
  viewDetalle.classList.add("hidden");
  viewPlantillas.classList.add("hidden");
}

function irALista() {
  entrenamientoActual = null;
  ocultarTodasLasVistas();
  viewLista.classList.remove("hidden");
  renderLista();
}

async function irADetalle(id) {
  entrenamientoActual = await obtenerEntrenamiento(id);
  colapsados = new Set();
  ocultarTodasLasVistas();
  viewDetalle.classList.remove("hidden");
  renderDetalle();
}

async function irAPlantillas() {
  ocultarTodasLasVistas();
  viewPlantillas.classList.remove("hidden");
  await renderPlantillasView();
}

// ============================================================
// Vista: lista de entrenamientos
// ============================================================

const listaEntrenamientos = document.getElementById("lista-entrenamientos");
const vacio = document.getElementById("vacio");
const btnNuevo = document.getElementById("btn-nuevo");
const formNuevoWrap = document.getElementById("form-nuevo-wrap");
const fechaNuevo = document.getElementById("fecha-nuevo");
const plantillaNuevo = document.getElementById("plantilla-nuevo");

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

  await actualizarDatalistSugeridos();
}

btnNuevo.addEventListener("click", async () => {
  fechaNuevo.value = hoyISO();
  plantillasCache = await obtenerPlantillas();
  plantillaNuevo.innerHTML = `<option value="">Sin plantilla (vacío)</option>` +
    plantillasCache.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join("");
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
  let ejercicios = [];
  if (plantillaNuevo.value) {
    const plantilla = await obtenerPlantilla(Number(plantillaNuevo.value));
    if (plantilla) {
      ejercicios = plantilla.ejercicios.map((nombre) => ({ id: uid(), nombre, series: [] }));
    }
  }
  const id = await crearEntrenamiento(fechaNuevo.value, ejercicios);
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
document.getElementById("btn-plantillas").addEventListener("click", irAPlantillas);
document.getElementById("btn-volver-plantillas").addEventListener("click", irALista);

// ============================================================
// Vista: detalle de un entrenamiento
// ============================================================

const detalleFecha = document.getElementById("detalle-fecha");
const listaEjercicios = document.getElementById("lista-ejercicios");

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
          <h3>${escapeHtml(ej.nombre)}</h3>
          ${colapsado ? `<span class="ejercicio-resumen">${totalSeries} serie${totalSeries !== 1 ? "s" : ""}</span>` : ""}
        </button>
        <button class="btn-x btn-borrar-ejercicio" data-ejercicio-id="${ej.id}" title="Borrar ejercicio" aria-label="Borrar ejercicio">✕</button>
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
  await actualizarDatalistSugeridos();
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

// ============================================================
// Vista: plantillas de entrenamiento
// ============================================================

const listaPlantillas = document.getElementById("lista-plantillas");
const vacioPlantillas = document.getElementById("vacio-plantillas");
const btnNuevaPlantilla = document.getElementById("btn-nueva-plantilla");
const formNuevaPlantillaWrap = document.getElementById("form-nueva-plantilla-wrap");
const nombreNuevaPlantilla = document.getElementById("nombre-nueva-plantilla");

function templatePlantilla(pl) {
  return `
    <section class="card plantilla-card" data-plantilla-id="${pl.id}">
      <div class="plantilla-head">
        <input type="text" class="input-nombre-plantilla" value="${escapeHtml(pl.nombre)}" data-plantilla-id="${pl.id}" aria-label="Nombre de la plantilla">
        <button class="btn-x btn-borrar-plantilla" data-plantilla-id="${pl.id}" title="Borrar plantilla" aria-label="Borrar plantilla">✕</button>
      </div>

      <ul class="lista-ejercicios-plantilla">
        ${pl.ejercicios.map((nombre, i) => `
          <li>
            <span>${escapeHtml(nombre)}</span>
            <button class="btn-borrar-serie btn-quitar-ejercicio-plantilla" data-plantilla-id="${pl.id}" data-index="${i}" title="Quitar ejercicio">×</button>
          </li>
        `).join("") || `<li class="serie-vacia">Sin ejercicios todavía.</li>`}
      </ul>

      <form class="form-agregar-ejercicio-plantilla" data-plantilla-id="${pl.id}">
        <input type="text" class="input-nuevo-ejercicio-plantilla" placeholder="Agregar ejercicio" list="ejercicios-sugeridos" autocomplete="off" required>
        <button type="submit">+ Agregar</button>
      </form>
    </section>
  `;
}

async function renderPlantillasView() {
  plantillasCache = await obtenerPlantillas();
  vacioPlantillas.classList.toggle("hidden", plantillasCache.length > 0);
  listaPlantillas.innerHTML = plantillasCache.map(templatePlantilla).join("");
  await actualizarDatalistSugeridos();
}

function reRenderPlantillaCard(plantilla) {
  const card = listaPlantillas.querySelector(`.plantilla-card[data-plantilla-id="${plantilla.id}"]`);
  if (card) card.outerHTML = templatePlantilla(plantilla);
}

btnNuevaPlantilla.addEventListener("click", () => {
  nombreNuevaPlantilla.value = "";
  formNuevaPlantillaWrap.classList.remove("hidden");
  btnNuevaPlantilla.classList.add("hidden");
  nombreNuevaPlantilla.focus();
});

document.getElementById("btn-cancelar-nueva-plantilla").addEventListener("click", () => {
  formNuevaPlantillaWrap.classList.add("hidden");
  btnNuevaPlantilla.classList.remove("hidden");
});

document.getElementById("btn-crear-plantilla").addEventListener("click", async () => {
  const nombre = nombreNuevaPlantilla.value.trim();
  if (!nombre) {
    alert("Ingresá un nombre para la plantilla.");
    return;
  }
  await crearPlantilla(nombre);
  formNuevaPlantillaWrap.classList.add("hidden");
  btnNuevaPlantilla.classList.remove("hidden");
  await renderPlantillasView();
});

// Cambiar el nombre de una plantilla (se guarda al salir del campo o presionar Enter)
listaPlantillas.addEventListener("change", async (e) => {
  if (!e.target.matches(".input-nombre-plantilla")) return;
  const id = Number(e.target.dataset.plantillaId);
  const plantilla = plantillasCache.find((p) => p.id === id);
  if (!plantilla) return;
  const nuevoNombre = e.target.value.trim() || plantilla.nombre;
  plantilla.nombre = nuevoNombre;
  e.target.value = nuevoNombre;
  await guardarPlantilla(plantilla);
});

listaPlantillas.addEventListener("keydown", (e) => {
  if (e.target.matches(".input-nombre-plantilla") && e.key === "Enter") {
    e.target.blur();
  }
});

listaPlantillas.addEventListener("click", async (e) => {
  if (e.target.matches(".btn-borrar-plantilla")) {
    const id = Number(e.target.dataset.plantillaId);
    if (!confirm("¿Borrar esta plantilla? No se puede deshacer.")) return;
    await borrarPlantilla(id);
    plantillasCache = plantillasCache.filter((p) => p.id !== id);
    await renderPlantillasView();
    return;
  }

  if (e.target.matches(".btn-quitar-ejercicio-plantilla")) {
    const id = Number(e.target.dataset.plantillaId);
    const index = Number(e.target.dataset.index);
    const plantilla = plantillasCache.find((p) => p.id === id);
    if (!plantilla) return;
    plantilla.ejercicios.splice(index, 1);
    await guardarPlantilla(plantilla);
    reRenderPlantillaCard(plantilla);
  }
});

listaPlantillas.addEventListener("submit", async (e) => {
  if (!e.target.matches(".form-agregar-ejercicio-plantilla")) return;
  e.preventDefault();

  const form = e.target;
  const id = Number(form.dataset.plantillaId);
  const input = form.querySelector(".input-nuevo-ejercicio-plantilla");
  const nombre = input.value.trim();
  if (!nombre) return;

  const plantilla = plantillasCache.find((p) => p.id === id);
  if (!plantilla) return;
  plantilla.ejercicios.push(nombre);
  await guardarPlantilla(plantilla);
  reRenderPlantillaCard(plantilla);
  await actualizarDatalistSugeridos();
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