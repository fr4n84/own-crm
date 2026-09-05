import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({settings:vi.fn()}));vi.mock("../users/services/navigation-visibility",()=>({getNavigationVisibility:mocks.settings}));
import {assertObservatoryAccess} from "./access";
beforeEach(()=>{vi.clearAllMocks();mocks.settings.mockResolvedValue({configured:false,roleIdsByModule:{}})});
describe("observatory access server policy",()=>{
 for(const roleId of ["role-caller","role-closer"])it("denies default "+roleId,async()=>{await expect(assertObservatoryAccess(roleId,["leads:read"])).rejects.toMatchObject({code:"FORBIDDEN"})});
 it("preserves hybrid default",async()=>{await expect(assertObservatoryAccess("role-caller-closer",["leads:read"])).resolves.toBeUndefined()});
 it("honors grant then revoke without changing lead permissions",async()=>{mocks.settings.mockResolvedValueOnce({configured:true,roleIdsByModule:{"commercial-observatory":["role-caller"]}});await expect(assertObservatoryAccess("role-caller",["leads:read"])).resolves.toBeUndefined();mocks.settings.mockResolvedValueOnce({configured:true,roleIdsByModule:{"commercial-observatory":[]}});await expect(assertObservatoryAccess("role-caller",["leads:read"])).rejects.toMatchObject({code:"FORBIDDEN"})});
 it("never grants missing underlying permissions",async()=>{mocks.settings.mockResolvedValue({configured:true,roleIdsByModule:{"commercial-observatory":["role-caller"]}});await expect(assertObservatoryAccess("role-caller",[])).rejects.toMatchObject({code:"FORBIDDEN"})});
 it("keeps administrators in control",async()=>{await expect(assertObservatoryAccess("role-admin",["*"])).resolves.toBeUndefined();expect(mocks.settings).not.toHaveBeenCalled()});
 it("fails closed on configuration service failure",async()=>{mocks.settings.mockRejectedValue(new Error("database unavailable"));await expect(assertObservatoryAccess("role-caller-closer",["leads:read"])).rejects.toThrow()});
});