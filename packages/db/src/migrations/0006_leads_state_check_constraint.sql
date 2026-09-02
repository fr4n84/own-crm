UPDATE "leads"
   SET "state" = 'sin asignar'
 WHERE "state" NOT IN ('sin asignar', 'Asignado', 'número erróneo');--> statement-breakpoint
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_state_check"
  CHECK ("state" IN ('sin asignar', 'Asignado', 'número erróneo'));
