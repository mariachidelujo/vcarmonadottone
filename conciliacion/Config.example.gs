/**
 * Copie este archivo como Config.gs en el proyecto de Apps Script (no lo suba al repositorio).
 * La clave de Wix NO va aquí: se guarda en Propiedades del script con el nombre WIX_API_KEY.
 * Los identificadores están en el Registro de cambios (entradas N.º 141–152).
 */
function obtenerConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    WIX_API_KEY: props.getProperty('WIX_API_KEY'),
    WIX_SITE_ID: '<ID del sitio Artistasadomicilio>',
    REGISTRO_ID: '<ID de la planilla «Registro de cambios y pruebas»>',
    PESTANA_CONCILIACION: 'Conciliación',
    CORREO_ALERTAS: '<cuenta corporativa>',
    // formId: formulario nuevo que dispara la automatización (vacío si solo se vigila el estado).
    // legado: formularios antiguos de Wix (identificador «comp-…»), que no están en la API de envíos;
    //         se concilian por el asunto exacto del aviso de correo (copiarlo de un aviso real).
    AUTOMATIZACIONES: [
      { nombre: 'CRM — Nuevas cotizaciones web', id: '<automatización>', formId: '<formulario General>' },
      { nombre: 'Formularios Cuecas', id: '<automatización>', legado: { asuntoAviso: 'Nuevo envío de Reserva Cueca' } },
      { nombre: 'Reserva Boleros', id: '<automatización>', legado: { asuntoAviso: '<asunto exacto del aviso de Boleros>' } },
      { nombre: 'CRM — Villancicos', id: '<automatización>', formId: '<formulario Villancicos>' },
      { nombre: 'CRM — Corporativo', id: '<automatización>', formId: '<formulario Corporativo>' },
      { nombre: 'Mariachis Santiago', id: '<automatización>', formId: '' },
      { nombre: 'Mariachi Vip', id: '<automatización>', formId: '' }
    ]
  };
}
