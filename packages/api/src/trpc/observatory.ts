import type { Permission } from "@crm-fran/db/schema/auth";
import { assertObservatoryAccess } from "../commercial-observatory/access";
import { permittedProcedure } from "./trpc";
export function observatoryProcedure(permissions: Permission[]) {
 return permittedProcedure(permissions).use(async ({ctx,next})=>{
  await assertObservatoryAccess(ctx.role?.id,ctx.permissions);
  return next({ctx});
 });
}
