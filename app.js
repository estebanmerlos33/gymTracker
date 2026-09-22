// ============================================================
// Capa de persistencia: IndexedDB
// Estructura: Entrenamiento -> Ejercicio -> Serie -> {peso, reps, sensacion}
// Además: Plantillas -> {nombre, ejercicios: [{id, nombre}, ...]}
// ============================================================

const DB_NAME = "entrenamiento-db";
const STORE = "entrenamientos";
const STORE_PLANTILLAS = "plantillas";
const DB_VERSION = 3;
let dbPromise;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function ej(nombre) {
  return { id: uid(), nombre };
}

const PLANTILLAS_POR_DEFECTO = [
  { nombre: "Empuje 1", ejercicios: ["Press banca", "Press militar con mancuernas", "Fondos en paralelas", "Extensión de tríceps en polea", "Elevaciones laterales"].map(ej) },
  { nombre: "Tirón 1", ejercicios: ["Dominadas", "Remo con barra", "Jalón al pecho", "Curl de bíceps con barra", "Face pull"].map(ej) },
  { nombre: "Pierna 1", ejercicios: ["Sentadilla", "Peso muerto rumano", "Prensa de piernas", "Curl femoral (isquios)", "Elevación de talones (gemelos)"].map(ej) },
  { nombre: "Full Body", ejercicios: ["Sentadilla", "Press banca", "Remo con barra", "Press militar", "Curl de bíceps con mancuernas"].map(ej) }
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

// Normaliza plantillas viejas (ejercicios como strings sueltos) al formato {id, nombre}
function normalizarPlantilla(pl) {
  pl.ejercicios = (pl.ejercicios || []).map((e) => (typeof e === "string" ? { id: uid(), nombre: e } : e));
  return pl;
}

// ---------- Entrenamientos ----------

async function crearEntrenamiento(fechaISO, tipo = "", ejercicios = []) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add({ fecha: fechaISO, tipo, ejercicios });
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

async function vaciarEntrenamientos() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
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
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.id - b.id).map(normalizarPlantilla));
    req.onerror = () => reject(req.error);
  });
}

async function obtenerPlantilla(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLANTILLAS, "readonly");
    const req = tx.objectStore(STORE_PLANTILLAS).get(id);
    req.onsuccess = () => resolve(req.result ? normalizarPlantilla(req.result) : req.result);
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
// Utilidades varias
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

const TIPOS_ENTRENAMIENTO_COMUNES = [
  "Empuje", "Tirón", "Pierna", "Push", "Pull", "Legs",
  "Full Body", "Torso", "Cardio", "HIIT",
  "Pecho", "Espalda", "Hombros", "Brazos", "Core",
  "Movilidad / Estiramiento", "Descanso activo"
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

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function formatearFechaConDia(iso) {
  const dia = DIAS_SEMANA[new Date(iso + "T00:00:00").getDay()];
  const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${formatearFechaISO(iso)} - ${diaCapitalizado}`;
}

// Normaliza un nombre de ejercicio para AGRUPAR (comparar), sin cambiar cómo se muestra:
// minúsculas, sin tildes, sin espacios de más.
function normalizarNombre(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const datalistSugeridos = document.getElementById("ejercicios-sugeridos");
const datalistTipos = document.getElementById("tipos-sugeridos");

async function actualizarDatalistSugeridos() {
  const nombres = new Set(EJERCICIOS_COMUNES);
  const [entrenamientos, plantillas] = await Promise.all([obtenerEntrenamientos(), obtenerPlantillas()]);
  entrenamientos.forEach((e) => e.ejercicios.forEach((ej) => nombres.add(ej.nombre)));
  plantillas.forEach((p) => p.ejercicios.forEach((ej) => nombres.add(ej.nombre)));
  datalistSugeridos.innerHTML = [...nombres].map((n) => `<option value="${escapeHtml(n)}">`).join("");

  const tipos = new Set(TIPOS_ENTRENAMIENTO_COMUNES);
  entrenamientos.forEach((e) => { if (e.tipo) tipos.add(e.tipo); });
  datalistTipos.innerHTML = [...tipos].map((t) => `<option value="${escapeHtml(t)}">`).join("");
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
const viewProgreso = document.getElementById("view-progreso");

function ocultarTodasLasVistas() {
  viewLista.classList.add("hidden");
  viewDetalle.classList.add("hidden");
  viewPlantillas.classList.add("hidden");
  viewProgreso.classList.add("hidden");
}

function irALista() {
  entrenamientoActual = null;
  ocultarTodasLasVistas();
  viewLista.classList.remove("hidden");
  renderLista();
}

async function irADetalle(id) {
  entrenamientoActual = await obtenerEntrenamiento(id);
  colapsados = new Set(entrenamientoActual.ejercicios.map((ej) => ej.id));
  ocultarTodasLasVistas();
  viewDetalle.classList.remove("hidden");
  renderDetalle();
}

async function irAPlantillas() {
  ocultarTodasLasVistas();
  viewPlantillas.classList.remove("hidden");
  await renderPlantillasView();
}

async function irAProgreso() {
  ocultarTodasLasVistas();
  viewProgreso.classList.remove("hidden");
  await renderProgresoView();
}

// ============================================================
// Vista: lista de entrenamientos
// ============================================================

const listaEntrenamientos = document.getElementById("lista-entrenamientos");
const vacio = document.getElementById("vacio");
const btnNuevo = document.getElementById("btn-nuevo");
const formNuevoWrap = document.getElementById("form-nuevo-wrap");
const fechaNuevo = document.getElementById("fecha-nuevo");
const tipoNuevo = document.getElementById("tipo-nuevo");
const plantillaNuevo = document.getElementById("plantilla-nuevo");
const zonaPeligro = document.getElementById("zona-peligro");

async function renderLista() {
  const entrenamientos = await obtenerEntrenamientos();
  vacio.style.display = entrenamientos.length ? "none" : "block";
  zonaPeligro.classList.toggle("hidden", entrenamientos.length === 0);

  listaEntrenamientos.innerHTML = entrenamientos.map((e) => {
    const totalSeries = e.ejercicios.reduce((acc, ej) => acc + ej.series.length, 0);
    const tipoBadge = e.tipo ? `<span class="tipo-badge">${escapeHtml(e.tipo)}</span>` : "";
    return `
      <li data-id="${e.id}">
        <div>
          <div class="entrenamiento-fecha">${formatearFechaConDia(e.fecha)}${tipoBadge}</div>
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
  tipoNuevo.value = "";
  plantillasCache = await obtenerPlantillas();
  plantillaNuevo.innerHTML = `<option value="">Sin plantilla (vacío)</option>` +
    plantillasCache.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join("");
  formNuevoWrap.classList.remove("hidden");
  btnNuevo.classList.add("hidden");
});

// Si el usuario elige una plantilla y todavía no escribió un tipo, lo sugerimos
// con el nombre de la plantilla (ej: "Empuje 1"), pero se puede editar o borrar.
plantillaNuevo.addEventListener("change", () => {
  if (!plantillaNuevo.value || tipoNuevo.value.trim()) return;
  const plantilla = plantillasCache.find((p) => p.id === Number(plantillaNuevo.value));
  if (plantilla) tipoNuevo.value = plantilla.nombre;
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
      ejercicios = plantilla.ejercicios.map((e) => ({ id: uid(), nombre: e.nombre, series: [] }));
    }
  }
  const id = await crearEntrenamiento(fechaNuevo.value, tipoNuevo.value.trim(), ejercicios);
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
document.getElementById("btn-progreso").addEventListener("click", irAProgreso);
document.getElementById("btn-volver-progreso").addEventListener("click", irALista);

// ============================================================
// Vista: detalle de un entrenamiento
// ============================================================

const detalleFecha = document.getElementById("detalle-fecha");
const tipoEntrenamiento = document.getElementById("tipo-entrenamiento");
const listaEjercicios = document.getElementById("lista-ejercicios");

function templateSerie(ejercicioId, serie) {
  const partes = [];
  if (serie.peso != null && serie.reps != null) {
    partes.push(`${serie.peso} kg × ${serie.reps} reps`);
  } else if (serie.peso != null) {
    partes.push(`${serie.peso} kg`);
  } else if (serie.reps != null) {
    partes.push(`${serie.reps} reps`);
  }
  if (serie.duracion) partes.push(`${serie.duracion}s`);
  const detalle = partes.join(" · ") || "Serie registrada";

  const pill = serie.sensacion
    ? `<span class="sensacion-pill sensacion-${serie.sensacion}">${SENSACION_LABEL[serie.sensacion]}</span>`
    : "";
  return `
    <li>
      <span class="serie-detalle">${detalle}</span>
      ${pill}
      <button class="btn-borrar-serie" data-ejercicio-id="${ejercicioId}" data-serie-id="${serie.id}" title="Borrar serie">×</button>
    </li>
  `;
}

function templateEjercicio(ej, index, total) {
  const colapsado = colapsados.has(ej.id);
  const totalSeries = ej.series.length;

  return `
    <section class="card ejercicio-card" data-ejercicio-id="${ej.id}">
      <div class="ejercicio-head">
        <button type="button" class="btn-toggle-icono" data-ejercicio-id="${ej.id}" aria-expanded="${!colapsado}" title="${colapsado ? "Expandir" : "Colapsar"}">
          <span class="toggle-icono">${colapsado ? "▸" : "▾"}</span>
        </button>
        <input type="text" class="input-nombre-ejercicio" value="${escapeHtml(ej.nombre)}" data-ejercicio-id="${ej.id}" aria-label="Nombre del ejercicio">
        ${colapsado ? `<span class="ejercicio-resumen">${totalSeries} serie${totalSeries !== 1 ? "s" : ""}</span>` : ""}
        <div class="btn-orden-grupo">
          <button class="btn-orden btn-subir-ejercicio" data-ejercicio-id="${ej.id}" title="Subir" aria-label="Subir ejercicio" ${index === 0 ? "disabled" : ""}>▲</button>
          <button class="btn-orden btn-bajar-ejercicio" data-ejercicio-id="${ej.id}" title="Bajar" aria-label="Bajar ejercicio" ${index === total - 1 ? "disabled" : ""}>▼</button>
        </div>
        <button class="btn-x btn-borrar-ejercicio" data-ejercicio-id="${ej.id}" title="Borrar ejercicio" aria-label="Borrar ejercicio">✕</button>
      </div>

      <div class="ejercicio-contenido ${colapsado ? "hidden" : ""}">
        <ul class="lista-series">
          ${ej.series.map((s) => templateSerie(ej.id, s)).join("") || `<li class="serie-vacia">Sin series todavía.</li>`}
        </ul>

        <form class="form-serie" data-ejercicio-id="${ej.id}">
          <div class="row">
            <input type="number" class="input-peso" placeholder="kg (opcional)" step="0.5" min="0">
            <input type="number" class="input-reps" placeholder="reps (opcional)" min="1">
          </div>
          <input type="number" class="input-duracion" placeholder="Duración (seg, opcional)" min="0" step="1">
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
  const total = entrenamientoActual.ejercicios.length;
  listaEjercicios.innerHTML = entrenamientoActual.ejercicios
    .map((ej, index) => templateEjercicio(ej, index, total))
    .join("");
}

async function renderDetalle() {
  detalleFecha.textContent = formatearFechaConDia(entrenamientoActual.fecha);
  tipoEntrenamiento.value = entrenamientoActual.tipo || "";
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

tipoEntrenamiento.addEventListener("change", async () => {
  entrenamientoActual.tipo = tipoEntrenamiento.value.trim();
  await guardarEntrenamiento(entrenamientoActual);
  await actualizarDatalistSugeridos();
});

tipoEntrenamiento.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tipoEntrenamiento.blur();
});

listaEjercicios.addEventListener("click", async (e) => {
  const btnToggle = e.target.closest(".btn-toggle-icono");
  if (btnToggle) {
    const id = btnToggle.dataset.ejercicioId;
    if (colapsados.has(id)) colapsados.delete(id);
    else colapsados.add(id);
    renderEjercicios();
    return;
  }

  const btnSubir = e.target.closest(".btn-subir-ejercicio");
  const btnBajar = e.target.closest(".btn-bajar-ejercicio");
  if (btnSubir || btnBajar) {
    const id = (btnSubir || btnBajar).dataset.ejercicioId;
    const ejercicios = entrenamientoActual.ejercicios;
    const index = ejercicios.findIndex((ej) => ej.id === id);
    const destino = btnSubir ? index - 1 : index + 1;
    if (destino < 0 || destino >= ejercicios.length) return;
    [ejercicios[index], ejercicios[destino]] = [ejercicios[destino], ejercicios[index]];
    await guardarEntrenamiento(entrenamientoActual);
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
  const pesoValor = form.querySelector(".input-peso").value;
  const repsValor = form.querySelector(".input-reps").value;
  const duracionValor = form.querySelector(".input-duracion").value;
  const peso = pesoValor ? parseFloat(pesoValor) : null;
  const reps = repsValor ? parseInt(repsValor, 10) : null;
  const duracion = duracionValor ? parseInt(duracionValor, 10) : null;
  const sensacion = form.querySelector(".input-sensacion").value;

  if (peso === null && reps === null && duracion === null) {
    alert("Cargá al menos peso, repeticiones o duración.");
    return;
  }

  const ejercicio = entrenamientoActual.ejercicios.find((ej) => ej.id === ejercicioId);
  ejercicio.series.push({ id: uid(), peso, reps, duracion, sensacion });

  await persistirYRenderizar();
});

// Renombrar un ejercicio del entrenamiento sin borrarlo
listaEjercicios.addEventListener("change", async (e) => {
  if (!e.target.matches(".input-nombre-ejercicio")) return;
  const id = e.target.dataset.ejercicioId;
  const ejercicio = entrenamientoActual.ejercicios.find((ej) => ej.id === id);
  if (!ejercicio) return;
  const nuevoNombre = e.target.value.trim() || ejercicio.nombre;
  ejercicio.nombre = nuevoNombre;
  e.target.value = nuevoNombre;
  await guardarEntrenamiento(entrenamientoActual);
  await actualizarDatalistSugeridos();
});

listaEjercicios.addEventListener("keydown", (e) => {
  if (e.target.matches(".input-nombre-ejercicio") && e.key === "Enter") {
    e.target.blur();
  }
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
        ${pl.ejercicios.map((e, index) => `
          <li class="ejercicio-plantilla-item" data-id="${e.id}">
            <input type="text" class="input-nombre-ejercicio-plantilla" value="${escapeHtml(e.nombre)}" data-plantilla-id="${pl.id}" data-ejercicio-id="${e.id}" aria-label="Nombre del ejercicio">
            <div class="btn-orden-grupo">
              <button class="btn-orden btn-subir-ejercicio-plantilla" data-plantilla-id="${pl.id}" data-ejercicio-id="${e.id}" title="Subir" aria-label="Subir ejercicio" ${index === 0 ? "disabled" : ""}>▲</button>
              <button class="btn-orden btn-bajar-ejercicio-plantilla" data-plantilla-id="${pl.id}" data-ejercicio-id="${e.id}" title="Bajar" aria-label="Bajar ejercicio" ${index === pl.ejercicios.length - 1 ? "disabled" : ""}>▼</button>
            </div>
            <button class="btn-borrar-serie btn-quitar-ejercicio-plantilla" data-plantilla-id="${pl.id}" data-ejercicio-id="${e.id}" title="Quitar ejercicio">×</button>
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

// Renombrar plantilla o uno de sus ejercicios (sin borrarlo)
listaPlantillas.addEventListener("change", async (e) => {
  if (e.target.matches(".input-nombre-plantilla")) {
    const id = Number(e.target.dataset.plantillaId);
    const plantilla = plantillasCache.find((p) => p.id === id);
    if (!plantilla) return;
    const nuevoNombre = e.target.value.trim() || plantilla.nombre;
    plantilla.nombre = nuevoNombre;
    e.target.value = nuevoNombre;
    await guardarPlantilla(plantilla);
    return;
  }

  if (e.target.matches(".input-nombre-ejercicio-plantilla")) {
    const plantillaId = Number(e.target.dataset.plantillaId);
    const ejercicioId = e.target.dataset.ejercicioId;
    const plantilla = plantillasCache.find((p) => p.id === plantillaId);
    if (!plantilla) return;
    const ejercicio = plantilla.ejercicios.find((ej) => ej.id === ejercicioId);
    if (!ejercicio) return;
    const nuevoNombre = e.target.value.trim() || ejercicio.nombre;
    ejercicio.nombre = nuevoNombre;
    e.target.value = nuevoNombre;
    await guardarPlantilla(plantilla);
    await actualizarDatalistSugeridos();
  }
});

listaPlantillas.addEventListener("keydown", (e) => {
  if (e.target.matches(".input-nombre-plantilla, .input-nombre-ejercicio-plantilla") && e.key === "Enter") {
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

  const btnSubir = e.target.closest(".btn-subir-ejercicio-plantilla");
  const btnBajar = e.target.closest(".btn-bajar-ejercicio-plantilla");
  if (btnSubir || btnBajar) {
    const boton = btnSubir || btnBajar;
    const plantillaId = Number(boton.dataset.plantillaId);
    const ejercicioId = boton.dataset.ejercicioId;
    const plantilla = plantillasCache.find((p) => p.id === plantillaId);
    if (!plantilla) return;
    const index = plantilla.ejercicios.findIndex((ej) => ej.id === ejercicioId);
    const destino = btnSubir ? index - 1 : index + 1;
    if (destino < 0 || destino >= plantilla.ejercicios.length) return;
    [plantilla.ejercicios[index], plantilla.ejercicios[destino]] = [plantilla.ejercicios[destino], plantilla.ejercicios[index]];
    await guardarPlantilla(plantilla);
    reRenderPlantillaCard(plantilla);
    return;
  }

  if (e.target.matches(".btn-quitar-ejercicio-plantilla")) {
    const plantillaId = Number(e.target.dataset.plantillaId);
    const ejercicioId = e.target.dataset.ejercicioId;
    const plantilla = plantillasCache.find((p) => p.id === plantillaId);
    if (!plantilla) return;
    plantilla.ejercicios = plantilla.ejercicios.filter((ej) => ej.id !== ejercicioId);
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
  plantilla.ejercicios.push({ id: uid(), nombre });
  await guardarPlantilla(plantilla);
  reRenderPlantillaCard(plantilla);
  await actualizarDatalistSugeridos();
});

// ============================================================
// Vista: progreso por ejercicio
// ============================================================

const selectEjercicioProgreso = document.getElementById("select-ejercicio-progreso");
const contenedorProgreso = document.getElementById("contenedor-progreso");
const vacioProgreso = document.getElementById("vacio-progreso");

// Agrupa las series CON PESO por ejercicio, usando el nombre normalizado como clave
// para juntar variantes de mayúsculas/tildes/espacios. Recibe los entrenamientos ya
// ordenados de forma ascendente (mas viejo primero).
function construirMapaProgreso(entrenamientosAsc) {
  const mapa = new Map(); // clave normalizada -> { nombre, puntos: [{fecha, pesoMax}] }

  for (const entrenamiento of entrenamientosAsc) {
    for (const ejercicio of entrenamiento.ejercicios) {
      if (!ejercicio.series.length) continue;
      const pesos = ejercicio.series.map((s) => s.peso).filter((p) => p !== null && p !== undefined && !isNaN(p));
      if (!pesos.length) continue;
      const pesoMax = Math.max(...pesos);

      const clave = normalizarNombre(ejercicio.nombre);
      if (!mapa.has(clave)) mapa.set(clave, { nombre: ejercicio.nombre, puntos: [] });
      const entrada = mapa.get(clave);
      entrada.nombre = ejercicio.nombre;
      entrada.puntos.push({ fecha: entrenamiento.fecha, pesoMax });
    }
  }

  return mapa;
}

async function obtenerDatosProgreso() {
  const entrenamientosAsc = (await obtenerEntrenamientos()).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  return construirMapaProgreso(entrenamientosAsc);
}

// ---------- Estadísticas de baja complejidad: resumen, balance por tipo, récords ----------

// Clave = fecha (lunes) de la semana a la que pertenece una fecha dada, usada para
// agrupar entrenamientos por semana sin necesitar el algoritmo completo de semana ISO.
function claveSemana(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00");
  const diasDesdeElLunes = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diasDesdeElLunes);
  return d.toISOString().slice(0, 10);
}

function calcularRachaSemanas(entrenamientos) {
  if (!entrenamientos.length) return 0;
  const semanas = [...new Set(entrenamientos.map((e) => claveSemana(e.fecha)))].sort().reverse();

  let racha = 1;
  let actual = new Date(semanas[0] + "T00:00:00");
  for (let i = 1; i < semanas.length; i++) {
    const esperada = new Date(actual);
    esperada.setDate(esperada.getDate() - 7);
    const esperadaISO = esperada.toISOString().slice(0, 10);
    if (semanas[i] === esperadaISO) {
      racha++;
      actual = esperada;
    } else {
      break;
    }
  }
  return racha;
}

function renderResumenGeneral(entrenamientos) {
  const totalEntrenamientos = entrenamientos.length;
  const totalSeries = entrenamientos.reduce((acc, e) => acc + e.ejercicios.reduce((a, ej) => a + ej.series.length, 0), 0);
  const volumenTotal = entrenamientos.reduce((acc, e) => acc + e.ejercicios.reduce((a, ej) =>
    a + ej.series.reduce((s, serie) => s + (serie.peso || 0) * (serie.reps || 0), 0), 0), 0);
  const racha = calcularRachaSemanas(entrenamientos);

  document.getElementById("resumen-general-contenido").innerHTML = `
    <div class="progreso-resumen">
      <div><strong>${totalEntrenamientos}</strong><span>entrenamientos</span></div>
      <div><strong>${totalSeries}</strong><span>series totales</span></div>
      <div><strong>${Math.round(volumenTotal).toLocaleString("es-AR")} kg</strong><span>volumen total</span></div>
      <div><strong>${racha}</strong><span>semana${racha !== 1 ? "s" : ""} seguida${racha !== 1 ? "s" : ""}</span></div>
    </div>
  `;
}

function renderBalanceTipo(entrenamientos) {
  const conteo = new Map();
  entrenamientos.forEach((e) => {
    const tipo = e.tipo && e.tipo.trim() ? e.tipo.trim() : "Sin tipo";
    conteo.set(tipo, (conteo.get(tipo) || 0) + 1);
  });

  const contenedor = document.getElementById("balance-tipo-contenido");
  if (!conteo.size) {
    contenedor.innerHTML = `<p class="progreso-nota">Todavía no hay entrenamientos.</p>`;
    return;
  }

  const filas = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  const maximo = filas[0][1];

  contenedor.innerHTML = filas.map(([tipo, cantidad]) => `
    <div class="balance-fila">
      <span class="balance-etiqueta">${escapeHtml(tipo)}</span>
      <div class="balance-barra-fondo"><div class="balance-barra" style="width:${(cantidad / maximo) * 100}%"></div></div>
      <span class="balance-cantidad">${cantidad}</span>
    </div>
  `).join("");
}

function renderRecords(mapaProgreso) {
  const contenedor = document.getElementById("records-contenido");
  const entradas = [...mapaProgreso.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));

  if (!entradas.length) {
    contenedor.innerHTML = `<li class="serie-vacia">Todavía no hay series con peso registradas.</li>`;
    return;
  }

  contenedor.innerHTML = entradas.map(([, entrada]) => {
    const mejorMarca = Math.max(...entrada.puntos.map((p) => p.pesoMax));
    const fecha = entrada.puntos.find((p) => p.pesoMax === mejorMarca).fecha;
    return `
      <li>
        <span>${escapeHtml(entrada.nombre)}</span>
        <span><span class="record-peso">${mejorMarca} kg</span> · ${formatearFechaISO(fecha)}</span>
      </li>
    `;
  }).join("");
}

function generarSvgProgreso(puntos, nombreEjercicio) {
  const W = 600, H = 260;
  const pad = { top: 20, right: 16, bottom: 34, left: 42 };
  const anchoUtil = W - pad.left - pad.right;
  const altoUtil = H - pad.top - pad.bottom;

  const valores = puntos.map((p) => p.pesoMax);
  const yMax = Math.max(...valores) * 1.15 || 10;
  const yMin = 0;

  const x = (i) => pad.left + (puntos.length > 1 ? (i / (puntos.length - 1)) * anchoUtil : anchoUtil / 2);
  const y = (v) => pad.top + altoUtil - ((v - yMin) / (yMax - yMin)) * altoUtil;

  // Lineas de grilla horizontales + etiquetas del eje Y (peso)
  const nLineas = 4;
  let grilla = "";
  for (let i = 0; i <= nLineas; i++) {
    const valor = (yMax / nLineas) * i;
    const yy = y(valor);
    grilla += `<line class="progreso-grid" x1="${pad.left}" y1="${yy}" x2="${W - pad.right}" y2="${yy}" />`;
    grilla += `<text class="progreso-etiqueta-y" x="${pad.left - 8}" y="${yy + 3}" text-anchor="end">${Math.round(valor)}</text>`;
  }

  // Elegimos que fechas mostrar en el eje X para que no se amontonen
  const maxEtiquetas = 6;
  const paso = Math.max(1, Math.ceil(puntos.length / maxEtiquetas));
  let etiquetasX = "";
  puntos.forEach((p, i) => {
    if (i % paso !== 0 && i !== puntos.length - 1) return;
    etiquetasX += `<text class="progreso-etiqueta" x="${x(i)}" y="${H - pad.bottom + 16}" text-anchor="middle">${formatearFechaISO(p.fecha).slice(0, 5)}</text>`;
  });

  const puntosLinea = puntos.map((p, i) => `${x(i)},${y(p.pesoMax)}`).join(" ");

  const circulos = puntos.map((p, i) => `
    <circle class="progreso-punto" cx="${x(i)}" cy="${y(p.pesoMax)}" r="4">
      <title>${formatearFechaISO(p.fecha)} · ${p.pesoMax} kg</title>
    </circle>
  `).join("");

  const linea = puntos.length > 1
    ? `<polyline class="progreso-linea" points="${puntosLinea}" />`
    : "";

  return `
    <svg class="progreso-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Progreso de ${escapeHtml(nombreEjercicio)}">
      ${grilla}
      <line class="progreso-eje" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${H - pad.bottom}" />
      <line class="progreso-eje" x1="${pad.left}" y1="${H - pad.bottom}" x2="${W - pad.right}" y2="${H - pad.bottom}" />
      ${linea}
      ${circulos}
      ${etiquetasX}
    </svg>
  `;
}

function renderGraficoProgreso(entrada) {
  const puntos = entrada.puntos;
  const mejorMarca = Math.max(...puntos.map((p) => p.pesoMax));
  const mejorFecha = puntos.find((p) => p.pesoMax === mejorMarca).fecha;

  if (puntos.length < 2) {
    contenedorProgreso.innerHTML = `
      ${generarSvgProgreso(puntos, entrada.nombre)}
      <p class="progreso-nota">Necesitás al menos 2 entrenamientos con este ejercicio para ver una tendencia. Por ahora hay ${puntos.length}.</p>
    `;
    return;
  }

  contenedorProgreso.innerHTML = `
    ${generarSvgProgreso(puntos, entrada.nombre)}
    <div class="progreso-resumen">
      <div><strong>${mejorMarca} kg</strong><span>mejor marca (${formatearFechaISO(mejorFecha)})</span></div>
      <div><strong>${puntos.length}</strong><span>sesiones registradas</span></div>
    </div>
  `;
}

async function renderProgresoView() {
  const entrenamientos = await obtenerEntrenamientos();
  const entrenamientosAsc = entrenamientos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const mapa = construirMapaProgreso(entrenamientosAsc);

  renderResumenGeneral(entrenamientos);
  renderBalanceTipo(entrenamientos);
  renderRecords(mapa);

  const entradas = [...mapa.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));

  if (!entradas.length) {
    selectEjercicioProgreso.innerHTML = "";
    contenedorProgreso.innerHTML = "";
    vacioProgreso.classList.remove("hidden");
    return;
  }
  vacioProgreso.classList.add("hidden");

  const seleccionPrevia = selectEjercicioProgreso.value;
  selectEjercicioProgreso.innerHTML = entradas
    .map(([clave, e]) => `<option value="${escapeHtml(clave)}">${escapeHtml(e.nombre)} (${e.puntos.length})</option>`)
    .join("");

  const claveAMostrar = entradas.some(([clave]) => clave === seleccionPrevia) ? seleccionPrevia : entradas[0][0];
  selectEjercicioProgreso.value = claveAMostrar;
  renderGraficoProgreso(mapa.get(claveAMostrar));
}

selectEjercicioProgreso.addEventListener("change", async () => {
  const mapa = await obtenerDatosProgreso();
  const entrada = mapa.get(selectEjercicioProgreso.value);
  if (entrada) renderGraficoProgreso(entrada);
});

// ============================================================
// Exportar / Importar
// ============================================================

function descargarEntrenamientosComoJSON(entrenamientos) {
  const blob = new Blob([JSON.stringify(entrenamientos, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entrenamientos-${hoyISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("btn-export").addEventListener("click", async () => {
  const entrenamientos = await obtenerEntrenamientos();
  descargarEntrenamientosComoJSON(entrenamientos);
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

// ---------- Vaciar historial completo ----------

const btnVaciarHistorial = document.getElementById("btn-vaciar-historial");
const panelVaciarHistorial = document.getElementById("panel-vaciar-historial");
const vaciarAviso = document.getElementById("vaciar-aviso");
const checkExportarAntes = document.getElementById("check-exportar-antes");

btnVaciarHistorial.addEventListener("click", async () => {
  const entrenamientos = await obtenerEntrenamientos();
  if (!entrenamientos.length) return;
  vaciarAviso.textContent = `Esto va a borrar los ${entrenamientos.length} entrenamientos guardados. No se puede deshacer.`;
  checkExportarAntes.checked = true;
  panelVaciarHistorial.classList.remove("hidden");
  btnVaciarHistorial.classList.add("hidden");
});

document.getElementById("btn-cancelar-vaciar").addEventListener("click", () => {
  panelVaciarHistorial.classList.add("hidden");
  btnVaciarHistorial.classList.remove("hidden");
});

document.getElementById("btn-confirmar-vaciar").addEventListener("click", async () => {
  const entrenamientos = await obtenerEntrenamientos();
  const exportarAntes = checkExportarAntes.checked;

  if (exportarAntes) {
    descargarEntrenamientosComoJSON(entrenamientos);
    // pequeña espera para darle tiempo al navegador a disparar la descarga antes de vaciar
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await vaciarEntrenamientos();
  panelVaciarHistorial.classList.add("hidden");
  btnVaciarHistorial.classList.remove("hidden");
  await renderLista();
  alert(exportarAntes ? "Historial vaciado. Se descargó una copia de seguridad." : "Historial vaciado.");
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