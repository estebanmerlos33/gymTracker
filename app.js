// ---------- Capa de persistencia: IndexedDB ----------

const DB_NAME = "entrenamiento-db";
const STORE = "series";
let dbPromise;

function abrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("por_fecha", "fecha");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function guardarSerie(serie) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(serie);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function obtenerSeries() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha - a.fecha));
    req.onerror = () => reject(req.error);
  });
}

async function borrarSerie(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function reemplazarTodo(series) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const s of series) {
      const { id, ...resto } = s; // el id lo regenera autoIncrement
      store.add(resto);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- UI ----------

const form = document.getElementById("form-serie");
const lista = document.getElementById("lista-series");
const vacio = document.getElementById("vacio");
const datalist = document.getElementById("ejercicios-sugeridos");

function formatearFecha(ts) {
  return new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function render(series) {
  lista.innerHTML = "";
  vacio.style.display = series.length ? "none" : "block";

  const nombres = new Set();

  for (const s of series) {
    nombres.add(s.ejercicio);

    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <div class="serie-nombre">${s.ejercicio}</div>
        <div class="serie-detalle">${s.peso} kg × ${s.reps} reps</div>
      </div>
      <div style="text-align:right">
        <div class="serie-fecha">${formatearFecha(s.fecha)}</div>
        <button class="btn-borrar" data-id="${s.id}">borrar</button>
      </div>
    `;
    lista.appendChild(li);
  }

  datalist.innerHTML = [...nombres].map(n => `<option value="${n}">`).join("");
}

async function recargar() {
  const series = await obtenerSeries();
  render(series);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ejercicio = document.getElementById("ejercicio").value.trim();
  const peso = parseFloat(document.getElementById("peso").value);
  const reps = parseInt(document.getElementById("reps").value, 10);

  await guardarSerie({ ejercicio, peso, reps, fecha: Date.now() });
  form.reset();
  document.getElementById("ejercicio").focus();
  await recargar();
});

lista.addEventListener("click", async (e) => {
  if (e.target.matches(".btn-borrar")) {
    await borrarSerie(Number(e.target.dataset.id));
    await recargar();
  }
});

// ---------- Exportar / Importar ----------

document.getElementById("btn-export").addEventListener("click", async () => {
  const series = await obtenerSeries();
  const blob = new Blob([JSON.stringify(series, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entrenamientos-${new Date().toISOString().slice(0, 10)}.json`;
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
    await recargar();
    alert(`Se importaron ${datos.length} series.`);
  } catch (err) {
    alert("No se pudo leer el archivo. ¿Es un export válido de esta app?");
  }
  e.target.value = "";
});

// ---------- Storage persistente (pide que el navegador no borre por las suyas) ----------

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

// ---------- Service Worker ----------

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

// ---------- Arranque ----------

recargar();
