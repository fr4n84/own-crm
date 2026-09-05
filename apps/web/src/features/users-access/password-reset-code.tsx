"use client";
import { useState } from "react";
import { Button } from "@crm-fran/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@crm-fran/ui/components/dialog";
import { trpcClient } from "@/utils/trpc";
export function PasswordResetCode({userId,name}:{userId:string;name:string}) {
 const [open,setOpen]=useState(false); const [result,setResult]=useState<{code:string;expiresAt:string}|null>(null); const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 return <><Button className="mt-2" size="sm" variant="outline" onClick={()=>setOpen(true)}>Restablecer contraseña</Button>
 <Dialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);setResult(null);setError("");}}}><DialogContent><DialogHeader><DialogTitle>Recuperación de {name}</DialogTitle><DialogDescription>Genera un código individual de un solo uso. Caduca a los 15 minutos y sustituye cualquier código anterior. No permite ver la contraseña.</DialogDescription></DialogHeader>
 <p className="text-sm">Compártelo solo con esta persona por un canal privado, después de verificar su identidad. Debe introducirlo junto a su correo en /recuperar-contrasena. Quien tenga el código podrá cambiar la contraseña.</p>
 {error&&<p role="alert">{error}</p>}{result&&<div role="status" className="flex flex-col gap-2"><p>Código (se oculta al cerrar):</p><code className="break-all select-all rounded border p-3">{result.code}</code><p>Caduca: {new Date(result.expiresAt).toLocaleTimeString("es-ES")}</p></div>}
 <Button disabled={busy} onClick={async()=>{setBusy(true);setError("");setResult(null);try{setResult(await trpcClient.users.issuePasswordResetCode.mutate({userId}));}catch{setError("No se pudo generar el código. Inténtalo de nuevo.");}finally{setBusy(false);}}}>{busy?"Generando…":result?"Generar otro código":"Generar código"}</Button>
 </DialogContent></Dialog></>;
}
