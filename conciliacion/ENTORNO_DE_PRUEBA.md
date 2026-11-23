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

## 11. Secuencia de prueba y resultados esperados

| Paso | Acción | Resultado esperado |
|---|---|---|
| P0 | El propietario crea la clave y la guarda en Propiedades | `WIX_API_KEY` presente |
| P1 | Copiar los archivos y guardar | Proyecto sin errores de sintaxis |
| P2 | `diagnosticoCredenciales()` | `envios`, `automatizaciones`, `gmail` y `registro` en «OK» |
| P3 | `validacionSoloLectura(260)` | General: exigibles 25 y conciliados 25, más los envíos nuevos posteriores al 22-11, con 0 sin fila. Automatizaciones sin cambios frente a lo esperado. Formularios antiguos: 0 avisos sin la decisión 31 |
| P4 | Revisar «Conciliación» y Propiedades | Sin filas nuevas y solo `WIX_API_KEY` |
| P5 | `pruebaAlertaControlada()` 2 veces | 1 fila «PRUEBA» y 2 correos en la bandeja corporativa. Borrar la fila después |

Los activadores (P6 y P7 del README) se instalan solo con una autorización posterior.
