# Integración CRM → Reserva → Agenda → Google Calendar (propuesta, sin implementar)

**Hallazgo del 26-11-2026:** el calendario del dueño contenía reservas reales que no estaban en el CRM: eventos
con anticipo pagado, eventos ausentes de la agenda y un evento eliminado el mismo día. Calendar ya es, en la
práctica, el registro operativo del equipo, así que debe quedar dentro de la trazabilidad.

## 1. Referencia común: el ID de reserva

| Sistema | Dónde va el ID | Ejemplo |
|---|---|---|
| CRM | Reservas › A (y Cotizaciones › L) | `R-2026-002` |
| Agenda | Columna Q «ID RESERVA» | `R-2026-002` |
| Calendar | Al **inicio del título** entre corchetes y en una línea de la descripción | Título `[R-2026-002] 4 mariachis – Calera de Tango`; descripción `ID reserva: R-2026-002` |

Para eventos de varias fechas se usa `R-AAAA-NNN-1`, `-2`, igual que en la agenda. Si más adelante un script
crea los eventos, el ID se guarda también como propiedad privada del evento (`idReserva`), que no se ve ni se
pierde si alguien edita el título.

**Orden del flujo:** la reserva se crea en el CRM (con su ID), se anota en la agenda (Q) y se crea o corrige el
evento de Calendar con el mismo ID. Mientras el equipo cree los eventos a mano, basta con agregar el prefijo al
título.

## 2. Detección automática (solo lectura; misma conciliación diaria)

Se agrega a `Trazabilidad.gs` con el permiso `calendar.readonly`. La ventana va desde 7 días atrás hasta 180
días adelante. Se consideran **eventos de reserva** los que tienen un ID en el título o «Reserva Artistas a
Domicilio» en la descripción.

| N.º | Control | Regla | Ejemplo real (26-11) |
|---|---|---|---|
| 12 | Evento de Calendar sin reserva en el CRM | Evento de reserva sin ID, o con un ID que no existe en Reservas | Cumbias del 28-11 en Casablanca, con anticipo pagado y sin reserva ni fila en la agenda |
| 13 | Reserva sin evento operativo | Reserva Pendiente o Confirmada con fecha futura y ningún evento con su ID | R-2026-002 y R-2026-003 hasta que se agregue el prefijo |
| 14 | Eventos duplicados | Dos o más eventos activos con el mismo ID (salvo los sufijos -1 y -2), o dos eventos de reserva el mismo día a menos de 2 horas con el mismo teléfono | — |
| 15 | Cambios de fecha, hora o precio | El inicio del evento difiere de Reservas (E y F), o el «valor total $X» de la descripción difiere de Reservas (I) | CTS: Calendar dice «anticipo 200.000 / saldo 200.000» y el pago fue de 400.000 |
| 16 | Eventos cancelados o eliminados | Evento cancelado o eliminado mientras la reserva sigue vigente; reserva Cancelada con evento activo; y, como registro, todo evento de reserva que desaparece entre dos revisiones | Club 50 (26-11): el evento «por confirmar» desapareció del calendario |

**Cómo se detectan las eliminaciones:** el script guarda en Propiedades solo los identificadores de evento y su
ID de reserva vistos en la revisión anterior, nunca datos personales. Lo que falte en la revisión siguiente se
consulta con `showDeleted`.

**Precio en la descripción:** se lee con un patrón fijo (`valor total $190.000`). Si el patrón no aparece, el
evento se informa como «sin precio legible», sin alertar.

## 3. Datos y permisos

- **Qué se lee:** título, inicio, fin, estado y la descripción, solo para extraer el ID y el valor. No se leen
  invitados ni ubicación.
- **Calendario:** hoy los eventos están en el calendario principal del dueño (cuenta personal). El script
  corporativo no puede leerlo sin compartirlo, y compartirlo es un cambio de permisos que requiere su
  autorización. Opciones:
  1. Un calendario dedicado «Reservas — Artistas a Domicilio», propiedad de la cuenta corporativa y compartido
     con el dueño (recomendada).
  2. Compartir con la cuenta corporativa, en solo lectura, el calendario actual.
- **Activación:** no se crean calendarios, eventos ni invitaciones hasta autorizarlo.

## 4. Pruebas previstas (antes de activar)

Reproducción local con los 7 eventos reales del 26-11 capturados en lectura, fuera del repositorio, más 6 casos
inyectados:
- Evento sin reserva.
- Reserva sin evento.
- Duplicado.
- Cambio de hora.
- Cambio de precio.
- Evento eliminado.

Resultado esperado: el control 12 marca Casablanca y las reservas en el CRM sin prefijo, sin falsos positivos
en los eventos que no son de reserva.
