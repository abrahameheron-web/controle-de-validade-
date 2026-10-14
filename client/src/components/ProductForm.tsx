import { useEffect, useState, type FormEvent } from "react";
import type { Product } from "../../../drizzle/schema";

export type ProductValues = {
  name: string;
  quantity: number;
  entryDate: string;
  expiryDate: string;
};

type Props = {
  initial?: Pick<Product, "name" | "quantity" | "entryDate" | "expiryDate">;
  submitText: string;
  busy?: boolean;
  onSave: (values: ProductValues) => Promise<void>;
  onCancel?: () => void;
};

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export default function ProductForm({ initial, submitText, busy = false, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [entryDate, setEntryDate] = useState(initial?.entryDate ?? todayIso());
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate ?? "");

  useEffect(() => {
    setName(initial?.name ?? "");
    setQuantity(String(initial?.quantity ?? 1));
    setEntryDate(initial?.entryDate ?? todayIso());
    setExpiryDate(initial?.expiryDate ?? "");
  }, [initial?.name, initial?.quantity, initial?.entryDate, initial?.expiryDate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 0) return;
    await onSave({ name: name.trim(), quantity: count, entryDate, expiryDate });
  }

  return (
    <form className="product-form" onSubmit={submit}>
      <label className="field">
        <span>Nome do produto</span>
        <input autoComplete="off" maxLength={160} onChange={event => setName(event.target.value)} placeholder="Ex.: Leite integral" required value={name} />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Quantidade</span>
          <input inputMode="numeric" min="0" onChange={event => setQuantity(event.target.value)} required step="1" type="number" value={quantity} />
        </label>
        <label className="field">
          <span>Data de entrada</span>
          <input onChange={event => setEntryDate(event.target.value)} required type="date" value={entryDate} />
        </label>
      </div>
      <label className="field">
        <span>Data de validade</span>
        <input onChange={event => setExpiryDate(event.target.value)} required type="date" value={expiryDate} />
      </label>
      <div className="form-actions">
        {onCancel && <button className="button button-quiet" onClick={onCancel} type="button">Cancelar</button>}
        <button className="button button-primary" disabled={busy || !name.trim() || !entryDate || !expiryDate} type="submit">
          {busy ? "Salvando…" : submitText}
        </button>
      </div>
    </form>
  );
}
