import { useState, type FormEvent } from "react";
import { History, LoaderCircle, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCalendarDate, formatDateTime } from "@shared/expiry";
import { trpc } from "@/lib/trpc";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; currentEmployeeId: number };
type AdminTab = "staff" | "history";

function readableAction(action: string) {
  if (action === "created") return "Cadastrou produto";
  if (action === "edited") return "Editou produto";
  return "Excluiu produto";
}

function describeSnapshot(value: string | null) {
  if (!value) return "—";
  try {
    const snapshot = JSON.parse(value) as { name?: string; quantity?: number; entryDate?: string; expiryDate?: string };
    const parts = [];
    if (snapshot.name) parts.push(`Nome: ${snapshot.name}`);
    if (snapshot.quantity !== undefined) parts.push(`Quantidade: ${snapshot.quantity}`);
    if (snapshot.entryDate) parts.push(`Entrada: ${formatCalendarDate(snapshot.entryDate)}`);
    if (snapshot.expiryDate) parts.push(`Validade: ${formatCalendarDate(snapshot.expiryDate)}`);
    return parts.join(" · ") || "—";
  } catch {
    return "—";
  }
}

export default function AdminPanel({ open, onOpenChange, currentEmployeeId }: Props) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<AdminTab>("staff");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [removeId, setRemoveId] = useState<number | null>(null);

  const staff = trpc.staff.list.useQuery(undefined, { enabled: open && tab === "staff" });
  const history = trpc.staff.history.useQuery(undefined, { enabled: open && tab === "history", refetchInterval: 15_000 });
  const create = trpc.staff.create.useMutation();
  const remove = trpc.staff.remove.useMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await create.mutateAsync({ displayName: displayName.trim(), username, password, role });
      setDisplayName("");
      setUsername("");
      setPassword("");
      setRole("employee");
      await utils.staff.list.invalidate();
      toast.success("Funcionário adicionado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o funcionário.");
    }
  }

  async function confirmRemove() {
    if (removeId === null) return;
    try {
      await remove.mutateAsync({ id: removeId });
      await utils.staff.list.invalidate();
      toast.success("Acesso removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o acesso.");
    } finally {
      setRemoveId(null);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="admin-sheet" side="right">
          <SheetHeader className="admin-sheet-header">
            <div className="admin-heading-icon"><Shield size={20} /></div>
            <SheetTitle>Administração</SheetTitle>
            <SheetDescription>Gerencie os acessos e consulte as alterações dos produtos.</SheetDescription>
          </SheetHeader>

          <div className="admin-tabs" role="tablist" aria-label="Área administrativa">
            <button aria-selected={tab === "staff"} className={tab === "staff" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("staff")} role="tab" type="button"><Users size={16} /> Funcionários</button>
            <button aria-selected={tab === "history"} className={tab === "history" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("history")} role="tab" type="button"><History size={16} /> Histórico</button>
          </div>

          <div className="admin-panel-body">
            {tab === "staff" && (
              <section className="admin-section">
                <div className="section-heading">
                  <div><h3>Funcionários</h3><p>Contas individuais para a equipe.</p></div>
                  {staff.data && <span className="count-pill">{staff.data.length}</span>}
                </div>
                {staff.isLoading ? <div className="inline-loading"><LoaderCircle className="spin" size={18} /> Carregando…</div> : staff.isError ? <p className="form-error">Não foi possível carregar os funcionários.</p> : (
                  <div className="staff-list">
                    {staff.data?.map(person => (
                      <div className="staff-row" key={person.id}>
                        <div className="staff-avatar">{person.displayName.trim().charAt(0).toLocaleUpperCase("pt-BR")}</div>
                        <div className="staff-info"><strong>{person.displayName}</strong><span>@{person.username} · {person.role === "admin" ? "Administrador" : "Funcionário"}</span></div>
                        {person.id !== currentEmployeeId && <button aria-label={`Remover ${person.displayName}`} className="icon-button danger-icon" onClick={() => setRemoveId(person.id)} type="button"><Trash2 size={17} /></button>}
                      </div>
                    ))}
                    {staff.data?.length === 0 && <p className="empty-note">Nenhum funcionário cadastrado.</p>}
                  </div>
                )}

                <form className="staff-form" onSubmit={submit}>
                  <div className="section-heading staff-form-heading"><div><h3>Novo acesso</h3><p>O funcionário recebe um usuário e uma senha.</p></div><UserPlus size={19} /></div>
                  <label className="field"><span>Nome</span><input autoComplete="name" maxLength={120} onChange={event => setDisplayName(event.target.value)} required value={displayName} /></label>
                  <label className="field"><span>Usuário</span><input autoCapitalize="none" autoComplete="off" maxLength={48} onChange={event => setUsername(event.target.value)} required value={username} /></label>
                  <label className="field"><span>Senha inicial</span><input autoComplete="new-password" minLength={10} onChange={event => setPassword(event.target.value)} required type="password" value={password} /><small>Mínimo de 10 caracteres.</small></label>
                  <label className="field"><span>Permissão</span><select onChange={event => setRole(event.target.value as "employee" | "admin")} value={role}><option value="employee">Funcionário</option><option value="admin">Administrador</option></select></label>
                  <button className="button button-primary full-width" disabled={create.isPending} type="submit">{create.isPending ? "Adicionando…" : "Adicionar funcionário"}</button>
                </form>
              </section>
            )}

            {tab === "history" && (
              <section className="admin-section">
                <div className="section-heading"><div><h3>Histórico de produtos</h3><p>Criações, edições e exclusões recentes.</p></div></div>
                {history.isLoading ? <div className="inline-loading"><LoaderCircle className="spin" size={18} /> Carregando…</div> : history.isError ? <p className="form-error">Não foi possível carregar o histórico.</p> : (
                  <div className="history-list">
                    {history.data?.map(event => (
                      <article className="history-card" key={event.id}>
                        <div className="history-topline"><span className={`history-action history-${event.action}`}>{readableAction(event.action)}</span><time>{formatDateTime(event.createdAt)}</time></div>
                        <strong className="history-product">{event.productName}</strong>
                        <span className="history-employee">{event.employeeName}</span>
                        <div className="history-changes">
                          {event.previousInfo && <p><span>Antes</span>{describeSnapshot(event.previousInfo)}</p>}
                          {event.newInfo && <p><span>Depois</span>{describeSnapshot(event.newInfo)}</p>}
                        </div>
                      </article>
                    ))}
                    {history.data?.length === 0 && <p className="empty-note">Ainda não há alterações registradas.</p>}
                  </div>
                )}
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={removeId !== null} onOpenChange={isOpen => { if (!isOpen) setRemoveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover acesso?</AlertDialogTitle>
            <AlertDialogDescription>Esse funcionário não poderá mais entrar no aplicativo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="button-danger" disabled={remove.isPending} onClick={event => { event.preventDefault(); void confirmRemove(); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
