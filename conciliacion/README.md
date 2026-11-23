# Conciliación autónoma Wix → planillas (propuesta, no instalada)

Monitor que comprueba que cada solicitud enviada en Wix genere su fila en la planilla esperada.
Funciona con el computador apagado y sin Claude Code abierto. Reemplaza la tarea local
`conciliacion-artistas-wix` (Registro N.º 122 y 125), que solo corre con la aplicación de escritorio abierta.

**Estado:** propuesta preparada y probada con servicios simulados. No se creó ninguna automatización
ni activador en producción.

## Comparación de opciones

| Criterio | A. Apps Script (cuenta corporativa) | B. Automatizaciones nativas de Wix | C. Tarea programada en la nube de Claude |
|---|---|---|---|
| Funciona con el computador apagado | Sí (servidores de Google) | Sí | Sí |
| Detecta un envío sin su fila | Sí: compara el ID del envío con la planilla | **No**: Wix no lee planillas, solo dispara acciones | Sí |
| Resultado reproducible | Alto (código fijo) | Alto | Medio (lo ejecuta un agente) |
| Depende de la cuenta personal | No (solo para generar la clave de Wix) | Hoy sí (los avisos van a la cuenta personal) | Sí (conectores de la cuenta personal) |
| Seguridad | Clave de Wix de solo lectura guardada en Propiedades del script; escribe solo en «Conciliación» | Sin credenciales nuevas | Sesión autónoma con conectores amplios; los límites son solo instrucciones |
| Costo | $0 (cuotas gratuitas de Google) | $0 | Consume el plan de Claude en cada ejecución |
| Historial | Registro de ejecuciones de Apps Script y filas en «Conciliación» | Historial de Wix (30 días) | Transcripción de cada sesión |

**Recomendación:** opción A como mecanismo permanente (fase B de la decisión 33). Opción B solo como
complemento: que los avisos de cada envío lleguen también a la cuenta corporativa (decisión 31), para tener
un segundo canal humano. La opción C solo tendría sentido como puente temporal hasta instalar la A.

## Qué vigila

- **Formularios nuevos** (General y, cuando se activen, Villancicos y Corporativo): lista los envíos por la API
  de formularios de Wix y busca cada ID de envío en la columna donde la automatización lo escribe. El mapeo
  se lee desde la propia automatización, así que un cambio de columnas no rompe la conciliación.
- **Formularios antiguos** (Reserva Cueca y Boleros, con identificador `comp-…`): sus envíos **no están** en la
  API actual de formularios (comprobado el 22-11). Se comparan, de forma acumulada, los avisos de correo
  recibidos con las filas agregadas a la planilla. Requiere la decisión 31.
- **Las 7 automatizaciones:** estado, revisión y cuenta de Google frente a una línea base. Cualquier cambio
  genera una alerta.
- **Alertas:** un envío con más de 30 minutos sin fila, o un cambio de automatización, escribe una fila
  `ALERTA` en «Conciliación» y envía un correo a la cuenta corporativa. Cada incidencia se avisa una sola vez.
- **Resumen diario** a las 08:30 (America/Santiago), con correo breve. Si un día no llega, el monitor dejó de
  funcionar.
- **No** escribe en el CRM ni en las planillas operativas, ni modifica Wix.

## Requisitos previos (acciones del propietario)

1. **Clave de API de Wix.** Solo puede generarla el propietario de la cuenta de Wix, desde el panel de claves
   de API, con los permisos mínimos de lectura de envíos de formularios y de automatizaciones (confirmar los
   nombres exactos de los permisos al crearla). Se guarda en Propiedades del script como `WIX_API_KEY`.
   Nunca va en el código ni en el chat.
2. **Decisión 31** (solo para los formularios antiguos): los avisos de «Nuevo envío de Reserva Cueca» y de
   Boleros deben llegar también a la cuenta corporativa.

## Instalación (con la cuenta corporativa)

1. En script.google.com, crear el proyecto «Conciliación Wix → planillas».
2. Copiar `Conciliacion.gs`. Crear `Config.gs` a partir de `Config.example.gs`, con los ID del Registro.
   Reemplazar el manifiesto por `appsscript.json` (Configuración del proyecto → mostrar el manifiesto).
3. En Propiedades del script, agregar `WIX_API_KEY`.
4. Ejecutar `pruebaEnSeco`. No escribe nada: muestra en el registro de ejecución lo que encontraría en los
   últimos 7 días.
5. Ejecutar `instalarActivadores` y autorizar los permisos (planillas, solicitudes externas, envío de correo,
   lectura de Gmail y activadores).
6. En Activadores, configurar las notificaciones de error como «inmediatamente».

## Criterios de aceptación

- `pruebaEnSeco` da 0 envíos sin fila en General, igual que la conciliación manual (25 de 25 al 22-11).
- El primer resumen diario llega al correo corporativo y agrega filas en «Conciliación» marcadas
  «Apps Script (cuenta corporativa)».
- Funcionamiento en paralelo con la revisión manual hasta el 06-12, con resultados iguales.

## Recuperación ante una alerta

1. Abrir el envío en el panel de Wix (Formularios → envíos del formulario) usando su ID.
2. Confirmar que falta la fila: buscar el ID en la planilla de destino.
3. Reingresar la fila con el mismo mapeo de la automatización, a mano o por Claude con autorización.
   Documentarlo en el Registro y anotar la resolución en la fila de «Conciliación».
4. En formularios antiguos, una vez resuelto, ejecutar `reiniciarLineaBaseLegado`.

## Reversión

Eliminar los activadores, o el proyecto completo, y revocar la clave de API de Wix. No deja cambios en Wix,
en el CRM ni en las planillas, salvo las filas agregadas a «Conciliación».

## Límites conocidos

- La detección tarda hasta unos 60 minutos: activador cada 30 minutos más 30 minutos de margen.
- En los formularios antiguos se compara un recuento, no cada envío. Si alguien borra filas a mano, puede
  aparecer una falsa alerta; se corrige con `reiniciarLineaBaseLegado`.
- Cuotas de Apps Script para cuentas gratuitas: 90 minutos diarios de ejecución por activadores y 100 correos
  al día. El uso estimado es de 48 ejecuciones de menos de 20 segundos.
- Si durante la autorización `GmailApp` pide un alcance mayor que `gmail.readonly`, hay que agregar
  `https://mail.google.com/`. Se verifica en la instalación.

## Pruebas realizadas (22-11-2026)

Se probó con un arnés local que simula Wix, Sheets, Gmail y las propiedades del script, usando la estructura
real de las automatizaciones. Los 9 escenarios resultaron correctos:

1. Resumen sin incidencias.
2. Envío faltante con más de 30 minutos: alerta. Envío con menos de 30 minutos: no alerta.
3. La misma falta en la ejecución siguiente: no repite el correo.
4. Cambio de revisión de una automatización: alerta.
5. Formulario antiguo con 2 avisos y 0 filas nuevas: alerta.
6. Formulario antiguo con 2 avisos y 2 filas nuevas: sin alerta.
7. Una falta ya alertada: no agrega filas repetidas.
8. Un cambio ya alertado: no se repite.
9. La misma diferencia en un formulario antiguo: no se repite.

Falta la prueba real en Apps Script, que requiere la clave de Wix y la instalación por el propietario.
