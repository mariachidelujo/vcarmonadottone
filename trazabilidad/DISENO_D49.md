# Decisión 49: trazabilidad comercial (ejecutada el 23-11-2026)

Une solicitud → cotización → reserva → evento → pago **sin un segundo CRM** y sin cambiar la forma de trabajo
del equipo. Hay solo dos cambios de estructura:
- Una pestaña nueva «Control» en el CRM.
- Una columna nueva «ID RESERVA» (Q) en la agenda de la temporada.

Todo lo demás usa columnas que ya existen.

## 1. Identificadores

| Elemento | ID | Dónde vive | Quién lo crea |
|---|---|---|---|
| Solicitud y cotización | ID del envío de Wix, o `WA-`, `EM-` o `TEL-AAAAMMDD-NN` | CRM › Cotizaciones › A | La automatización de Wix, o el equipo a mano |
| Cliente | ID de contacto de Wix, o `CL-` + ID de la solicitud | CRM › Clientes › A | Igual que la anterior |
| Reserva | `R-AAAA-NNN` (la pestaña «Control» muestra el próximo libre) | CRM › Reservas › A, con el vínculo de vuelta en Cotizaciones › L | El equipo, solo con aceptación escrita |
| Evento | El mismo ID de la reserva; `R-AAAA-NNN-1`, `-2`… si hay varias fechas | Agenda › columna Q «ID RESERVA» | El equipo, al anotar el evento |
| Pago | `P-AAAA-NNN` (la pestaña «Control» muestra el próximo libre) | CRM › Pagos › A, con la reserva en la columna C | El equipo |

**Columna Q: solo ID reales de reservas.** Las filas de la agenda anteriores a la puesta en marcha que siguen
vigentes y no tienen reserva en el CRM **no se marcan en la agenda**: se registran como excepciones temporales
`EXC-AAAA-NNN` en la pestaña «Control» del CRM. Cada excepción guarda la fecha, la hora, el valor y el espectáculo
de su fila; se identifica por ese contenido, no por el número de fila, así que sigue valiendo si se insertan u
ordenan filas. Una excepción «Vigente» o «Cerrada» exceptúa su fila del control 8. Si alguien cambia esos datos
en la agenda, la excepción deja de coincidir, la fila alerta y el resumen diario la informa como «sin fila».
No se inventan reservas ni se alteran registros comerciales.

## 2. Reservas de empresas con pago posterior al evento

No se necesitan columnas nuevas:
- La reserva puede quedar «Confirmada» con un pago **comprometido**: una fila en Pagos con Tipo «Ingreso»,
  Estado «Pendiente», el monto acordado y, como concepto, el proceso del cliente (formulario de proveedores u
  orden de compra).
- El Panel no lo cuenta como cobrado y lo muestra en «Saldo pendiente».
- El control 10 no alerta.
- Al pagar, la fila pasa a «Confirmado» y se anota el comprobante.
- Después del evento, la reserva pasa a «Realizada». El indicador «Reservas realizadas con saldo por cobrar»
  recuerda el cobro.

La regla de cuándo una reserva de empresa pasa a «Confirmada» es la decisión 52.

## 3. Controles

| N.º | Control | Dónde se calcula |
|---|---|---|
| 1 | Cotizaciones con ID duplicado | Pestaña «Control» |
| 2 | Reservas con ID duplicado, vacío o fuera de formato | Pestaña «Control» |
| 3 | Reservas sin cotización, o con una cotización inexistente | Pestaña «Control» |
| 4 | Reservas sin vínculo de vuelta en su cotización | Pestaña «Control» |
| 5 | Cotizaciones con un ID de reserva inexistente | Pestaña «Control» |
| 6 | Cotizaciones «Aprobada» sin reserva | Pestaña «Control» |
| 7 | Reservas Confirmada o Realizada sin fila en la agenda | Resumen diario (`Trazabilidad.gs`) |
| 8 | Filas nuevas de la agenda (desde la puesta en marcha) sin ID | Resumen diario (`Trazabilidad.gs`) |
| 9 | IDs de la agenda mal escritos o inexistentes | Resumen diario (`Trazabilidad.gs`) |
| 10 | Reservas «Confirmada» sin anticipo cobrado ni pago comprometido | Pestaña «Control» |
| 11 | Pagos con ID duplicado o mal escrito, o con una reserva inexistente (nuevo) | Pestaña «Control» |

- **Fórmulas exactas:** [`control_formulas.json`](control_formulas.json).
- **Rangos:** son abiertos (`A2:A`), así que no se desplazan si se agregan o borran filas.
- **Controles 7 a 9:** cruzan con la agenda, que es otra planilla. No se usa IMPORTRANGE, porque daría a todos
  los editores del CRM acceso a la agenda completa, con datos personales. Los calcula el script de
  conciliación en el resumen diario, solo en lectura y leyendo solo FECHA, VALOR e ID RESERVA.

### Correcciones a la prueba del N.º 155 (falsos positivos evitados)

| Control | Antes | Ahora |
|---|---|---|
| 8 | Toda fila con valor y sin ID: **115 falsas alertas** con la agenda real | Solo fechas desde la puesta en marcha (23-11-2026) y sin excepción registrada en «Control» |
| 10 | Alertaba a una empresa con pago posterior | Acepta un pago comprometido en Pagos |
| 7 y 9 | No admitían `-1` y `-2` | Admiten varias fechas, minúsculas y espacios |
| 2 y 11 | Solo detectaban duplicados | También formato, filas sin ID y pagos de reservas inexistentes |

## 4. Pruebas realizadas (23-11-2026)

- **Pestaña «Control» en la copia aislada, sin datos reales:**
  - Flujo sano: todo en 0.
  - Empresa con pago posterior: 0 (el control anterior daba 1).
  - 11 errores inyectados: todos detectados con el valor exacto que predice el modelo de referencia.
  - La copia quedó restaurada.
- **Modelo de referencia sobre los datos reales del CRM (solo lectura):** controles 1 a 5, 10 y 11 en 0.
  Control 6 en 1: una cotización aprobada que aún no tiene reserva. Es una alerta verdadera.
- **`Trazabilidad.gs` con las fechas y valores reales de la agenda:** 13 de 13 casos.
  - Sin excepciones, el control 8 da 5; con las 4 excepciones, 1 (el evento aún sin reserva); con la reserva
    vinculada, 0.
  - Una versión posterior con excepciones en «Control» pasó 17 de 17 casos: rechaza un `PREVIO` escrito en Q,
    sobrevive a filas insertadas y detecta cambios en una fila exceptuada.

## 5. Ejecución (23-11-2026, autorizada por el dueño)

1. **Antes:**
   - El CRM (última modificación 09:07) y la agenda (22-11) no habían cambiado desde los respaldos de las 09:34.
   - La huella de fórmulas y validaciones del CRM era igual a la línea base.
   - Panel 38/32/0, automatizaciones de Wix sin cambios y 0 envíos nuevos.
2. **CRM:** se agregó la pestaña «Control» en una sola operación atómica: 11 controles, indicadores y 4
   excepciones (`EXC-2026-001` a `004`). La misma versión se probó antes en la copia aislada.
3. **Agenda:** solo Q1 = «ID RESERVA», en negrita como el resto del encabezado. No se escribió nada más en la
   columna Q.
4. **Después:**
   - Las 9 pestañas del CRM quedaron idénticas al respaldo, celda por celda: valores, fórmulas, formatos,
     validaciones, filtros y propiedades.
   - La agenda solo difiere del respaldo en Q1.
   - Panel sin cambios; automatizaciones de Wix sin cambios; 0 envíos durante la ventana.
5. **Controles sobre los datos reales:**
   - 1 a 5, 10 y 11 en 0.
   - **6 en 1:** EM-20261023-01, aprobada sin reserva (alerta legítima).
   - 7 y 9 en 0.
   - **8 en 1:** fila 119, el mismo evento (alerta legítima).
   - 4 excepciones aplicadas.
6. **Permisos:** el Drive conectado informa «no puede editar» incluso en el CRM, donde la escritura funciona.
   La escritura en la agenda se hizo con el permiso de editora que ya tenía la cuenta, sin cambiar propietarios
   ni permisos.

## 6. Recuperación (específica, sin restaurar respaldos completos)

- **CRM:** borrar la pestaña «Control». No desplaza filas ni afecta a otras pestañas (probado).
- **Agenda:** vaciar Q1.
- **Respaldos de comparación:** «RESPALDO 2026-11-23 — CRM antes de la decisión 49» y
  «RESPALDO 2026-11-23 — ARTISTAS A DOMICILIO 2026 antes de la decisión 49».

## 6 bis. Conciliación de las 4 excepciones

| Excepción | Evento en la agenda | Después del evento |
|---|---|---|
| EXC-2026-001 | 27-11, 20:00, 4 mariachis, $190.000 | El equipo confirma si se realizó y se cobró → «Cerrada» (o se incorpora con WA- y reserva si el dueño lo decide) |
| EXC-2026-002 | 29-11, 17:00, 3 mariachis, $90.000 | Igual |
| EXC-2026-003 | 13-12, 15:00, boleros, $200.000 | Igual |
| EXC-2026-004 | 18-12, 15:00, villancicos, $160.000 | Igual |

- **Qué significa «Cerrada»:** el evento se realizó fuera del CRM y queda documentado. La fila sigue exceptuada.
- **Anulada:** solo si la excepción se creó por error. En ese caso la fila vuelve a exigir un ID.

## 7. Riesgos y límites

| Riesgo | Mitigación |
|---|---|
| El equipo escribe en Q algo que no es un ID real (por ejemplo «PREVIO») | El control 9 lo marca como ID inexistente |
| El equipo no anota el ID en la agenda | Por diseño, el control 8 alerta a diario. El costo es un paso más al agendar |
| La fecha de la agenda no tiene año («3/12») | Los meses desde septiembre son del año de la temporada; los anteriores, del siguiente. Revisar en agosto de 2027 |
| Fecha ilegible en la agenda | No se controla, pero se informa como «fecha ilegible» en el resumen diario |
| Los controles 7 a 9 dependen del script instalado | Hasta entonces se revisan en lectura cuando el dueño lo pida |
| Fórmulas del Panel con rango hasta la fila 327 (anterior a este diseño) | Revisar cuando el CRM se acerque a 320 filas |
| `COUNTIF` no distingue mayúsculas | Los ID se generan con un formato fijo |
