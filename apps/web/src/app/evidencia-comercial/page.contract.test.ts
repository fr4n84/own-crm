import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const legacy = readFileSync(resolve(process.cwd(),"src/app/evidencia-comercial/page.tsx"),"utf8");
const internal = readFileSync(resolve(process.cwd(),"src/app/observatorio-comercial/evidencia-comercial/page.tsx"),"utf8");
const panel = readFileSync(resolve(process.cwd(),"src/features/commercial-observatory/commercial-evidence-panel.tsx"),"utf8");

describe("commercial evidence internal tab",()=>{
  it("redirects the legacy route and reuses one internal panel",()=>{
    expect(legacy).toContain('redirect("/observatorio-comercial/evidencia-comercial")');
    expect(legacy).not.toContain("commercialEvidence.lead");
    expect(internal).toContain("CommercialEvidencePanel");
  });
  it("preserves stable evidence views and honest states",()=>{
    for(const title of ["Evidencia comercial explicable","Score económico","Casos gemelos","Microsegmentos","Confianza","Historial semanal","Por política","Por nivel de respaldo"])expect(panel).toContain(title);
    for(const state of ["Cargando leads","No se pudieron cargar los leads","No hay leads disponibles","No hay casos gemelos comparables","No se pudieron cargar los casos gemelos","Muestra insuficiente","No se pudo cargar la calibración"])expect(panel).toContain(state);
    expect(panel).toContain("Verdad económica insuficiente");
  });
  it("never exposes a currency selector or combines currencies through implicit FX",()=>{
    expect(panel).not.toContain('placeholder="Moneda"');
    expect(panel).not.toContain("setCurrency");
    expect(panel).toContain("currencies.map");
    expect(panel).toContain("Cada moneda se calcula y presenta por separado");
    expect(panel).toContain("No se aplica conversión FX");
  });
  it("uses compact Arc composition with bounded responsive tables and accessible explanations",()=>{
    for(const token of ["CardHeader","CardContent","TabsList","TabsTrigger","text-muted-foreground","max-h-72 overflow-auto","overflow-x-auto","size-11","aria-label="])expect(panel).toContain(token);
    expect(panel).not.toMatch(/(?:bg|text|border)-(?:blue|red|green|yellow|gray|slate|zinc|neutral|stone)-\d{2,3}/);
  });
});
