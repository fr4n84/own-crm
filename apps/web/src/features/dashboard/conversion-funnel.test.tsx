import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";import {cleanup,render,screen,fireEvent} from "@testing-library/react";
const mocks=vi.hoisted(()=>({ inputs: [] as unknown[], error:false, pending:false }));
const result = (count:number) => ({data:{leadCount:count,totalConversion:0,stages:[{key:"assigned",label:"Asignados",count,previousConversion:100,leads:[]},{key:"contacted",label:"Respuesta",count:0,previousConversion:0,leads:[]}],exits:{noShow:0,notInterested:0,followUp:0},callers:[],closers:[]},isError:mocks.error,isPending:mocks.pending});
vi.mock("@tanstack/react-query",()=>({useQuery:()=>result(10),keepPreviousData:()=>{},useQueries:()=>[result(10),result(5)]}));
vi.mock("@/utils/trpc",()=>({trpc:{dashboard:{conversionFunnel:{queryOptions:(input:unknown)=>{mocks.inputs.push(input);return {queryKey:[input]}}}}}}));
import {ConversionFunnel,validFunnelRange} from "./conversion-funnel";
afterEach(cleanup);beforeEach(()=>{mocks.inputs=[];mocks.error=false;mocks.pending=false});
describe("funnel comparison",()=>{
 it("rejects impossible dates without throwing",()=>{expect(validFunnelRange("2026-99-99","2026-99-99")).toBe(false);expect(validFunnelRange("2026-02-30","2026-03-01")).toBe(false);});
 it("shows cohort count, response and two independent date ranges",()=>{render(<ConversionFunnel/>);expect(screen.getByText(/Número de leads/)).toBeTruthy();expect(screen.getByLabelText("Comparación: desde")).toBeTruthy();expect(screen.getByLabelText("Comparación: hasta")).toBeTruthy();expect(screen.getByText("Respuesta")).toBeTruthy();expect(mocks.inputs).toHaveLength(2);fireEvent.change(screen.getByLabelText("Comparación: desde"),{target:{value:"2026-01-01"}});expect(mocks.inputs.at(-1)).toMatchObject({from:"2026-01-01"});});
 it("does not present partial comparisons after a query fails",()=>{mocks.error=true;render(<ConversionFunnel/>);expect(screen.getByText("No se pudo cargar el embudo")).toBeTruthy();expect(screen.queryByText("Asignados")).toBeNull();});
 it("displays loading until both intervals are available",()=>{mocks.pending=true;render(<ConversionFunnel/>);expect(screen.getByLabelText("Cargando embudo")).toBeTruthy();expect(screen.queryByText("Asignados")).toBeNull();});
});