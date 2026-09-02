# Guía de trabajo para `crm-fran`

Este archivo define cómo colaborar, diseñar e implementar cambios en este repositorio. La prioridad es entregar software claro, comprobable y fácil de evolucionar sin introducir abstracciones antes de necesitarlas.

## 1. Prioridades

Cuando dos reglas parezcan competir, seguir este orden:

1. Correctitud, seguridad y reglas de negocio.
2. Claridad y facilidad de cambio.
3. Simplicidad de la solución actual.
4. Consistencia con la arquitectura existente.
5. Rendimiento respaldado por mediciones.

No sacrificar correctitud por velocidad ni agregar complejidad para necesidades hipotéticas.


## 3. Principios de diseño

### KISS y YAGNI

- Elegir la solución más simple que satisfaga los requisitos actuales y preserve una evolución segura.
- No crear capas, servicios, repositorios genéricos, eventos, cachés ni infraestructura distribuida «por si acaso».
- Una abstracción debe resolver una variación o un problema presente y demostrable.

### DRY con criterio

- Evitar duplicar conocimiento o reglas de negocio, no cualquier parecido textual.
- No extraer una abstracción hasta que el concepto compartido sea estable.
- Preferir dos implementaciones claras antes que una abstracción incorrecta que acople casos distintos.

### Regla del Boy Scout

- Mejorar nombres, tipos o estructura cuando estén directamente relacionados con el cambio.
- No mezclar refactorizaciones ajenas que amplíen innecesariamente el alcance o dificulten la revisión.

### Trade-offs explícitos

Las decisiones relevantes deben indicar:

- problema actual;
- opción elegida y motivo;
- coste o limitación aceptada;
- señal concreta que justificaría revisar la decisión.

## 4. Arquitectura objetivo: monolito modular

`crm-fran` es una aplicación full-stack desplegada como una unidad. No tratarla como microservicios ni forzar una Clean Architecture ceremonial.

La separación se aplica según la complejidad de cada feature:

1. **Presentación y entrega**: Next.js App Router, React y componentes UI.
2. **Límite de aplicación**: routers y procedures de tRPC; validan, autorizan y coordinan el caso de uso.
3. **Dominio**: reglas de negocio puras cuando la feature tiene comportamiento significativo.
4. **Infraestructura**: Drizzle/PostgreSQL, Better Auth y servicios externos.

### Regla de dependencias

- El dominio no importa React, Next.js, tRPC, Drizzle, Better Auth ni detalles de transporte.
- La presentación no contiene reglas de negocio ni autorización confiable.
- Los routers tRPC no deben acumular consultas, transformaciones y reglas complejas en una sola función.
- La infraestructura implementa detalles requeridos por la aplicación; no define las políticas del negocio.
- `packages/db` no depende de `packages/api` ni de `apps/web`.
- `packages/ui` no depende de features específicas de `apps/web`.

### Cuándo extraer un caso de uso

Una procedure tRPC puede consultar Drizzle directamente para CRUD simple. Extraer un caso de uso o módulo de dominio cuando exista al menos una de estas señales:

- varias reglas o decisiones de negocio;
- la misma operación es utilizada por más de un punto de entrada;
- combinaciones de permisos, estados o transiciones;
- necesidad de probar la regla sin transporte ni base de datos;
- coordinación de varias escrituras o servicios.

No crear interfaces o puertos para cada consulta. Introducirlos cuando exista más de una implementación, un límite externo inestable o una necesidad real de aislamiento en pruebas.

## 5. Responsabilidad por área

| Área | Responsabilidad | No debe contener |
| --- | --- | --- |
| `apps/web/src/app/` | Rutas, layouts, Server Components y handlers de Next.js | Reglas de negocio duplicadas |
| `apps/web/src/components/` | Componentes específicos de la aplicación | Acceso directo a la base de datos |
| `packages/api/` | Contratos tRPC, autorización y coordinación de casos de uso | UI o detalles de navegación |
| `packages/db/` | Schema, migraciones y acceso PostgreSQL con Drizzle | Reglas dependientes de HTTP o React |
| `packages/auth/` | Configuración y adaptación de Better Auth | Autorización exclusiva del cliente |
| `packages/ui/` | Primitivos visuales reutilizables | Lógica específica de leads o CRM |
| `packages/env/` | Validación tipada de variables de entorno | Lecturas dispersas de `process.env` |

Colocar el código específico de una feature cerca de esa feature. Promoverlo a un paquete compartido solo cuando tenga consumidores reales y una responsabilidad estable.

## 6. Clean Code aplicable

### Nombres

- Usar nombres que expresen intención de negocio: `assignLead`, `eligibleCloserIds`, `leadStatus`.
- Evitar nombres genéricos como `data`, `item`, `manager`, `helper` o `utils` cuando oculten el concepto.
- Nombrar booleanos como preguntas: `isActive`, `hasPermission`, `canAssignLead`.

### Funciones

- Una función debe tener una responsabilidad y operar en un único nivel de abstracción.
- Mantener pequeñas las funciones porque la responsabilidad es acotada, no por un límite arbitrario de líneas.
- Reducir argumentos posicionales; usar un objeto cuando los parámetros forman un concepto cohesivo.
- Separar cálculo puro de efectos secundarios cuando mejore la comprensión o las pruebas.
- Evitar flags booleanos que cambien completamente el comportamiento; suelen señalar dos operaciones distintas.

### Comentarios y documentación

- El código debe explicar qué hace; los comentarios deben explicar por qué existe una decisión no evidente.
- No comentar sintaxis ni conservar código muerto comentado.
- Documentar contratos, invariantes, decisiones de seguridad y trade-offs importantes.

### Errores

- No silenciar errores ni usar `catch` vacío.
- Añadir contexto útil sin exponer credenciales ni datos sensibles.
- Traducir errores técnicos a errores de aplicación en el límite apropiado.
- Modelar resultados esperables del negocio de forma explícita; reservar excepciones para fallos excepcionales.

## 7. TypeScript, React y Next.js

- Mantener TypeScript estricto; no introducir `any` ni assertions para ocultar errores de diseño.
- Con `verbatimModuleSyntax`, usar `import type` para imports exclusivamente de tipos.
- Con `noUncheckedIndexedAccess`, manejar explícitamente valores posiblemente ausentes.
- Validar datos desconocidos en los límites con Zod; no validar repetidamente valores ya confiables.
- Preferir Server Components. Añadir `"use client"` solo cuando se necesiten estado, efectos, eventos o APIs del navegador.
- No usar `useMemo` ni `useCallback` como optimización rutinaria: React Compiler está activado.
- Evitar `useEffect` para derivar estado que puede calcularse durante el render.
- Mantener el estado cerca del consumidor; no crear estado global sin consumidores y requisitos claros.
- Usar rutas compatibles con `typedRoutes` y componentes `Link` tipados.
- Evitar waterfalls: iniciar trabajo independiente en paralelo y resolverlo en el límite adecuado.

## 8. tRPC y contratos de aplicación

- Usar Zod v4 para validar inputs externos.
- Usar `protectedProcedure` para operaciones autenticadas y verificar permisos de negocio en el servidor.
- Mantener las procedures como adaptadores: validar, autorizar, invocar lógica y mapear el resultado.
- No confiar en restricciones de UI para autorización.
- No exponer detalles accidentales de Drizzle o de la base de datos como contrato público.
- Definir inputs y outputs según el lenguaje de la feature, no según la forma interna de una tabla.
- Evitar routers genéricos o factories complejas mientras no exista repetición estable.

## 9. Drizzle y PostgreSQL

- Tratar el schema de Drizzle y las migraciones registradas como una unidad de cambio.
- Después de modificar el schema, ejecutar `pnpm db:generate`, revisar el SQL y versionar la migración.
- Usar transacciones cuando varias escrituras deban ser atómicas.
- Definir constraints de base de datos para invariantes que deban cumplirse con independencia de la aplicación.
- Agregar índices a partir de patrones reales de consulta y evidencia, no por intuición.
- Seleccionar solo las columnas necesarias en rutas sensibles al rendimiento.
- Evitar el patrón Repository genérico sobre Drizzle: reduce sus ventajas tipadas y suele añadir indirección sin aislamiento real.

## 10. Seguridad y autenticación

- Better Auth autentica; las reglas de autorización pertenecen al servidor y al dominio de la aplicación.
- Verificar sesión y permisos en cada operación protegida.
- Nunca usar datos del cliente como autoridad para roles, ownership o transiciones permitidas.
- No registrar secretos, tokens, cookies, credenciales ni payloads sensibles.
- `apps/web/.env` contiene credenciales de desarrollo y está versionado: revisar este riesgo antes de cualquier despliegue o publicación.

## 11. Pruebas y verificación

Aplicar RED → GREEN → REFACTOR para nuevas reglas de negocio y correcciones de bugs:

1. escribir una prueba que falle por la razón correcta;
2. implementar el mínimo necesario para hacerla pasar;
3. mejorar el diseño conservando la prueba en verde.

Estrategia proporcional:

- **Reglas puras**: tests unitarios con Vitest.
- **Procedures y persistencia**: tests de integración cuando el contrato o la consulta sean relevantes.
- **Componentes interactivos**: Testing Library cuando el comportamiento no pueda cubrirse en una capa inferior.
- **Flujos críticos completos**: proponer E2E antes de incorporar Playwright o Cypress; todavía no están configurados.

No probar detalles internos ni perseguir cobertura sin significado. Cada prueba debe proteger un comportamiento o una regresión plausible.

Comandos disponibles:

- `pnpm -r test`
- `pnpm check-types`
- `pnpm build`

No afirmar que un cambio funciona sin ejecutar la verificación aplicable o declarar explícitamente qué quedó sin comprobar.

## 12. Sistemas distribuidos y escalabilidad

El sistema actual es un monolito modular. CAP, Saga, balanceadores y consistencia distribuida solo aplican cuando existen límites de red y estado distribuido reales.

- Medir antes de optimizar.
- Preferir primero consultas correctas, índices adecuados y reducción de trabajo innecesario.
- Introducir caché solo con una política explícita de ownership, invalidación, TTL y tolerancia a datos obsoletos.
- Escalar verticalmente mientras sea la opción más simple y suficiente; escalar horizontalmente cuando capacidad, disponibilidad o aislamiento lo justifiquen.
- Usar transacciones PostgreSQL dentro del monolito.
- Considerar Saga únicamente para operaciones que crucen servicios independientes sin una transacción compartida.
- Para cada dependencia remota futura, definir timeout, reintentos limitados, idempotencia y observabilidad.

No diseñar una arquitectura distribuida para aparentar escalabilidad. La distribución añade fallos parciales, latencia y consistencia eventual que deben justificarse.

## 13. Flujo de implementación

1. Identificar el comportamiento solicitado y sus invariantes.
2. Inspeccionar el código y los contratos existentes antes de proponer cambios.
3. Elegir la solución más simple y declarar cualquier trade-off relevante.
4. Crear la prueba fallida cuando corresponda.
5. Implementar un cambio cohesivo y acotado.
6. Refactorizar sin ampliar el alcance.
7. Ejecutar tests y typecheck aplicables; ejecutar build cuando el cambio afecte integración o entrega.
8. Revisar el diff para detectar código muerto, duplicación de conocimiento, cambios accidentales y secretos.

No mezclar en una misma entrega una feature, una migración arquitectónica y limpieza no relacionada.

## 14. Revisión de código

En revisiones, clasificar observaciones como:

- ✅ **Correcto**: decisión clara y coherente con los contratos.
- ⚠️ **Mejorable**: deuda o claridad insuficiente sin fallo demostrado.
- ❌ **Incorrecto**: bug, vulnerabilidad, ruptura contractual o incumplimiento verificable.

Cada hallazgo debe incluir evidencia, impacto y corrección sugerida. Priorizar comportamiento y diseño sobre preferencias estilísticas.

### Checklist

- [ ] Los nombres expresan intención de negocio.
- [ ] Cada módulo tiene una responsabilidad clara.
- [ ] Las dependencias respetan los límites descritos.
- [ ] No se añadieron abstracciones sin una necesidad actual.
- [ ] La autorización se verifica en el servidor.
- [ ] Los inputs externos se validan.
- [ ] Schema y migración permanecen alineados.
- [ ] Las reglas nuevas o corregidas tienen pruebas proporcionales.
- [ ] No se introdujeron secretos ni logs sensibles.
- [ ] La verificación ejecutada está documentada.

## 15. Contexto técnico verificado

- Monorepo con pnpm 11.6.0 y Turborepo.
- Next.js 16.2, App Router, React 19.2.6 y React Compiler.
- TypeScript estricto con `verbatimModuleSyntax`, `noUncheckedIndexedAccess` y `noUnusedLocals`.
- tRPC v11 con TanStack React Query v5.
- PostgreSQL con Drizzle ORM y Drizzle Kit.
- Better Auth 1.6.11 con Drizzle adapter.
- Tailwind CSS v4, shadcn/ui `base-lyra`, Base UI, next-themes y Sonner.
- TanStack React Form y Zod v4.
- Aplicación desplegable única en `apps/web`; API y auth se sirven mediante Route Handlers de Next.js.
- Puerto local: `3001`.
- Variables de entorno: `apps/web/.env`.
- Migraciones: `packages/db/src/migrations/`.
- No existe lint ni formatter configurado actualmente.
- Vitest 4.1.8 está configurado, pero la cobertura del proyecto sigue siendo limitada.

## 16. Referencias internas

- `package.json` y `pnpm-workspace.yaml`: scripts, workspaces y catálogo de versiones.
- `apps/web/next.config.ts`: React Compiler y `typedRoutes`.
- `packages/config/tsconfig.base.json`: reglas TypeScript compartidas.
- `packages/api/src/routers/`: contratos tRPC.
- `packages/db/src/schema/`: schema Drizzle.
- `packages/db/src/migrations/`: historial SQL.
- `packages/auth/src/index.ts`: configuración de Better Auth.
- `packages/ui/src/`: sistema de UI compartido.

**Última actualización:** 2026-08-17
