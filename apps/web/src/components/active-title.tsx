"use client"
import { usePathname } from "next/navigation"
const ROUTE_MAP: Record<string, string> = {
    "/": "Dashboard",
    "/alerts": "Alertas",
    "/users": "Usuarios",
    "/leads": "Leads personales",
    "/leads-personales": "Leads personales",
    "/ventas-closer": "Ventas closer",
    "/whatsapp": "WhatsApp",
    "/leads-generales": "Leads generales",
    "/estadisticas-personales": "Estadísticas personales",
    "/estadisticas-personales/rankings": "Rankings",
    "/usuarios-accesos": "Usuarios y accesos",
    "/observatorio-comercial/inteligencia": "Inteligencia",
    "/observatorio-comercial/feedback": "Feedback",
    "/analytical": "Analitica",
    "/campaigns": "Campañas",
    "/calendar": "Calendario",
    "/ranking": "Ranking",
    "/tickets": "Tickets",
    "/login": "Iniciar Sesión",
    "/signup": "Registrarse",
}
export function ActiveTitle() {
    const pathname = usePathname()
    return <>{ROUTE_MAP[pathname] ?? "Aurea"}</>
}
