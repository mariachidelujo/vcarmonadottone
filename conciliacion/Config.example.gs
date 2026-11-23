/**
 * Copie este archivo como Config.gs en el proyecto de Apps Script. No lo suba al repositorio.
 * La clave de Wix NO va aquí: se guarda en Propiedades del script con el nombre WIX_API_KEY.
 * Los identificadores están en el Registro de cambios (entradas N.º 152 y siguientes).
 */
function obtenerConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    WIX_API_KEY: props.getProperty('WIX_API_KEY'),
    WIX_SITE_ID: '<ID del sitio Artistasadomicilio>',
    REGISTRO_ID: '<ID de la planilla «Registro de cambios y pruebas»>',
    PESTANA_CONCILIACION: 'Conciliación',
    CORREO_ALERTAS: '<cuenta corporativa>',

    // Pruebas documentadas en el Registro: no generan alertas.
    EXCLUIDOS: {
      envios: ['<ID de envío de prueba>'],          // formularios nuevos (ID de envío de Wix)
      avisos: ['<ID de mensaje de Gmail de prueba>'] // formularios antiguos (ID del aviso en Gmail)
    },

    // formId: formulario nuevo que dispara la automatización.
    // legado: formulario antiguo (identificador «comp-…»); se concilia aviso por aviso.
    //   asuntoAviso: asunto del aviso de Wix; columnas: encabezados de la planilla de destino.
    // esperado: estado conocido al instalar (status, revisión y cuenta de Google del Registro); cualquier
    //   diferencia en la primera lectura genera alerta. Sin «revision», un cambio previo no se detecta.
    // desde (opcional): fecha a partir de la cual se exige la fila, si es posterior a la creación de la automatización.
    AUTOMATIZACIONES: [
      { nombre: 'CRM — Nuevas cotizaciones web', id: '<automatización>', formId: '<formulario General>',
        esperado: { status: 'ACTIVE', revision: '<revisión>', cuentas: '<cuenta corporativa en Wix>' } },
      { nombre: 'Formularios Cuecas', id: '<automatización>',
        legado: { asuntoAviso: 'Nuevo envío de Reserva Cueca', columnas: { telefono: 'Telefono', fecha: 'Fecha', nombre: 'Nombre' } },
        esperado: { status: 'ACTIVE', revision: '<revisión>', cuentas: '<cuenta corporativa en Wix>' } },
      { nombre: 'Reserva Boleros', id: '<automatización>',
        legado: { asuntoAviso: 'Nuevo envío de Reserva Al Lote 2', columnas: { telefono: 'TELEFONO', fecha: 'FECHA', nombre: 'NOMBRE' } },
        esperado: { status: 'ACTIVE', revision: '<revisión>', cuentas: '<cuenta corporativa en Wix>' } },
      { nombre: 'CRM — Villancicos', id: '<automatización>', formId: '<formulario Villancicos>', esperado: { status: 'INACTIVE', revision: '<revisión>' } },
      { nombre: 'CRM — Corporativo', id: '<automatización>', formId: '<formulario Corporativo>', esperado: { status: 'INACTIVE', revision: '<revisión>' } },
      { nombre: 'Mariachis Santiago', id: '<automatización>', esperado: { status: 'INACTIVE', revision: '<revisión>' } },
      { nombre: 'Mariachi Vip', id: '<automatización>', esperado: { status: 'INACTIVE', revision: '<revisión>' } }
    ]

    // Controles 7 a 9 de trazabilidad (Trazabilidad.gs). Activar solo después de crear la columna
    // «ID RESERVA» en la agenda (decisión 49). Solo lectura; se ejecutan en el resumen diario.
    // , TRAZABILIDAD: {
    //   CRM_ID: '<ID del CRM>', AGENDA_ID: '<ID de ARTISTAS A DOMICILIO 2026>', PESTANA_AGENDA: 'TEMPORADA ARTISTAS',
    //   PESTANA_CONTROL: 'Control',                         // excepciones temporales EXC- del CRM
    //   COLUMNAS: { fecha: 1, hora: 2, valor: 9, id: 17 },  // A = FECHA, B = HORARIO, I = VALOR, Q = ID RESERVA
    //   ANIO_TEMPORADA: 2026, MES_INICIO_TEMPORADA: 9,      // «3/12» → 2026; «5/01» → 2027
    //   INICIO_CONTROL: '<AAAA-MM-DD de la puesta en marcha>'
    // }
  };
}
