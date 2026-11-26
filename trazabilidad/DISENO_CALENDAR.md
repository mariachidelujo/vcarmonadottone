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
- **Calendario:** la arquitectura adoptada el 26-11-2026 es un calendario operativo propiedad de la cuenta
  corporativa (sección 5). El calendario personal del dueño queda solo como fuente de lectura de transición.
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

## 5. Arquitectura objetivo: calendario operativo corporativo (adoptada el 26-11-2026; sin crear)

| Elemento | Decisión |
|---|---|
| Calendario | «Operaciones — Artistas a Domicilio», propiedad de la **cuenta corporativa**, zona horaria America/Santiago |
| Quién lo crea | El dueño, con la sesión iniciada en la cuenta corporativa, o el script de esa cuenta. El conector de Calendar de esta sesión usa la cuenta personal: un calendario creado desde aquí quedaría a nombre de la cuenta personal, que es justo lo que se quiere evitar |
| Fuente de verdad | El CRM (Reservas). El calendario refleja reservas; nunca las crea |
| Calendario personal | Se mantiene intacto: no se edita, no se borra ni se mueve nada. Solo se lee durante la transición |

### 5.1 Plan por etapas (cada etapa requiere su propia autorización)

| Etapa | Qué se hace | Escribe en | Permiso del script |
|---|---|---|---|
| 0 | Crear el calendario corporativo y compartirlo con el dueño. El dueño elige el nivel (editar o solo ver) | Configuración del calendario | — (lo hace el dueño) |
| 1 | El equipo crea a mano en el calendario corporativo los eventos de las reservas existentes (R-2026-002 y R-2026-003, más las que se incorporen), con el ID en el título | Calendario corporativo | — |
| 2 | Controles 12 a 16 en solo lectura sobre el calendario corporativo, dentro de la conciliación diaria a pedido | Nada | `calendar.readonly` |
| 3 | Sincronización CRM → calendario corporativo por script | Solo el calendario corporativo | `calendar.events` de la cuenta corporativa (que no tiene otros calendarios con datos) |
| 4 | Fin de la transición: cuando todas las reservas futuras tienen su evento corporativo, se deja de leer el calendario personal | Nada | Se quita el acceso al personal, si se había dado |

### 5.2 Vínculo por ID RESERVA y prevención de duplicados

- **Clave única:** el ID de reserva (`R-AAAA-NNN`, con sufijo `-1`, `-2` para varias fechas). Va en tres lugares
  del evento:
  - Al inicio del título: `[R-2026-002] 4 mariachis – Calera de Tango`.
  - En una línea de la descripción: `ID reserva: R-2026-002`.
  - Como propiedad privada `idReserva`, cuando lo cree el script.
- **Antes de crear un evento**, el script busca en el calendario corporativo un evento con esa `idReserva`, o con
  el ID en el título. Si existe, lo actualiza en vez de crear otro.
- **Control 14 (duplicados)** se aplica solo dentro del calendario corporativo. Durante la transición es
  esperable que el mismo evento esté en el personal y en el corporativo: eso no es un duplicado.
- **Eventos del personal sin evento corporativo** (Casablanca, por ejemplo) se informan como «evento de
  transición sin reserva» (control 12). No se copian solos al corporativo: primero se crea la reserva en el CRM.

### 5.3 Cambios que se sincronizan (etapa 3)

| Cambio en el CRM | Efecto en el evento corporativo |
|---|---|
| Fecha u hora (Reservas E y F) | Se mueve el evento |
| Servicio o comuna (D y G) | Se actualiza el título |
| Duración | Se actualiza el fin. Sin duración registrada, se usan 60 min y se marca «duración por confirmar» |
| Estado Cancelada | Ver 5.4 |
| Venta, pagos, costos y datos del cliente | **No se copian** al calendario |

Si alguien edita a mano la fecha o la hora del evento corporativo, el control 15 lo informa y la sincronización
no lo sobrescribe hasta que se corrija el CRM o se confirme el cambio. Así no se pierde una corrección hecha en
terreno.

### 5.4 Registro de cancelaciones

- Una reserva Cancelada **no borra** su evento: el título pasa a `[CANCELADA] [R-2026-00N] …` y el evento queda
  como «disponible» para no bloquear la agenda del equipo.
- La cancelación se documenta en el CRM: estado de la reserva y nota en Reservas › T (fecha, quién avisó, motivo
  y evidencia). También queda una fila en el Registro. No se crea otra planilla.
- Un evento borrado a mano mientras la reserva sigue vigente aparece en el control 16 y se recrea solo con
  autorización.
- **Caso Club 50 (26-11):** su desaparición del calendario personal no prueba una cancelación. Con esta regla,
  habría quedado como `[CANCELADA]` con su evidencia, o como alerta del control 16.

### 5.5 Datos personales restringidos

| En el evento corporativo | Solo en el CRM y la agenda |
|---|---|
| ID de reserva, servicio, número de artistas, comuna, inicio y fin, responsable de coordinación | Nombre completo, teléfono, correo y dirección exacta del cliente; venta, anticipo, saldo y costos; datos bancarios y tributarios |

- Con este contenido mínimo, el calendario puede compartirse con el equipo con «ver todos los detalles del
  evento» sin exponer datos del cliente. Google Calendar no permite ocultar campos sueltos, así que la
  restricción se logra no escribiéndolos.
- La dirección del día se consulta en la agenda (que el equipo ya usa), con el ID del título.
- El script no lee invitados ni ubicación, y en Propiedades guarda solo identificadores de evento e ID de
  reserva.

### 5.6 Pruebas antes de cada etapa

- Etapa 2: reproducción local con los eventos reales capturados en lectura (fuera del repositorio) más los 6
  casos inyectados de la sección 4, y además:
  - Mismo evento en el personal y en el corporativo: no debe ser duplicado.
  - Evento `[CANCELADA]` con reserva Cancelada: no debe alertar.
  - Evento sin ID en el corporativo: debe alertar.
- Etapa 3: en un calendario de prueba de la cuenta corporativa, con reservas ficticias. Se prueban:
  - Crear, mover y cancelar.
  - Que un segundo intento no duplique.
  - Que una edición manual no se sobrescriba.
