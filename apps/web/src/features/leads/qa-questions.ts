/**
 * CATALOGO DE PREGUNTAS
 *
 * Cada rol (caller / closer) tiene su propia lista de preguntas.
 * Inicialmente son idénticas para mantener compatibilidad con la data
 * histórica. En el futuro pueden divergir sin romper el sistema:
 * cada `LeadQASessionItem` lleva `authorRole`, y el panel de Q&A
 * muestra las preguntas según el catálogo del rol correspondiente.
 */

export const CALLER_QUESTIONS = [
  "¿Fué contactado?",
  "¿Es el decisor?",
  "¿Quién es la persona correcta?",
  "¿De dónde sale su capacidad económica?",
  "Producto recomendado",
  "¿De dónde sale la urgencia?",
  "Información extra",
  "Fecha",
  "Hora",
] as const;

export const CLOSER_QUESTIONS = [
  "¿Fué contactado?",
  "¿Es el decisor?",
  "¿Quién es la persona correcta?",
  "¿De dónde sale su capacidad económica?",
  "Producto recomendado",
  "¿De dónde sale la urgencia?",
  "Información extra",
  "Fecha",
  "Hora",
] as const;
