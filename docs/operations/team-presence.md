# Presencia aproximada del equipo sin vigilancia

La presencia sirve para saber si una persona del equipo está disponible de forma aproximada. No mide productividad, no demuestra que alguien esté trabajando y no revela qué lead, página o registro está usando.

## Revisión rápida

1. Confirma que `team_presence` conserva una sola fila por usuario.
2. Confirma que el heartbeat toma la identidad de la sesión y solo acepta la taxonomía cerrada.
3. Confirma que el listado no devuelve timestamps ni contexto de navegación.
4. Ejecuta las pruebas focales y revisa la migración `0048_team_presence.sql` antes de aplicarla.

## Datos tratados

| Dato | Tratamiento |
| --- | --- |
| Usuario | `user_id`, ligado a un usuario activo |
| Categoría | Solo `crm`, `sales`, `coaching` o `administration` |
| Heartbeat | Timestamp servidor del último heartbeat aceptado |
| Estado | Derivado al leer; nunca persistido |
| Actividad mostrada | Bucket aproximado: ahora, recientemente, hace un tiempo o sin actividad reciente |
| Rol | Solo aparece cuando quien consulta ya dispone de `users:read` |

## Datos prohibidos

Nunca se almacenan ni devuelven:

- página, URL, pathname o ruta;
- ID de lead, cliente o registro;
- texto introducido, búsquedas, consultas o payloads;
- historial de heartbeats o eventos de navegación;
- datos raw de `lead_activity_events`.

## Umbrales y tráfico

- `online`: menos de 2 minutos desde el último heartbeat.
- `away`: desde 2 minutos y menos de 15 minutos.
- `offline`: 15 minutos o más, o sin heartbeat.
- El cliente consulta y envía heartbeat cada 60 segundos únicamente con la pestaña visible.
- El servidor usa un upsert condicional: como máximo una escritura aceptada por usuario cada 60 segundos. Cambiar de categoría no evita este límite.
- El reloj del servidor decide tanto los timestamps como los estados.

## Acceso

- Heartbeat: cualquier cuenta autenticada, activa y con rol resuelto; siempre para su propio `session.user.id`.
- Listado: cuentas autenticadas y activas. Solo incluye usuarios con `access_status = active`, excluyendo invitaciones pendientes y usuarios desactivados.
- El nombre visible forma parte del directorio interno del equipo.
- El rol se omite salvo que exista el permiso `users:read` o su wildcard equivalente.
- Una sesión de Better Auth autentica, pero no se interpreta por sí sola como presencia.

## Amenazas y controles

| Amenaza | Control | Límite residual |
| --- | --- | --- |
| Suplantar a otra persona | La identidad nunca forma parte del input | Una sesión robada conserva las capacidades de esa cuenta |
| Enviar contexto sensible | Zod acepta únicamente cuatro categorías | Un cliente modificado puede elegir una categoría válida incorrecta |
| Forzar escrituras continuas | Condición atómica de 60 segundos en PostgreSQL | El endpoint aún puede recibir tráfico; la protección perimetral debe limitar abuso volumétrico |
| Inferir navegación exacta | DTO sin timestamp preciso ni ruta; buckets y categorías coarse | Los estados siguen siendo información interna sensible |
| Mostrar usuarios inactivos | Filtro servidor `access_status = active` | Los cambios de acceso dependen de que el ciclo administrativo sea correcto |
| Romper navegación por fallo de presencia | Mutation silenciosa, query aislada y estado degradado en UI | El indicador puede quedar temporalmente desactualizado |

No existe una garantía absoluta de privacidad o seguridad. Esta función reduce deliberadamente la precisión y la cantidad de datos; la seguridad final también depende de sesiones, HTTPS, límites perimetrales, permisos y operación del entorno.

## Límite de abuso volumétrico

La condición atómica limita las **escrituras**, pero cada petición autenticada todavía alcanza la aplicación y puede consultar PostgreSQL. No se añade un contador en memoria del proceso porque no sería compartido entre réplicas, se perdería al reiniciar y daría una falsa sensación de protección. El rate limiting de peticiones debe configurarse en el perímetro o plataforma de hosting con identidad de cuenta e IP, límites sostenidos y de ráfaga, respuesta `429` y observabilidad sin payloads sensibles.

## Retención

No hay historial. La fila actual se sobrescribe y se elimina en cascada al eliminar el usuario. Un heartbeat antiguo permanece como último estado técnico hasta que se actualice o se elimine el usuario, pero la UI lo deriva como `offline` y nunca expone su timestamp exacto.

## Checklist antes de activar

- [ ] Revisar y aplicar la migración `0048` mediante el proceso habitual.
- [ ] Verificar HTTPS, cookies seguras y política de sesión.
- [ ] Añadir rate limiting perimetral por cuenta/IP si el despliegue lo permite.
- [ ] Confirmar que logs y APM no capturan cabeceras, cuerpos ni rutas completas innecesarias.
- [ ] Comprobar con Caller, Closer, Combined y Admin la visibilidad esperada del rol.
- [ ] Validar pestaña visible/oculta y degradación cuando la API falla.
- [ ] Definir un proceso de borrado si una política futura exige purgar filas offline antiguas.

## Fuera de alcance

No hay mapa de actividad, ranking, tiempo trabajado, historial, geolocalización, productividad, eventos por página ni analítica individual de navegación.
