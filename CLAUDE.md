# Gym Tracker

## Objetivo

PWA offline para registrar entrenamientos, ejercicios y series, almacenar los datos localmente y consultar progreso histórico.

Stack:
- HTML
- CSS
- JavaScript vanilla
- IndexedDB
- Service Worker
- PWA

No agregar frameworks ni dependencias salvo solicitud explícita.

---

# Archivos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Estructura HTML y vistas |
| `style.css` | Estilos |
| `app.js` | Lógica principal, estado, IndexedDB, renderizado y eventos |
| `manifest.json` | Configuración PWA |
| `sw.js` | Caché/offline |
| `icon.svg` | Icono |

La mayor parte de la aplicación está concentrada en `app.js`.

**Importante:** `app.js` está organizado por secciones funcionales. Para cambios localizados, modificar solamente la sección relacionada.

---

# Mapa de `app.js`

## 1. Persistencia / IndexedDB

Configuración actual:

```text
DB_NAME = "entrenamiento-db"
DB_VERSION = 3

STORE = "entrenamientos"
STORE_PLANTILLAS = "plantillas"
```

Modelo:

```text
Entrenamiento
├── id
├── fecha
├── tipo
└── ejercicios[]
    ├── id
    ├── nombre
    └── series[]
        ├── id
        ├── peso
        ├── reps
        ├── duracion
        └── sensacion
```

Plantilla:

```text
Plantilla
├── id
├── nombre
└── ejercicios[]
    ├── id
    └── nombre
```

Funciones principales:

```text
uid
abrirDB
crearEntrenamiento
obtenerEntrenamientos
obtenerEntrenamiento
guardarEntrenamiento
borrarEntrenamiento
reemplazarTodo
vaciarEntrenamientos
```

También existen funciones de persistencia específicas para plantillas:

```text
obtenerPlantillas
obtenerPlantilla
guardarPlantilla
borrarPlantilla
```

### Regla crítica

No modificar:

- `DB_VERSION`
- stores
- estructura de datos
- migraciones

salvo que sea imprescindible para la funcionalidad solicitada.

Si una funcionalidad requiere nuevos datos persistentes, evaluar primero si puede implementarse sin modificar el esquema existente.

---

# 2. Utilidades

Funciones/utilidades relevantes:

```text
uid
escapeHtml
ej
```

También existen constantes y utilidades relacionadas con:

```text
tipos de entrenamiento
sensaciones
fechas
nombres de días
datos sugeridos
```

No modificar utilidades globales para resolver un problema que pueda solucionarse localmente.

---

# 3. Estado y navegación

Estado global:

```text
entrenamientoActual
colapsados
colapsadosPlantillas
plantillasCache
```

Vistas:

```text
viewLista
viewDetalle
viewPlantillas
viewProgreso
```

Funciones:

```text
ocultarTodasLasVistas
pushEstado
irALista
irADetalle
irAPlantillas
irAProgreso
```

También existe integración con:

```text
history.replaceState
history.pushState
popstate
history.back
```

### No tocar navegación

Una tarea localizada normalmente NO requiere modificar esta sección.

---

# 4. Lista de entrenamientos

Sección:

```text
// Vista: lista de entrenamientos
```

Elementos principales:

```text
listaEntrenamientos
vacio
btnNuevo
formNuevoWrap
fechaNuevo
tipoNuevo
plantillaNuevo
zonaPeligro
```

Función principal:

```text
renderLista
```

La creación de entrenamientos utiliza:

```text
crearEntrenamiento
irADetalle
```

La lista también contiene acciones de:

```text
abrir entrenamiento
crear entrenamiento
exportar
importar
vaciar historial
```

No modificar esta sección si la tarea afecta exclusivamente al detalle de un entrenamiento.

---

# 5. Detalle de entrenamiento

Sección:

```text
// Vista: detalle de un entrenamiento
```

Elementos principales:

```text
fechaEntrenamiento
detalleDiaSemana
tipoEntrenamiento
listaEjercicios
```

Funciones de renderizado:

```text
templateSerie
templateEjercicio
renderEjercicios
renderDetalle
persistirYRenderizar
```

### Serie

Actualmente una serie puede contener:

```text
peso
reps
duracion
sensacion
```

`templateSerie` genera la representación visual de una serie.

### Ejercicio

`templateEjercicio` genera:

```text
cabecera del ejercicio
nombre
colapsado/expandido
orden
eliminación
lista de series
formulario para agregar serie
```

### Persistencia

El flujo habitual de modificación es:

```text
modificar entrenamientoActual
→ guardarEntrenamiento
→ renderDetalle
```

Cuando sea posible, mantener este patrón.

---

# 6. Eventos del detalle

Los eventos del detalle se gestionan principalmente mediante listeners sobre:

```text
form-ejercicio
listaEjercicios
tipoEntrenamiento
fechaEntrenamiento
```

Las acciones incluyen:

```text
agregar ejercicio
borrar entrenamiento
cambiar tipo
cambiar fecha
colapsar/expandir ejercicio
subir ejercicio
bajar ejercicio
borrar ejercicio
agregar serie
borrar serie
editar datos
```

Para modificar una acción existente, localizar primero su event listener específico.

No reescribir todo el bloque de eventos.

---

# 7. Plantillas

Sección de plantillas:

```text
view-plantillas
listaPlantillas
vacioPlantillas
```

Estado:

```text
colapsadosPlantillas
plantillasCache
```

Funciones principales:

```text
renderPlantillasView
templatePlantilla
reRenderPlantillaCard
```

Persistencia:

```text
obtenerPlantillas
obtenerPlantilla
guardarPlantilla
borrarPlantilla
```

Las plantillas permiten:

```text
crear
renombrar
agregar ejercicio
quitar ejercicio
renombrar ejercicio
reordenar ejercicios
borrar
colapsar/expandir
```

### Regla

No modificar plantillas cuando una funcionalidad no dependa de ellas.

---

# 8. Datos sugeridos

Existe lógica compartida para construir sugerencias de:

```text
nombres de ejercicios
tipos de entrenamiento
```

Utilizada mediante elementos `datalist`.

La actualización se realiza mediante:

```text
actualizarDatalistSugeridos
```

Si una modificación cambia nombres de ejercicios o plantillas, comprobar si es necesario actualizar esta función.

---

# 9. Progreso

Sección:

```text
// Vista: progreso por ejercicio
```

Funciones principales:

```text
construirMapaProgreso
obtenerDatosProgreso
renderProgresoView
renderGraficoProgreso
```

También existen funciones para:

```text
claveSemana
calcularRachaSemanas
renderResumenGeneral
renderBalanceTipo
renderRecords
```

El progreso utiliza los entrenamientos almacenados y calcula métricas según los datos disponibles de cada ejercicio.

### Regla

No modificar la lógica de progreso para implementar funcionalidades que solamente afecten al registro de entrenamientos.

Si se modifica la estructura de una serie, verificar si progreso necesita soportar el nuevo campo, pero no cambiar su comportamiento sin necesidad.

---

# 10. Importación / exportación

Funciones:

```text
descargarEntrenamientosComoJSON
reemplazarTodo
```

Elementos:

```text
btn-export
input-import
```

También existe:

```text
btn-vaciar-historial
panel-vaciar-historial
vaciarAviso
checkExportarAntes
btn-confirmar-vaciar
```

### Compatibilidad

Cualquier modificación al modelo de entrenamiento debe considerar:

```text
exportación JSON
importación JSON
datos existentes en IndexedDB
```

No romper archivos JSON previamente exportados salvo que sea estrictamente necesario.

---

# 11. PWA / Service Worker

`sw.js` actualmente cachea:

```text
./
./index.html
./style.css
./app.js
./manifest.json
./icon.svg
```

Cache actual:

```text
entreno-cache-v25
```

`app.js` también registra el Service Worker y actualiza:

```text
status-pill
```

### Regla

No modificar:

```text
sw.js
manifest.json
icon.svg
```

para una funcionalidad normal de la aplicación.

Solo hacerlo si la tarea requiere específicamente cambios en PWA/offline/cache.

---

# Reglas de modificación

## Alcance mínimo

Modificar solamente lo necesario para cumplir la solicitud.

No hacer:

- refactoring no solicitado
- reorganización de archivos
- cambio de arquitectura
- limpieza general
- renombrado de funciones
- mejoras de código no relacionadas
- cambios visuales no solicitados

---

## No reescribir archivos completos

Preferir modificaciones puntuales.

Especialmente:

```text
app.js
index.html
style.css
```

No regenerar un archivo completo cuando puede modificarse una sección concreta.

---

## No explorar todo el proyecto innecesariamente

Para una tarea localizada:

1. Identificar la sección relevante.
2. Localizar las funciones implicadas.
3. Leer solamente el código necesario.
4. Modificarlo.
5. Verificar el resultado.

No analizar todas las vistas si la tarea solo afecta una.

---

# Mapa rápido para decidir dónde buscar

```text
¿Persistencia?
→ IndexedDB / funciones de persistencia

¿Agregar o modificar una serie?
→ templateSerie
→ templateEjercicio
→ formulario de serie
→ eventos de listaEjercicios
→ guardarEntrenamiento

¿Agregar o modificar un ejercicio?
→ templateEjercicio
→ renderEjercicios
→ eventos de listaEjercicios

¿Modificar lista principal?
→ renderLista
→ eventos de listaEntrenamientos

¿Modificar navegación?
→ irALista
→ irADetalle
→ irAPlantillas
→ irAProgreso
→ popstate

¿Modificar plantillas?
→ renderPlantillasView
→ templatePlantilla
→ reRenderPlantillaCard
→ eventos de listaPlantillas

¿Modificar estadísticas?
→ obtenerDatosProgreso
→ construirMapaProgreso
→ renderProgresoView
→ renderGraficoProgreso
→ estadísticas auxiliares

¿Modificar import/export?
→ descargarEntrenamientosComoJSON
→ input-import
→ reemplazarTodo

¿Modificar offline/PWA?
→ sw.js
→ manifest.json
```

---

# Reglas para Claude Code

## Antes de modificar

No comenzar haciendo un análisis general del proyecto.

Primero identificar:

```text
1. archivo afectado
2. sección afectada
3. funciones afectadas
4. datos afectados
```

Luego modificar directamente.

Si la tarea es ambigua y puede afectar varias áreas, determinar primero el alcance mínimo necesario.

---

## Durante la modificación

Prioridades:

```text
1. funcionalidad solicitada
2. conservar comportamiento existente
3. modificar la menor cantidad de código
4. evitar cambios no relacionados
5. mantener compatibilidad con datos existentes
```

No introducir abstracciones nuevas si no son necesarias.

No dividir `app.js` en módulos salvo solicitud explícita.

---

## Después de modificar

Realizar únicamente las comprobaciones relevantes:

```text
- sintaxis JavaScript
- referencias a IDs/clases modificados
- errores obvios
- coherencia entre lectura/escritura de datos
- compatibilidad con datos existentes
```

No ejecutar procesos innecesarios ni analizar archivos no afectados.

---

# Restricciones

No agregar dependencias.

No cambiar el stack.

No cambiar la arquitectura.

No modificar IndexedDB salvo necesidad.

No modificar PWA salvo necesidad.

No modificar funcionalidades no relacionadas.

No hacer refactoring preventivo.

No reescribir archivos completos.

---

# Respuesta final

Al terminar, responder brevemente:

```text
Cambios:
- archivo: cambio
- archivo: cambio

Verificación:
- comprobación realizada

No se modificó:
- área no relacionada
```

No mostrar archivos completos ni grandes bloques de código salvo solicitud explícita.