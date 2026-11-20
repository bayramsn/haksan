// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteRequirementsDialog } from "./QuoteRequirementsDialog";

const state = vi.hoisted(() => ({
  permissions: ["opportunities.update", "opportunities.read", "companies.update"],
  roles: ["sales"],
  update: vi.fn(),
  companyRefetch: vi.fn(),
  opportunityRefetch: vi.fn(),
  opportunity: { id: "opp-1", companyId: "company-1", ownerUserId: "owner-1", title: "Eski konu", primaryContactId: "contact-1", requestedMachine: "CNC", paymentMethod: "cash" },
}));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
vi.mock("../ui/button", () => ({ Button: ({ children, variant: _variant, size: _size, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock("../ui/label", () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));
vi.mock("../ui/input", () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ hasRole: (role: string) => state.roles.includes(role), hasPermission: (permission: string) => state.permissions.includes(permission), activeDivision: "all", activeDepartment: null }) }));
vi.mock("../../../lib/services", () => ({ opportunityService: { update: state.update, get: vi.fn(), list: vi.fn(), assignees: vi.fn() } }));
vi.mock("../../lib/store", () => ({ useStore: () => ({ products: [] }) }));
vi.mock("../../lib/companyServerData", () => ({ useCompanyDetail: () => ({ data: { id: "company-1", name: "Firma" }, refetch: state.companyRefetch, isFetching: false, isError: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => {
  const kind = queryKey[1];
  return {
    data: kind === "opportunity" ? state.opportunity
      : kind === "assignees" ? [{ id: "owner-1", name: "Sorumlu" }]
      : { data: [{ id: "opp-1", companyId: "company-1", title: "Firmanın fırsatı" }, { id: "other", companyId: "other-company", title: "Başka firma" }] },
    isPending: false, isError: false, isSuccess: true, refetch: state.opportunityRefetch,
  };
} }));
vi.mock("../shared/RemoteContactCombobox", () => ({ RemoteContactCombobox: () => <div>Kontak seçici</div> }));
vi.mock("../shared/RequestedMachineCombobox", () => ({ RequestedMachineCombobox: () => <div>Makine seçici</div> }));
vi.mock("../shared/PaymentMethodSelect", () => ({ PaymentMethodSelect: () => <div>Ödeme seçici</div> }));
vi.mock("./CreateDialogs", () => ({
  EditCustomerDialog: ({ onSaved }: { onSaved: () => void }) => <button onClick={onSaved}>Firma değişikliğini kaydet</button>,
  CreateContactDialog: () => <div>Yeni kontak formu</div>,
  LogActivityDialog: ({ opportunityId, defaultKind, onLogged }: { opportunityId: string; defaultKind: string; onLogged: () => void }) => <button onClick={onLogged}>Arama: {opportunityId} {defaultKind}</button>,
}));

const defaultProps = () => ({
  open: true, onOpenChange: vi.fn(), opportunityId: "opp-1", companyId: "company-1",
  blockers: [{ key: "subject", label: "Satış konusu zorunludur", actionKey: "edit_subject" }],
  onRecheck: vi.fn().mockResolvedValue(undefined), onOpportunitySelected: vi.fn(),
});
beforeEach(() => {
  state.permissions = ["opportunities.update", "opportunities.read", "companies.update"];
  state.roles = ["sales"];
  state.update.mockReset().mockResolvedValue({});
  state.companyRefetch.mockReset().mockResolvedValue({});
  state.opportunityRefetch.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe("teklif gerekliliklerini tamamlama", () => {
  it("eksikleri gösterir; bilgileri sunucuya kaydeder ve gereklilikleri yeniden sorgular", async () => {
    const props = defaultProps();
    render(<QuoteRequirementsDialog {...props} />);
    expect(screen.getByText(/Satış konusu zorunludur/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Satış konusu / talep başlığı"), { target: { value: "Yeni talep" } });
    fireEvent.click(screen.getByRole("button", { name: "Fırsat bilgilerini kaydet" }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith("opp-1", expect.objectContaining({ title: "Yeni talep", ownerUserId: "owner-1" })));
    await waitFor(() => expect(props.onRecheck).toHaveBeenCalledOnce());
  });

  it("düzenleme yetkisi olmayan kullanıcıya kaydetme izni vermez", () => {
    state.permissions = ["opportunities.read"];
    render(<QuoteRequirementsDialog {...defaultProps()} />);
    const save = screen.getByRole("button", { name: "Fırsat bilgilerini kaydet" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(state.update).not.toHaveBeenCalled();
    expect(screen.getByText("Bu bilgileri tamamlamak için fırsat düzenleme yetkisi gereklidir.")).toBeTruthy();
  });

  it("başka firmanın fırsatını göstermeden seçimi teklif formuna iletir", () => {
    const props = { ...defaultProps(), opportunityId: null };
    render(<QuoteRequirementsDialog {...props} />);
    expect(screen.queryByText("Başka firma")).toBeNull();
    fireEvent.change(screen.getByLabelText("Firmaya ait fırsatı seçin"), { target: { value: "opp-1" } });
    expect(props.onOpportunitySelected).toHaveBeenCalledWith("opp-1");
  });

  it("sorumlu atama rolü olmayan kullanıcı diğer alanları kaydederken sorumluyu göndermez", async () => {
    state.roles = [];
    render(<QuoteRequirementsDialog {...defaultProps()} />);
    expect((screen.getByLabelText("Sorumlu") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Fırsat bilgilerini kaydet" }));
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
    expect(state.update.mock.calls[0][1]).not.toHaveProperty("ownerUserId");
  });

  it("firma düzenleyicisinde gerçek kayıt sonrası yeniden kontrol eder", async () => {
    const props = defaultProps();
    render(<QuoteRequirementsDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Firma bilgilerini düzenle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Firma değişikliğini kaydet" }));
    await waitFor(() => expect(props.onRecheck).toHaveBeenCalledOnce());
  });

  it("sunucu kaydı reddettiğinde başarısızlığı gösterir ve tamamlanmış saymaz", async () => {
    state.update.mockRejectedValueOnce(new Error("Forbidden"));
    const props = defaultProps();
    render(<QuoteRequirementsDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Fırsat bilgilerini kaydet" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(props.onRecheck).not.toHaveBeenCalled();
  });
});
