# Rentabilidad y evidencia de pagos: diseño compatible (probado en la copia aislada; CRM real sin cambios)

Probado el 26-11-2026 en la copia «PRUEBA AISLADA — CRM sin datos reales», con reservas y pagos ficticios
(`R-9999-…`, `P-9999-…`). Los datos ficticios se borraron después de la prueba. La estructura nueva queda en la
copia para revisión.

## 1. El problema

En el CRM real, el Panel muestra una utilidad de $280.000 y un margen de 1 (100 %). La causa:
- `Reservas!Q = I − SUM(M:P)` trata los costos vacíos como 0.
- B10 y B11 suman esa columna.

Hoy las 2 reservas no tienen costos registrados (decisión 7 abierta), así que la «utilidad» es igual a la venta.

## 2. Diseño (no cambia ninguna fórmula existente)

**Reservas, 3 columnas nuevas a la derecha:**

| Col. | Encabezado | Tipo | Contenido |
|---|---|---|---|
| U | Estado de costos | Entrada con lista | `Pendiente` / `Estimado` / `Real verificado` |
| V | Costo registrado CLP | Fórmula de matriz (en V2) | Suma de M a P cuando al menos uno tiene dato; vacío si no hay ninguno |
| W | Rentabilidad | Fórmula de matriz (en W2) | `No calculable` / `Estimada` / `Real` |

Regla de W:
- **No calculable:** sin venta, sin ningún costo, o con U en `Pendiente` o vacío. Así, un costo parcial (por
  ejemplo, solo el traslado) no produce una utilidad inflada.
- **Estimada:** hay costos y U = `Estimado`.
- **Real:** hay costos y U = `Real verificado`.

```
V2: =ARRAYFORMULA(IF($A$2:$A$251="","",IF(($M$2:$M$251<>"")+($N$2:$N$251<>"")+($O$2:$O$251<>"")+($P$2:$P$251<>"")=0,"",$M$2:$M$251+$N$2:$N$251+$O$2:$O$251+$P$2:$P$251)))
W2: =ARRAYFORMULA(IF($A$2:$A$251="","",IF(($I$2:$I$251="")+((($M$2:$M$251<>"")+($N$2:$N$251<>"")+($O$2:$O$251<>"")+($P$2:$P$251<>""))=0),"No calculable",IF($U$2:$U$251="Real verificado","Real",IF($U$2:$U$251="Estimado","Estimada","No calculable")))))
```

**Panel, bloque nuevo en A19:B29.** Considera solo las reservas Confirmada y Realizada, igual que B7 a B10.

| Fila | Indicador | Fórmula |
|---|---|---|
| 20 | Venta con rentabilidad no calculable | SUMIFS de I con W = «No calculable» |
| 21 | Venta con costo estimado | SUMIFS de I con W = «Estimada» |
| 22 | Venta con costo real verificado | SUMIFS de I con W = «Real» |
| 23 | Costo estimado | SUMIFS de V con W = «Estimada» |
| 24 | Costo real verificado | SUMIFS de V con W = «Real» |
| 25 | Utilidad estimada | B21 − B23 |
| 26 | Utilidad real | B22 − B24 |
| 27 | Margen sobre ventas con costo registrado | (B25 + B26) / (B21 + B22), o «No calculable» |
| 28 | Reservas con rentabilidad no calculable | COUNTIFS con W = «No calculable» |
| 29 | Lectura de B10 y B11 | Aviso cuando B28 > 0: «B10 y B11 cuentan como costo cero N reserva(s)…» |

**Se conservan B4 a B11** sin tocar sus fórmulas. Opcionalmente se cambian solo los rótulos A10 y A11 a:
- «Utilidad operativa estimada (los costos vacíos cuentan como 0; ver fila 29)».
- «Margen operativo estimado (ver fila 29)».

**Pagos, 1 columna nueva (K «Evidencia del pago»)**, con lista: `Comprobante del cliente`, `Aviso bancario`,
`Conciliado con cartola`.

Bloque del Panel en A31:B35:
- Cobrado con aviso bancario, sin conciliar.
- Cobrado conciliado con cartola.
- Cobrado confirmado sin evidencia indicada (B8 − B32 − B33).
- Pagos informados por el cliente, aún sin acreditar (estado Pendiente).

Regla de uso:
- `Confirmado` solo con `Aviso bancario` o `Conciliado con cartola`.
- `Comprobante del cliente` va con `Pendiente`.

## 3. Prueba en la copia aislada (26-11-2026)

| Reserva ficticia | Estado | Venta | Costos | U | W esperado |
|---|---|---|---|---|---|
| R-9999-001 | Confirmada | 200.000 | ninguno | Pendiente | No calculable |
| R-9999-002 | Confirmada | 300.000 | M 150.000 + N 20.000 | Estimado | Estimada |
| R-9999-003 | Realizada | 100.000 | M 60.000 | Real verificado | Real |
| R-9999-004 | Confirmada | 150.000 | solo N 10.000 (parcial) | Pendiente | No calculable |
| R-9999-005 | Cancelada | 120.000 | M 50.000 | Real verificado | Excluida del Panel |

Pagos ficticios:
- 150.000 con aviso bancario (R-9999-002).
- 100.000 conciliado con cartola (R-9999-003).
- 100.000 Pendiente con comprobante del cliente (R-9999-001).

| Indicador | Esperado | Obtenido |
|---|---|---|
| B6 reservas confirmadas / B7 ventas / B8 cobrado / B9 saldo | 3 / 750.000 / 250.000 / 500.000 | 3 / 750.000 / 250.000 / 500.000 |
| B10 utilidad existente / B11 margen existente | 510.000 / 0,68 | 510.000 / 0,68 |
| Venta no calculable / estimada / real | 350.000 / 300.000 / 100.000 | 350.000 / 300.000 / 100.000 |
| Costo estimado / real | 170.000 / 60.000 | 170.000 / 60.000 |
| Utilidad estimada / real | 130.000 / 40.000 | 130.000 / 40.000 |
| Margen sobre ventas con costo | 0,425 | 0,425 |
| Reservas no calculables | 2 | 2 |
| Aviso en la fila 29 | Sí | Sí |
| Aviso bancario / cartola / sin evidencia / pendiente | 150.000 / 100.000 / 0 / 100.000 | 150.000 / 100.000 / 0 / 100.000 |

Resultado: **17 de 17**. Además se verificó lo siguiente:
- Un costo parcial con U «Pendiente» no se cuenta como utilidad.
- La reserva Cancelada queda fuera del cálculo.
- Después de la prueba, la copia volvió a 4 / 3 / 0, con el bloque nuevo en 0 y el margen «No calculable».

## 4. Qué mostraría el CRM real con este diseño (sin escribir nada)

| Indicador | Hoy | Con el diseño |
|---|---|---|
| B10 / B11 | 280.000 / 1 | Sin cambio (280.000 / 1), con el rótulo y el aviso de la fila 29 |
| Venta no calculable | — | 280.000 (R-2026-002 y R-2026-003) |
| Utilidad estimada / real | — | 0 / 0 |
| Margen con costo registrado | — | «No calculable» |
| Cobrado con aviso bancario, sin conciliar | — | 140.000, si se anota K = «Aviso bancario» en P-2026-001 a 003 |
| Cobrado conciliado con cartola | — | 0 |

**Impacto en los registros actuales:**
- Agregar U, V, W y K no cambia ningún valor existente: J, K, L, Q y R de Reservas, B4 a B11, Control y las
  validaciones quedan iguales.
- Solo se agregan columnas a la derecha y celdas del Panel bajo la fila 18.
- La pestaña Control y `Trazabilidad.gs` leen Reservas A:H y Pagos por columna, así que no se ven afectadas.

**Recuperación:** borrar las columnas U a W de Reservas, K de Pagos y las filas 19 a 35 del Panel, y devolver los
rótulos A10 y A11 a su texto original.

## 5. Qué no hace

- No establece costos ni márgenes por servicio (decisión 7 abierta).
- No marca ningún costo como real sin comprobante.
- No cambia el estado de ningún pago.
