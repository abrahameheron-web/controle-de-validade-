import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronRight, CircleAlert, ClipboardList, Clock3, LogOut, Package, PackageCheck, Pencil, Plus, Search, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminPanel from "@/components/AdminPanel";
import ProductForm, { type ProductValues } from "@/components/ProductForm";
import { formatCalendarDate, getExpiryThresholds, getProductStatus, entersThreeMonthRangeSoon, PRODUCT_STATUS_LABELS, PRODUCT_STATUS_ORDER, type ProductStatus } from "@shared/expiry";
import type { Product } from "../../../drizzle/schema";
import { trpc } from "@/lib/trpc";

export type EmployeeProfile = {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "employee";
  active: boolean;
  createdAt: Date;
  lastSignedIn: Date | null;
};

type Props = { employee: EmployeeProfile };
type MainTab = "tracking" | "add";

const statusIcons: Record<ProductStatus, typeof Package> = {
  normal: PackageCheck,
  threeMonths: CalendarDays,
  twoMonths: Clock3,
  oneMonth: CircleAlert,
  expired: AlertTriangle,
};

function formatLocalDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const Icon = statusIcons[status];
  return <span className={`status-badge status-${status}`}><Icon size={14} />{PRODUCT_STATUS_LABELS[status]}</span>;
}

function ProductCard({ product, onOpen, today }: { product: Product; onOpen: () => void; today: Date }) {
  const status = getProductStatus(product.expiryDate, today);
  return (
    <button className="product-card" onClick={onOpen} type="button">
      <span aria-hidden="true" className={`product-status-line status-line-${status}`} />
      <span className="product-card-copy">
        <strong>{product.name}</strong>
        <span>Validade {formatCalendarDate(product.expiryDate)}</span>
      </span>
      <span className="product-card-side">
        <span className="quantity-value">{product.quantity}<small> un.</small></span>
        <StatusBadge status={status} />
      </span>
      <ChevronRight aria-hidden="true" className="product-chevron" size={17} />
    </button>
  );
}

export default function ExpiryWorkspace({ employee }: Props) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<MainTab>("tracking");
  const [search, setSearch] = useState("");
  const [today, setToday] = useState(() => new Date());
  const [selected, setSelected] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const productQuery = trpc.products.list.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const createProduct = trpc.products.create.useMutation();
  const updateProduct = trpc.products.update.useMutation();
  const deleteProduct = trpc.products.delete.useMutation();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => window.location.replace("/") });

  const products = productQuery.data ?? [];
  const matchingProducts = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return normalized ? products.filter(product => product.name.toLocaleLowerCase("pt-BR").includes(normalized)) : products;
  }, [products, search]);
  const groupedProducts = useMemo(() => {
    const groups: Record<ProductStatus, Product[]> = {
      normal: [], threeMonths: [], twoMonths: [], oneMonth: [], expired: [],
    };
    for (const product of matchingProducts) groups[getProductStatus(product.expiryDate, today)].push(product);
    return groups;
  }, [matchingProducts, today]);
  const alerts = useMemo(() => matchingProducts
    .filter(product => entersThreeMonthRangeSoon(product.expiryDate, today))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)), [matchingProducts, today]);

  async function refreshProducts() {
    await utils.products.list.invalidate();
  }

  async function saveNew(values: ProductValues) {
    try {
      await createProduct.mutateAsync(values);
      await refreshProducts();
      setTab("tracking");
      setSearch("");
      toast.success("Produto salvo no acompanhamento.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    }
  }

  async function saveEdit(values: ProductValues) {
    if (!editing) return;
    try {
      await updateProduct.mutateAsync({ id: editing.id, ...values });
      await refreshProducts();
      setEditing(null);
      setSelected(null);
      toast.success("Produto atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o produto.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteProduct.mutateAsync({ id: deleting.id });
      await refreshProducts();
      setSelected(null);
      toast.success("Produto excluído e registrado no histórico.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o produto.");
    } finally {
      setDeleting(null);
    }
  }

  const selectedStatus = selected ? getProductStatus(selected.expiryDate, today) : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <img src="/icon.svg" alt="" />
          <div><strong>Controle de Validade</strong><span>Made by Heron</span></div>
        </div>
        <div className="account-actions">
          {employee.role === "admin" && <button aria-label="Abrir administração" className="icon-button admin-open-button" onClick={() => setAdminOpen(true)} title="Administração" type="button"><Shield size={19} /></button>}
          <div className="user-chip"><span className="user-avatar">{employee.displayName.trim().charAt(0).toLocaleUpperCase("pt-BR")}</span><span className="user-name">{employee.displayName}</span></div>
          <button aria-label="Sair do aplicativo" className="icon-button" disabled={logout.isPending} onClick={() => logout.mutate(undefined)} title="Sair" type="button"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="workspace-main">
        {tab === "tracking" ? (
          <>
            <section className="page-heading">
              <div><p className="eyebrow">Acompanhamento diário</p><h1>Validades em dia.</h1><p className="page-subtitle">Confira o que precisa de atenção e o que ainda está tranquilo.</p></div>
              <span className="date-today">{new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(today)}</span>
            </section>

            <section aria-label="Resumo por situação" className="status-summary">
              {PRODUCT_STATUS_ORDER.map(status => {
                const Icon = statusIcons[status];
                return <div className={`summary-chip summary-${status}`} key={status}><span className="summary-icon"><Icon size={16} /></span><span className="summary-count">{groupedProducts[status].length}</span><span className="summary-label">{PRODUCT_STATUS_LABELS[status]}</span></div>;
              })}
            </section>

            <section className={`attention-card ${alerts.length ? "has-alerts" : ""}`} aria-live="polite">
              <div className="attention-icon"><AlertTriangle size={18} /></div>
              <div className="attention-content">
                <div className="attention-title-row"><h2>ATENÇÃO</h2><span>{alerts.length} {alerts.length === 1 ? "produto" : "produtos"}</span></div>
                {alerts.length > 0 ? <p>Entram na faixa de 3 meses nos próximos 7 dias.</p> : <p>Nenhum produto entra na faixa de 3 meses nos próximos 7 dias.</p>}
                {alerts.length > 0 && <div className="attention-list">{alerts.slice(0, 4).map(product => <button className="attention-item" key={product.id} onClick={() => setSelected(product)} type="button"><span>{product.name}</span><span>Entra em 3 meses: {formatLocalDate(getExpiryThresholds(product.expiryDate).threeMonths)}</span></button>)}</div>}
                {alerts.length > 4 && <small>+ {alerts.length - 4} produto(s)</small>}
              </div>
            </section>

            <div className="search-row">
              <label className="search-box"><Search size={19} /><input aria-label="Pesquisar produto pelo nome" onChange={event => setSearch(event.target.value)} placeholder="Pesquisar produto..." value={search} />{search && <button aria-label="Limpar pesquisa" className="search-clear" onClick={() => setSearch("")} type="button">×</button>}</label>
              <span className="total-count">{matchingProducts.length} {matchingProducts.length === 1 ? "produto" : "produtos"}</span>
            </div>

            {productQuery.isLoading ? <div className="loading-inline"><span className="loader-dot" /> Carregando produtos compartilhados…</div> : productQuery.isError ? <div className="connection-card inline-error"><h2>Não foi possível carregar os produtos</h2><p>Verifique a conexão com o banco compartilhado.</p><button className="button button-quiet" onClick={() => void productQuery.refetch()} type="button">Tentar novamente</button></div> : (
              <div className="product-groups">
                {products.length === 0 ? (
                  <div className="empty-products"><span className="empty-icon"><Package size={25} /></span><h2>Nenhum produto cadastrado</h2><p>Adicione o primeiro produto para começar o acompanhamento.</p><button className="button button-primary" onClick={() => setTab("add")} type="button"><Plus size={17} /> Adicionar produto</button></div>
                ) : matchingProducts.length === 0 ? (
                  <div className="empty-products compact-empty"><h2>Nenhum resultado</h2><p>Não encontramos produtos com esse nome.</p></div>
                ) : PRODUCT_STATUS_ORDER.map(status => groupedProducts[status].length === 0 ? null : (
                  <section className="product-group" key={status}>
                    <div className="group-heading"><span className={`group-mark status-line-${status}`} /><h2>{PRODUCT_STATUS_LABELS[status]}</h2><span className="group-count">{groupedProducts[status].length}</span></div>
                    <div className="product-list">{groupedProducts[status].map(product => <ProductCard key={product.id} onOpen={() => setSelected(product)} product={product} today={today} />)}</div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <section className="page-heading add-heading"><div><p className="eyebrow">Novo cadastro</p><h1>Adicionar produto</h1><p className="page-subtitle">Ele aparecerá na faixa correta automaticamente.</p></div></section>
            <section className="add-form-card">
              <ProductForm busy={createProduct.isPending} onSave={saveNew} submitText="SALVAR PRODUTO" />
            </section>
          </>
        )}
      </main>

      <nav aria-label="Navegação principal" className="bottom-nav">
        <button aria-current={tab === "tracking" ? "page" : undefined} className={tab === "tracking" ? "nav-item active" : "nav-item"} onClick={() => setTab("tracking")} type="button"><ClipboardList size={20} /><span>Acompanhamento</span></button>
        <button aria-current={tab === "add" ? "page" : undefined} className={tab === "add" ? "nav-item active" : "nav-item"} onClick={() => setTab("add")} type="button"><Plus size={21} /><span>Adicionar</span></button>
      </nav>

      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
        {selected && selectedStatus && <DialogContent className="product-dialog">
          <DialogHeader><div className="detail-status"><StatusBadge status={selectedStatus} /></div><DialogTitle>{selected.name}</DialogTitle><DialogDescription>Informações do produto no acompanhamento.</DialogDescription></DialogHeader>
          <div className="detail-grid">
            <div><span>Quantidade</span><strong>{selected.quantity} un.</strong></div>
            <div><span>Data de entrada</span><strong>{formatCalendarDate(selected.entryDate)}</strong></div>
            <div><span>Data de validade</span><strong>{formatCalendarDate(selected.expiryDate)}</strong></div>
            <div><span>Situação atual</span><strong><StatusBadge status={selectedStatus} /></strong></div>
          </div>
          <DialogFooter className="detail-actions">
            <button className="button button-quiet" onClick={() => { setEditing(selected); setSelected(null); }} type="button"><Pencil size={16} /> Editar</button>
            {employee.role === "admin" && <button className="button button-danger-outline" onClick={() => setDeleting(selected)} type="button"><Trash2 size={16} /> Excluir produto</button>}
          </DialogFooter>
        </DialogContent>}
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
        {editing && <DialogContent className="product-dialog edit-dialog">
          <DialogHeader><DialogTitle>Editar produto</DialogTitle><DialogDescription>Atualize os dados para todos os funcionários.</DialogDescription></DialogHeader>
          <ProductForm busy={updateProduct.isPending} initial={editing} onCancel={() => setEditing(null)} onSave={saveEdit} submitText="Salvar alterações" />
        </DialogContent>}
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir este produto?</AlertDialogTitle><AlertDialogDescription>{deleting ? `${deleting.name} deixará de aparecer no acompanhamento. A exclusão será registrada no histórico.` : ""}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="button-danger" disabled={deleteProduct.isPending} onClick={event => { event.preventDefault(); void confirmDelete(); }}>{deleteProduct.isPending ? "Excluindo…" : "Excluir"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {employee.role === "admin" && <AdminPanel currentEmployeeId={employee.id} onOpenChange={setAdminOpen} open={adminOpen} />}
    </div>
  );
}
