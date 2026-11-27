# Conciliación autónoma Wix → planillas (versión 2: propuesta validada, no instalada)

Monitor que comprueba que cada solicitud enviada en Wix tenga su fila en la planilla que escribe su
automatización. Funciona con el computador apagado y sin Claude Code abierto. Reemplaza la tarea local
`conciliacion-artistas-wix` (Registro N.º 122 y 125), que solo corre con la aplicación de escritorio abierta.

**Estado:**
- **Validada:** la lógica, con datos reales capturados en modo lectura el 22-11-2026. Se probaron 23 casos. Los controles 7 a 9 (agenda) y 12 a 16 (calendario) son comprobaciones a pedido, no monitoreo permanente.
- **Pendiente:** la prueba en Apps Script real, que requiere la clave de Wix y la instalación por el
  propietario (sección «Plan de pruebas reales»). No hay ningún activador instalado.

## Criterios de conciliación

| Formulario | Fuente del envío | Criterio verificable | Resultado posible |
|---|---|---|---|
| Nuevos (General; Villancicos y Corporativo cuando se activen) | API de formularios de Wix | El **ID del envío** aparece en la columna donde la automatización lo escribe. Solo se exigen envíos **posteriores a la creación** de la automatización | `CONCILIADO`, `SIN FILA`, `RECIENTE` (menos de 30 min), `EXCLUIDO` (prueba documentada) o `FUERA DE COBERTURA` |
| Antiguos (Reserva Cueca y Boleros «Reserva Al Lote 2», identificador `comp-…`) | Aviso de correo de Wix: ID de mensaje de Gmail, incluida la carpeta de spam | **Uno a uno:** el aviso se empareja con una fila con el mismo teléfono (8 últimos dígitos) y la misma fecha del evento normalizada (sin tildes, día de la semana ni «de»). Si hay varias candidatas, el nombre decide. Una fila emparejada no se vuelve a usar | `CONCILIADO`; `REVISAR` (coinciden teléfono y nombre, pero no la fecha); `SIN FILA` (ninguna fila con ese teléfono); `ILEGIBLE` (no se pudo leer teléfono o fecha); `EXCLUIDO` |
| Las 7 automatizaciones | API de automatizaciones de Wix | Estado, revisión y cuenta de Google frente a lo esperado en la primera lectura y frente a la lectura anterior después | Alerta una sola vez por cambio |

**Por qué no basta con contar:** en los datos reales, un cliente recurrente tiene 3 filas, de 2024 y 2026.
Solo la fecha del evento identifica la fila correcta; un conteo o una coincidencia por nombre la habría dado
por buena equivocadamente.

**Límites del criterio para formularios antiguos:**
- Si el equipo corrige a mano el teléfono o la fecha en la planilla, aparece `REVISAR` o `SIN FILA`. Son
  falsos positivos, pero visibles.
- Un cliente que repite la misma fecha escrita igual en años distintos podría emparejarse con una fila
  antigua. El riesgo es bajo, y se reduce porque cada fila se usa una sola vez y queda registro de los usos.
- Si Wix cambia la plantilla del aviso, todo pasa a `ILEGIBLE` y alerta; nunca se da por conciliado en
  silencio.
- Requiere que los avisos lleguen al buzón de la cuenta que ejecuta el script (decisión 31).
- La solución de fondo es migrar esos dos formularios a Wix Forms nuevo, que entrega un ID por envío.

## Revisión de seguridad y robustez

| Tema | Hallazgo | Estado en v2 |
|---|---|---|
| Permiso de Wix | **No existe permiso de solo lectura para envíos de formularios.** La consulta exige «Manage form submissions» (`forms:v4:submission:query_submissions_by_namespace`), que también permite modificarlos. Las automatizaciones sí tienen lectura (`AUTOMATIONS.AUTOMATION_READ`). Una clave de API no está ligada a un sitio | Riesgo aceptado con mitigación. La clave va solo en Propiedades del script, de un proyecto que pertenece únicamente a la cuenta corporativa (con verificación en 2 pasos). Se debe limitar al sitio si el panel lo permite, rotar cada 6 meses o ante cambios de personal, y revocar al desinstalar |
| Google | `spreadsheets` da acceso a todas las planillas de la cuenta (no se puede limitar por archivo al abrirlas por ID). Gmail se lee con `gmail.readonly` mediante el servicio avanzado, no con `GmailApp`, que exige acceso completo | Mitigado. El código solo escribe en «Conciliación» y la reproducción verifica que no escribe en otras planillas |
| Datos personales | v1 guardaba en memoria los valores de cada envío | Eliminado. Los cuerpos de los avisos se procesan en memoria. En filas y correos solo quedan ID, fechas y clasificaciones |
| Spam | v1 no veía la carpeta de spam | La búsqueda usa `in:anywhere` |
| Primera ejecución | v1 aceptaba como línea base lo que encontrara | Compara con lo esperado en la configuración (estado, revisión y cuenta) |
| Falsas alertas | Envíos anteriores a la automatización y pruebas documentadas | Cobertura desde la creación de cada automatización, más la lista `EXCLUIDOS` |
| Idempotencia | Filas y correos podían repetirse ante fallas parciales | Cada alerta lleva una clave. El orden es fila, luego estado, luego correo. Probado con una falla de correo simulada |
| Errores | Un error persistente enviaba un correo cada 30 minutos | Se silencia 6 horas por error idéntico; los contadores aparecen en el resumen diario |
| Límites de API | Más de 500 envíos se truncaban y la marca avanzaba igual | Hasta 10 páginas. Si la ventana queda incompleta, se advierte y la marca no avanza. Hay reintentos ante 429 y 5xx |
| Concurrencia | — | `LockService`: una sola ejecución a la vez |
| Control de ejecuciones | — | `LATIDO`, contadores de ejecuciones y errores, registro de ejecuciones de Apps Script y correo diario (si falta, hay alarma). Desde el 26-11, además, una fila diaria «Monitor (latido diario)» en «Conciliación», idempotente por día |
| Error de rango | v1 podía omitir la última fila al revisar duplicados | Corregido |
| Fuga de la clave en mensajes de error (23-11) | Si Wix repitiera la clave en una respuesta 4xx, el texto (recortado a 200 caracteres) llegaba a la fila de error, al correo y a `ULTIMO_ERROR` | `ocultarClave_` la quita antes de recortar. Prueba con clave centinela: 7 de 7 (antes, 3 de 7) |
| Calendario (controles 12 a 16; preparado el 26-11) | El calendario operativo será de la cuenta corporativa (`trazabilidad/DISENO_CALENDAR.md`, sección 5) | `Calendario.gs`: solo lectura y a pedido (`revisionCalendarioSoloLectura`), sin activador. No lee invitados ni ubicación; las alertas llevan solo ID de reserva y fechas; en Propiedades guarda solo identificadores de evento, y solo si se pide. **No está en el manifiesto**: el servicio avanzado Calendar y `calendar.readonly` se agregan en la etapa 2, con autorización |
| Trazabilidad (decisión 49) | Los controles 7 a 9 cruzan con la agenda, que es otra planilla | `Trazabilidad.gs`: solo lectura, en el resumen diario. Lee de la agenda solo FECHA, HORARIO, VALOR e ID RESERVA, y las excepciones `EXC-` de la pestaña «Control» del CRM. Si la agenda falla, se avisa sin detener la conciliación |

## Plan de pruebas reales en Apps Script (con la cuenta corporativa)

Permisos, credencial, frecuencia, límites, desinstalación y resultados esperados de cada paso: ver
[`ENTORNO_DE_PRUEBA.md`](ENTORNO_DE_PRUEBA.md).

| Paso | Acción | Criterio de aceptación | Escribe |
|---|---|---|---|
| P0 | El propietario crea la clave de API de Wix (envíos de formularios y lectura de automatizaciones) y la guarda en Propiedades del script como `WIX_API_KEY`. **Nunca en el chat, el código, el Registro ni el repositorio** | La clave está en Propiedades | — |
| P1 | Copiar `Conciliacion.gs`, `appsscript.json` y `Config.gs` (desde el ejemplo, con los ID del Registro N.º 152 y 154). Para los formularios antiguos, dejar `legado` solo si ya se resolvió la decisión 31 | El proyecto guarda sin errores | — |
| P2 | Ejecutar `diagnosticoCredenciales()` | `envios`, `automatizaciones`, `gmail` y `registro` en «OK» | No |
| P3 | Ejecutar `validacionSoloLectura(260)` y comparar con la reproducción del Registro N.º 154 | General 25 de 25, más 94 fuera de cobertura; automatizaciones sin cambios. Formularios antiguos: Boleros 11 + 1 `SIN FILA` (aviso 1a01a43bd1ed7323) y Cuecas 2 + 2 excluidos, si el buzón tiene esos avisos | No |
| P4 | Comprobar que P2 y P3 no escribieron nada | Mismas filas en «Conciliación»; Propiedades solo con `WIX_API_KEY`; ningún correo | — |
| P5 | Ejecutar `pruebaAlertaControlada()` dos veces | 1 fila «PRUEBA» y 2 correos en la bandeja de entrada corporativa (no en spam). Borrar la fila después | Solo «Conciliación» |
| P6 | Ejecutar `instalarActivadores()` y, a los 30 minutos, revisar el registro de ejecuciones | Ejecución correcta, `LATIDO` reciente y 0 alertas | Solo «Conciliación» |
| P7 | 7 días en paralelo con la revisión actual | Resultados iguales y ninguna alerta falsa. Recién entonces se retira la tarea local | Solo «Conciliación» |

## Recuperación ante una alerta

- **`SIN FILA` (formulario nuevo):**
  1. Abrir el envío en el panel de Wix (Formularios → envíos) por su ID.
  2. Confirmar que falta la fila buscando el ID en la planilla.
  3. Reingresarla con el mismo mapeo de la automatización, a mano o por Claude con autorización.
  4. Documentarla en el Registro.
- **`SIN FILA` o `REVISAR` (formulario antiguo):** abrir el aviso de Gmail por su ID, buscar en la planilla
  por teléfono y fecha, y corregir o reingresar la fila.
- **`ILEGIBLE`:** revisar si Wix cambió la plantilla del aviso y ajustar las etiquetas en `buscarAvisos_`.
- **Cambio de automatización:** verificar en Wix quién lo hizo y por qué. Si no estaba autorizado,
  restaurarlo desde el respaldo de configuración (Registro N.º 100).

## Reversión

Ejecutar `desinstalarActivadores()`, o borrar el proyecto, y revocar la clave de API de Wix. No deja cambios
en Wix, en el CRM ni en las planillas, salvo las filas agregadas a «Conciliación».

## Validación con datos reales (22-11-2026)

Se ejecutó el código real de `Conciliacion.gs` con los servicios sustituidos por datos reales capturados en
modo lectura:
- 128 envíos de Wix y las 8 automatizaciones.
- La columna de ID del CRM.
- Las planillas «Reserva Pagina» y « Eventos».
- Los 16 avisos de los formularios antiguos de 2026.

| Escenario | Resultado |
|---|---|
| General | 25 de 25; 94 envíos fuera de cobertura |
| Cuecas | 2 conciliados y 2 pruebas excluidas |
| Boleros | 11 conciliados y 1 sin fila, el caso ya documentado del 19-08 |
| Carga histórica (Villancicos y Corporativo como si estuvieran activas) | 4 de 4 y 3 de 3 |
| Fallas inyectadas | Fila quitada del CRM, fila quitada de Boleros, fecha editada, cambio de revisión o de cuenta, plantilla cambiada: todas detectadas |
| Idempotencia y falla de correo | Correctas |
| Modo validación | Sin escrituras |
| Prueba controlada | Idempotente |

Resultado: **23 de 23**. Los datos de prueba contienen datos personales, así que no se incluyeron en el
repositorio.

**Pruebas adicionales (23-11-2026)**, con los cambios de esta fecha:

| Prueba | Resultado |
|---|---|
| Reproducción anterior (regresión) | 23 de 23 |
| Clave centinela (401, 503, falla de red, resumen, validación y diagnóstico) | 7 de 7 |
| `Trazabilidad.gs` con las fechas y valores reales de la agenda: excepciones `EXC-` en «Control» (vigente, cerrada, anulada, fila modificada, filas insertadas), `PREVIO` rechazado en Q, varias fechas, ID mal escrito o inexistente, reservas sin fila, filas nuevas, fecha ilegible, no repetir alertas y agenda inaccesible | 17 de 17 |

**Pruebas del 26-11-2026** (`Calendario.gs`, más la regresión de los otros archivos):

| Prueba | Resultado |
|---|---|
| Controles 12 a 16 con los 7 eventos reales del 26-11 reducidos a hora y valor, más casos inyectados: sin ID, ID inexistente, duplicado, sufijos -1 y -2, cambio de fecha, hora y precio, evento eliminado o cancelado, reserva Cancelada con evento activo, `[CANCELADA]`, evento ajeno, ventana de fechas, propiedad privada, ID en la descripción y alertas sin datos personales | 18 de 18 |
| Regresión: reproducción 23 de 23, clave centinela 7 de 7 (con los tres archivos cargados juntos) y trazabilidad 17 de 17 | Sin cambios |

**Pruebas del 26-11-2026, segunda tanda** (fila de latido diario en `Conciliacion.gs`):

| Prueba | Resultado |
|---|---|
| Reproducción con datos reales: 2 expectativas ajustadas (el resumen ahora escribe además la fila de latido) y 1 caso nuevo (un segundo resumen el mismo día no repite el latido) | 24 de 24 |
| Clave centinela, con los tres archivos cargados juntos | 7 de 7 |
| Trazabilidad: 2 expectativas ajustadas por la fila de latido | 17 de 17 |
| Calendario (sin cambios de código) | 18 de 18 |
