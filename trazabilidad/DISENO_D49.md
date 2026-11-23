# Decisión 49: trazabilidad comercial (diseño definitivo, sin ejecutar)

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

**Filas de la agenda anteriores a la puesta en marcha** que siguen vigentes y no tienen reserva en el CRM: se
marcan `PREVIO` para que no generen alertas.

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
| 8 | Toda fila con valor y sin ID: **115 falsas alertas** con la agenda real | Solo fechas desde la puesta en marcha, sin contar las marcadas `PREVIO` |
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
  - Sin `PREVIO`, el control 8 da 5.
  - Con `PREVIO` en 4 filas, da 1 (el evento aún sin reserva).
  - Con la reserva vinculada, da 0.

## 5. Ejecución propuesta (requiere autorización)

**Antes**
1. Comprobar que el CRM y la agenda no cambiaron desde los respaldos del 23-11. Si cambiaron, hacer un
   respaldo nuevo.
2. Tomar la huella de las fórmulas y validaciones del CRM. La línea base es: Panel con 8 fórmulas; Reservas
   con 1.250 fórmulas y 250 validaciones; Clientes, Cotizaciones y Artistas con 250 validaciones cada una;
   Pagos con 500.
3. Comprobar que se puede escribir en la agenda. Si no se puede, la cuenta corporativa hace a mano el paso 5.

**Cambios**

4. **CRM:** agregar la pestaña «Control» con `control_formulas.json`, en una sola operación atómica. No se toca
   ninguna otra pestaña.
5. **Agenda, columna Q:**
   - Encabezado «ID RESERVA».
   - `PREVIO` en las 4 filas vigentes sin reserva.
   - Antes de escribir, se verifica que el contenido de cada fila (fecha, comuna y valor) sea el esperado.
   - La fila del primer caso real queda vacía hasta crear su reserva.

**Después**

6. Comprobar:
   - Huella del CRM idéntica en las pestañas existentes.
   - Panel sin cambios.
   - «Control» con solo el control 6 en 1 y los próximos IDs en `R-2026-001` y `P-2026-001`.
   - En la agenda, solo las 5 celdas nuevas, con el resto igual al respaldo.
7. Ejecutar los controles 7 a 9 en lectura. Se espera el control 8 en 1 (el evento sin reserva) y los demás
   en 0.
8. Comprobar que las automatizaciones de Wix no cambiaron y que no hubo envíos durante la ventana.
9. Documentar en el Registro. Activar `TRAZABILIDAD` en Config.gs al instalar el script.

**Condiciones para detenerse:** cualquier diferencia en la huella o el Panel, o filas de la agenda distintas
de las esperadas.

## 6. Recuperación (específica, sin restaurar respaldos completos)

- **CRM:** borrar la pestaña «Control». No desplaza filas ni afecta a otras pestañas (probado).
- **Agenda:** vaciar Q1 y las celdas `PREVIO` o de ID escritas, celda por celda.
- **Respaldos de comparación:** «RESPALDO 2026-11-23 — CRM antes de la decisión 49» y
  «RESPALDO 2026-11-23 — ARTISTAS A DOMICILIO 2026 antes de la decisión 49», en Respaldos. Se usan para
  comparar, no para restaurar encima de datos nuevos.

## 7. Riesgos y límites

| Riesgo | Mitigación |
|---|---|
| El equipo no anota el ID en la agenda | Por diseño, el control 8 alerta a diario. El costo es un paso más al agendar |
| La fecha de la agenda no tiene año («3/12») | Los meses desde septiembre son del año de la temporada; los anteriores, del siguiente. Revisar en agosto de 2027 |
| Fecha ilegible en la agenda | No se controla, pero se informa como «fecha ilegible» en el resumen diario |
| Los controles 7 a 9 dependen del script instalado | Hasta entonces se revisan en lectura cuando el dueño lo pida |
| Fórmulas del Panel con rango hasta la fila 327 (anterior a este diseño) | Revisar cuando el CRM se acerque a 320 filas |
| `COUNTIF` no distingue mayúsculas | Los ID se generan con un formato fijo |
