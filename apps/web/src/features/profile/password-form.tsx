"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@crm-fran/ui/components/button";
import { Input } from "@crm-fran/ui/components/input";
import { authClient } from "@/lib/auth-client";
import { trpcClient } from "@/utils/trpc";

export function PasswordForm({ recovery = false }: { recovery?: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  return <form className="flex max-w-md flex-col gap-4" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setError(""); setSuccess(false);
    if (newPassword !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      if (recovery) await trpcClient.auth.redeemPasswordReset.mutate({ email: email.trim(), code: code.trim(), newPassword });
      else {
        const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
        if (result.error) { setError("No se pudo cambiar la contraseña. Comprueba la contraseña actual y vuelve a intentarlo."); return; }
      }
      setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setCode(""); setSuccess(true);
    } catch { setError(recovery ? "Código inválido, caducado o servicio no disponible. Solicita otro código si es necesario." : "No se pudo cambiar la contraseña. Inténtalo de nuevo."); }
    finally { setBusy(false); }
  }}>
    {recovery ? <>
      <label className="flex flex-col gap-1">Correo de la cuenta<Input type="email" autoComplete="email" value={email} maxLength={254} required onChange={e=>setEmail(e.target.value)} /></label>
      <label className="flex flex-col gap-1">Código de recuperación<Input autoComplete="off" value={code} minLength={43} maxLength={43} required onChange={e=>setCode(e.target.value)} /></label>
      <p className="text-sm text-muted-foreground">Pide un código a administración. Es de un solo uso y caduca a los 15 minutos.</p>
    </> : <label className="flex flex-col gap-1">Contraseña actual<Input type="password" autoComplete="current-password" value={currentPassword} required onChange={e=>setCurrentPassword(e.target.value)} /></label>}
    <label className="flex flex-col gap-1">Nueva contraseña<Input type="password" autoComplete="new-password" value={newPassword} minLength={8} maxLength={128} required onChange={e=>setNewPassword(e.target.value)} /></label>
    <label className="flex flex-col gap-1">Repetir nueva contraseña<Input type="password" autoComplete="new-password" value={confirmation} minLength={8} maxLength={128} required onChange={e=>setConfirmation(e.target.value)} /></label>
    <p className="text-sm text-muted-foreground">Entre 8 y 128 caracteres. Se cerrarán {recovery ? "todas las" : "las otras"} sesiones de la cuenta.</p>
    {error && <p role="alert">{error}</p>}
    {success && <p role="status">Contraseña actualizada.{recovery ? " Ahora inicia sesión con tu nueva contraseña." : ""}</p>}
    <Button disabled={busy} type="submit">{busy ? "Guardando…" : recovery ? "Restablecer contraseña" : "Cambiar contraseña"}</Button>
    {recovery && <Link href="/login" className="underline">Volver al inicio de sesión</Link>}
  </form>;
}
