# Entorno de prueba real de Apps Script (sin activadores)

Guía para validar `Conciliacion.gs` versión 2 en Apps Script real **antes** de instalarla. Las pruebas de
esta guía no crean activadores. Solo `pruebaAlertaControlada()` escribe, y lo hace en la pestaña
«Conciliación» del Registro.

## 1. Cuenta y archivos

- **Cuenta:** la corporativa de Artistas a Domicilio, propietaria del Registro, del CRM, de «Los de la Quinta»
  y de « Eventos a Domicilio».
- **Proyecto:** uno independiente, «Conciliación Wix → planillas (PRUEBA)», que no se comparte con nadie más.
- **Archivos:**
  - `Conciliacion.gs`, desde este repositorio.
  - `Trazabilidad.gs`, con los controles 7 a 9 de la decisión 49. Solo actúa si `Config.gs` tiene
    `TRAZABILIDAD`; hasta ejecutar esa decisión, se deja comentado.
  - `Config.gs`: el propietario recibe una versión ya completada con los ID del Registro, fuera del
    repositorio. Esa versión **no contiene la clave**.
  - `appsscript.json`, que reemplaza el manifiesto (Configuración del proyecto → mostrar el manifiesto).
    Activa el servicio avanzado Gmail v1.

## 2. Permisos requeridos

| Permiso (alcance OAuth) | Para qué | Riesgo y mitigación |
|---|---|---|
| `spreadsheets` | Leer las columnas de coincidencia del CRM y de las planillas antiguas; escribir solo en «Conciliación» | Da acceso a todas las planillas de la cuenta. Apps Script no puede limitarlo por archivo al abrir por ID. El código está revisado y la reproducción comprobó que no escribe en otras |
| `gmail.readonly` (servicio avanzado Gmail) | Leer los avisos «Nuevo envío de…» de los formularios antiguos | Lee el buzón corporativo, pero solo busca esos asuntos. Los cuerpos se procesan en memoria y no se guardan |
| `script.external_request` | Llamar a la API de Wix | Solo se llama a `www.wixapis.com` |
| `script.send_mail` | Enviar alertas y el resumen diario a la cuenta corporativa | Como máximo unos pocos correos al día |
| `script.scriptapp` | Instalar y desinstalar activadores | No se usa en esta prueba |

## 3. Credencial de Wix (la configura el propietario)

1. **Quién:** solo el propietario o un copropietario de la cuenta de Wix puede generar claves de API
   ([guía oficial](https://dev.wix.com/docs/api-reference/articles/authentication/api-keys/generate-an-api-key)).
2. **Permisos mínimos:** envíos de formularios y lectura de automatizaciones. Wix **no ofrece lectura sola**
   para los envíos: el mínimo es «Manage form submissions», que también permite modificarlos. Si el panel
   permite limitar la clave a un sitio, limitarla a Artistasadomicilio.
3. **Dónde se guarda:** en Apps Script, Configuración del proyecto → Propiedades del script, con el nombre
   `WIX_API_KEY`. **Nunca** en el chat, el código, `Config.gs`, el Registro ni el repositorio.
4. **Rotación:** cada 6 meses, cuando cambie el personal o ante cualquier sospecha.
5. **Revocación:** borrar la clave en el panel de Wix al desinstalar.

`diagnosticoCredenciales()` informa si la clave existe y su largo, pero nunca la muestra.

**Auditoría del manejo de la clave (23-11-2026)**

- **Único lugar de almacenamiento:** Propiedades del script. `Config.gs` solo la lee con `getProperty`.
- **Único uso:** la cabecera `Authorization` de las llamadas a `www.wixapis.com`. No se escribe en el
  registro de ejecución, ni en filas, ni en correos, ni en otras propiedades.
- **Error de Wix que repita la clave:** se la quita antes de recortar el texto (`ocultarClave_`), en errores,
  filas, correos, el diagnóstico y `ULTIMO_ERROR`.
- **Prueba con una clave centinela:** 7 de 7 casos (401, 503, falla de red, resumen, validación y
  diagnóstico). Antes de la corrección fallaban 4: la clave habría llegado a la fila de error, al correo y al
  registro.
- **Repositorio:** la revisión del historial completo y del árbol actual no encontró claves ni tokens
  (0 coincidencias).
- **Límite propio de Google:** cualquier editor del proyecto puede ver las Propiedades del script. El
  proyecto no se comparte; vive solo en la cuenta corporativa, con verificación en 2 pasos.

## 4. Frecuencia

| Modo | Frecuencia | Estado en esta prueba |
|---|---|---|
| `conciliar` | Cada 30 minutos | No se instala |
| `resumenDiario` | 08:30 (America/Santiago) | No se instala |
| `validacionSoloLectura(dias)` | Manual | Sí; no escribe |
| `pruebaAlertaControlada()` | Manual, 2 veces | Sí; escribe una fila «PRUEBA» |

## 5. Lectura de formularios nuevos

- **Método:** `POST /form-submission-service/v4/submissions/namespace/query`, con el filtro
  `namespace = wix.form_app.form` y `createdDate > desde`, en orden descendente, 100 por página y hasta
  10 páginas.
- **Columna de coincidencia:** se toma de la propia automatización (la que recibe `submissionId`).
- **Cobertura:** solo se exige fila a los envíos posteriores a la creación de cada automatización. Los
  anteriores aparecen como «fuera de cobertura» y no alertan. Esto incluye las solicitudes antiguas que se
  cargaron a mano (decisiones 38 y 48).

## 6. Formularios antiguos (Cuecas y Boleros)

- Sus envíos **no están** en la API anterior. Cada aviso de correo se empareja con **una** fila:
  1. Mismo teléfono (8 últimos dígitos) y misma fecha del evento normalizada: `CONCILIADO`. Si hay varias
     candidatas, el nombre decide.
  2. Mismo teléfono y nombre, pero distinta fecha: `REVISAR`.
  3. Ninguna fila con ese teléfono: `SIN FILA`.
  4. No se pudo leer el teléfono o la fecha: `ILEGIBLE` (posible cambio de plantilla).
- **Requisito:** los avisos deben llegar al buzón corporativo (decisión 31). Mientras no ocurra, la
  validación con la cuenta corporativa mostrará 0 avisos para estos formularios. Es lo esperado, no un
  error.
- **Alternativa de validación** (solo con su autorización): ejecutar una única vez `validacionSoloLectura`
  desde la cuenta que hoy recibe los avisos, y retirar luego ese acceso.

## 7. Prevención de alertas duplicadas

- Cada alerta tiene una clave: el ID del envío, el ID del aviso de Gmail o la automatización con su revisión.
- `ALERTADOS` guarda las claves ya avisadas, y `FILAS_USADAS` evita reutilizar una fila de los formularios
  antiguos.
- La escritura en «Conciliación» omite las claves que ya están en las últimas 300 filas.
- **Orden:** fila, luego estado, luego correo. Si el correo falla, la fila ya quedó escrita y no se repite.

## 8. Manejo de errores

- Ante 429 o 5xx de Wix se reintenta 3 veces, con espera creciente. Otros errores se informan de inmediato
  con su código.
- Un error idéntico se avisa como máximo una vez cada 6 horas. Los contadores de ejecuciones y errores
  aparecen en el resumen diario.
- Además, Apps Script notifica las fallas de los activadores (configurar «inmediatamente»).
- La ausencia del correo diario indica que el monitor se detuvo.

## 9. Límites

**Apps Script, cuenta gmail.com** ([cuotas oficiales](https://developers.google.com/apps-script/guides/services/quotas);
pueden cambiar):

| Cuota | Límite | Uso estimado en producción |
|---|---|---|
| Llamadas URL Fetch al día | 20.000 | Unas 450 (48 ejecuciones × unas 9 llamadas) |
| Destinatarios de correo al día | 100 | 1 resumen, más las alertas que haya |
| Ejecución de activadores al día | 90 minutos | Menos de 16 minutos (48 ejecuciones de 10 a 20 segundos) |
| Tiempo por ejecución | 6 minutos | Menos de 1 minuto |

**Wix:** no se encontró un límite publicado para estos métodos. El script hace pocas llamadas y reintenta
ante 429.

## 10. Recuperación y desinstalación

- **Desinstalar:**
  1. Ejecutar `desinstalarActivadores()`.
  2. Borrar las Propiedades del script: `WIX_API_KEY`, `ALERTADOS`, `FILAS_USADAS`, `BASE_*`, `LEGADO_*`,
     `ULTIMA_REVISION`, `LATIDO`, `EJECUCIONES`, `ERRORES` y `ULTIMO_ERROR`.
  3. Revocar la clave en Wix.
  4. Retirar el acceso del proyecto en la cuenta de Google (Seguridad → apps con acceso a la cuenta).
- **Efecto:** no quedan cambios en Wix, en el CRM ni en las planillas. Las filas que el script haya escrito
  en «Conciliación» pueden conservarse como historial o borrarse.
- **Error en la prueba:** detenerse, copiar el mensaje del registro de ejecución (no contiene la clave) y
  documentarlo en el Registro.

## 11. Instalación bajo la cuenta corporativa, paso a paso (sin activadores)

1. **Iniciar sesión solo con la cuenta corporativa**, en una ventana privada para no mezclar cuentas.
   Comprobar que tenga la verificación en 2 pasos activada.
2. **Crear el proyecto:** en script.google.com, «Nuevo proyecto», con el nombre «Conciliación Wix → planillas
   (PRUEBA)». En Configuración del proyecto, zona horaria America/Santiago y «Mostrar el archivo de
   manifiesto».
3. **Copiar los archivos:** `appsscript.json`, `Conciliacion.gs`, `Trazabilidad.gs` y el `Config.gs` que entrega
   Claude fuera del repositorio. Guardar. `Calendario.gs` no se copia todavía (etapa 2 del calendario corporativo).
4. **Activar el servicio avanzado Gmail:** Servicios → Gmail API v1 (queda declarado en el manifiesto).
5. **Crear la clave de Wix** (propietario de la cuenta de Wix), en el panel → Claves de API:
   - Marcar solo los permisos de **envíos de formularios** (gestión: no existe lectura sola) y de **lectura de
     automatizaciones**.
   - No marcar contactos, sitio, pagos, tienda ni ningún otro.
   - Copiar la clave una sola vez.
6. **Guardar la clave:** Configuración del proyecto → Propiedades del script → `WIX_API_KEY` = la clave.
   Cerrar la pestaña del panel de Wix sin guardar la clave en otro lugar.
7. **Autorizar:** ejecutar `diagnosticoCredenciales()`. Google mostrará los 5 permisos de la sección 2 y
   ningún otro; si aparece otro, detenerse.
8. **Accesos que ya existen** (comprobados el 23-11 y de nuevo el 26-11):
   - La cuenta corporativa es propietaria del Registro, del CRM y de la agenda.
   - Las planillas de los formularios antiguos se transfirieron en el Bloque C.
   - No hay que compartir nada nuevo.
9. **Seguir con P2 a P5** de la sección siguiente. No ejecutar `instalarActivadores()`.

## 12. Secuencia de prueba y resultados esperados

| Paso | Acción | Resultado esperado |
|---|---|---|
| P0 | El propietario crea la clave y la guarda en Propiedades | `WIX_API_KEY` presente |
| P1 | Copiar los archivos y guardar | Proyecto sin errores de sintaxis |
| P2 | `diagnosticoCredenciales()` | `envios`, `automatizaciones`, `gmail` y `registro` en «OK» |
| P3 | `validacionSoloLectura(260)` | General: 0 envíos sin fila (exigibles desde la creación de su automatización). Villancicos y Corporativo: «inactiva, solo recuento» hasta la decisión 62. Automatizaciones sin cambios frente a lo esperado. Formularios antiguos: no se evalúan mientras no exista la decisión 31 (su `legado` va comentado). Trazabilidad (estado del 26-11): control 7 = 0, control 8 = 3 (agenda filas 119, 121 y 122), control 9 = 0; 1 excepción aplicada (EXC-2026-003) y EXC-2026-004 sin fila (valor cambiado en la agenda) |
| P4 | Revisar «Conciliación» y Propiedades | Sin filas nuevas y solo `WIX_API_KEY` |
| P5 | `pruebaAlertaControlada()` 2 veces | 1 fila «PRUEBA» y 2 correos en la bandeja corporativa. Borrar la fila después |
| P5b | `resumenDiario()` 1 vez | Filas de resumen por formulario, alertas de trazabilidad (control 8) y la fila «Monitor (latido diario)» en «Conciliación»; 1 correo de resumen y 1 de alerta en la bandeja corporativa. Claude lo verifica leyendo el Registro |

Los activadores (P6 y P7 del README) se instalan solo con una autorización posterior.

## 13. Reparto de tareas para la instalación real (26-11-2026)

| Tarea | Quién | Por qué |
|---|---|---|
| Preparar los archivos, el `Config.gs` real y las pruebas locales | Claude (hecho) | No requiere credenciales |
| Iniciar sesión en la cuenta corporativa, crear el proyecto y pegar los archivos | Propietario | Claude no tiene acceso a esa cuenta ni a script.google.com |
| Crear la clave de Wix y guardarla en Propiedades del script | Propietario | La clave nunca pasa por el chat, el código ni el repositorio |
| Aceptar la pantalla de permisos de Google (OAuth) | Propietario | Solo el titular de la cuenta puede autorizar |
| Ejecutar P2 a P5b y copiar al chat solo los resultados de «OK» o error (sin la clave) | Propietario | Las funciones corren en su proyecto |
| Verificar P3 a P5b contra el CRM, la agenda, Wix y la pestaña «Conciliación» | Claude | Tiene lectura de esas fuentes |
| Instalar los activadores (P6) y el paralelo de 7 días (P7) | Propietario, con autorización posterior | Requisito: P2 a P5b correctos |

**Latido visible (desde el 26-11):** el resumen diario escribe una fila «Monitor (latido diario)» en
«Conciliación» con las ejecuciones y errores desde el resumen anterior. Si falta la fila de un día, el monitor se
detuvo. Claude puede comprobarlo sin acceso al correo corporativo.
