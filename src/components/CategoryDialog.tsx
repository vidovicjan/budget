import { useState, type FormEvent } from 'react';
import type { Category, Frequency, Service, TxType } from '../lib/types';
import { useStore } from '../store';
import { Modal, SelectBox } from './common';
import { CATEGORY_COLORS, nextColor, uid } from '../lib/data';
import { money, parseAmount, round2 } from '../lib/format';
import { monthlyCost, nextPayment, scheduleLabel } from '../lib/services';
import { mediumDate, todayISO } from '../lib/dates';
import { Icon } from './Icon';

interface Props {
  cat: Category | null;
  type: TxType;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Light swatches get a dark check mark, dark ones a light one. */
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
};

export function CategoryDialog({ cat, type, onClose, onSaved }: Props) {
  const { data, update } = useStore();
  const [id] = useState(cat?.id ?? uid());
  const [name, setName] = useState(cat?.name ?? '');
  const [color, setColor] = useState(cat?.color ?? nextColor(data, type));
  const [limit, setLimit] = useState(cat && cat.budget > 0 ? cat.budget.toFixed(2) : '');
  const [services, setServices] = useState<Service[]>(() => data.services.filter((s) => s.categoryId === cat?.id));
  /** Id of the service being edited, 'new' for one being added, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const kind = cat?.type ?? type;
  const today = todayISO();

  const trimmed = name.trim();
  const duplicate = data.categories.some((c) => c.id !== cat?.id && c.type === kind && c.name.toLowerCase() === trimmed.toLowerCase());
  const nameError = !trimmed ? 'Give the category a name.' : duplicate ? 'A category with this name already exists.' : '';
  const limitValue = limit.trim() ? parseAmount(limit) : 0;
  const limitError = !Number.isFinite(limitValue) || limitValue < 0 ? 'Enter a valid amount, or leave it empty for no limit.' : '';
  const editingError = editing ? 'Save or cancel the service you are editing first.' : '';
  const used = cat ? data.transactions.filter((t) => t.categoryId === cat.id).length : 0;
  const perMonth = services.reduce((s, x) => s + monthlyCost(x), 0);

  const save = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || editingError || (kind === 'expense' && limitError)) return;
    const next: Category = { id, name: trimmed, color, type: kind, budget: kind === 'expense' ? round2(limitValue) : 0 };
    update((d) => ({
      ...d,
      categories: cat ? d.categories.map((c) => (c.id === cat.id ? next : c)) : [...d.categories, next],
      services: [...d.services.filter((s) => s.categoryId !== id), ...services.map((s) => ({ ...s, categoryId: id }))],
    }));
    onSaved(cat ? 'Category updated' : 'Category added');
    onClose();
  };

  const remove = () => {
    if (!cat) return;
    const parts = [];
    if (used) parts.push(`its ${used} transaction${used === 1 ? '' : 's'} will be kept as Uncategorized`);
    if (services.length) parts.push(`its ${services.length} service${services.length === 1 ? '' : 's'} will be removed`);
    if (!window.confirm(`Delete "${cat.name}"?${parts.length ? ' ' + parts.join(' and ') + '.' : ''}`)) return;
    update((d) => ({
      ...d,
      categories: d.categories.filter((c) => c.id !== cat.id),
      services: d.services.filter((s) => s.categoryId !== cat.id),
    }));
    onSaved('Category deleted');
    onClose();
  };

  const saveService = (s: Service) => {
    setServices((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s]));
    setEditing(null);
  };

  const removeService = (s: Service) => {
    if (!window.confirm(`Remove "${s.name}"? Payments already added stay in your transactions.`)) return;
    setServices((list) => list.filter((x) => x.id !== s.id));
  };

  return (
    <Modal title={cat ? `Edit ${cat.name}` : kind === 'expense' ? 'Add category' : 'Add income category'} onClose={onClose} width={560}>
      <form onSubmit={save} noValidate style={{ display: 'contents' }}>
        <div className="field">
          <label htmlFor="cat-name">Name</label>
          <input
            id="cat-name"
            data-autofocus
            className="input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={submitted && !!nameError}
            placeholder={kind === 'expense' ? 'e.g. Subscriptions' : 'e.g. Bonus'}
          />
          {submitted && nameError && <span className="error-text">{nameError}</span>}
        </div>

        {kind === 'expense' && (
          <div className="field">
            <label htmlFor="cat-limit">
              Monthly limit <span className="opt">(optional)</span>
            </label>
            <input
              id="cat-limit"
              className="input"
              inputMode="decimal"
              placeholder="No limit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-invalid={submitted && !!limitError}
            />
            {submitted && limitError && <span className="error-text">{limitError}</span>}
          </div>
        )}

        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend className="label" style={{ padding: 0, marginBottom: 10 }}>
            Color
          </legend>
          <div className="color-grid">
            {CATEGORY_COLORS.map((c) => (
              <button type="button" key={c} aria-label={c} aria-pressed={c === color} onClick={() => setColor(c)} style={{ background: c }}>
                {c === color && <Icon name="check" size={16} strokeWidth={2.4} color={isLight(c) ? '#1A2744' : '#FDFAF4'} />}
              </button>
            ))}
          </div>
        </fieldset>

        {kind === 'expense' && (
          <section className="svc-section" aria-labelledby="svc-title">
            <div className="svc-head">
              <div className="stack">
                <h3 id="svc-title" className="label" style={{ margin: 0 }}>
                  Services <span className="opt">(optional)</span>
                </h3>
                <span className="sub">Subscriptions or bills you pay on a schedule, like a streaming service or rent.</span>
              </div>
              {services.length > 0 && (
                <span className="svc-total">
                  {money(perMonth)}
                  <span className="sub"> / month</span>
                </span>
              )}
            </div>

            {services.length > 0 && (
              <ul className="svc-list">
                {services.map((s) =>
                  editing === s.id ? (
                    <li key={s.id}>
                      <ServiceEditor service={s} onSave={saveService} onCancel={() => setEditing(null)} />
                    </li>
                  ) : (
                    <li key={s.id} className="svc-item">
                      <span className="tx-main">
                        <span className="tx-name">{s.name}</span>
                        <span className="tx-meta">
                          {scheduleLabel(s)} · next {mediumDate(nextPayment(s, today))}
                          {!s.autoAdd && ' · not added automatically'}
                        </span>
                      </span>
                      <span className="tx-amt">{money(s.amount)}</span>
                      <button type="button" className="icon-btn" aria-label={`Edit ${s.name}`} disabled={!!editing} onClick={() => setEditing(s.id)}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${s.name}`} disabled={!!editing} onClick={() => removeService(s)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </li>
                  )
                )}
              </ul>
            )}

            {editing === 'new' ? (
              <ServiceEditor service={null} onSave={saveService} onCancel={() => setEditing(null)} />
            ) : (
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={!!editing} onClick={() => setEditing('new')}>
                <Icon name="plus" strokeWidth={2.2} /> Add service
              </button>
            )}
            {submitted && editingError && <span className="error-text">{editingError}</span>}
          </section>
        )}

        <div className="modal-foot">
          {cat && (
            <button type="button" className="btn btn-danger btn-lg" onClick={remove}>
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ServiceEditor({ service, onSave, onCancel }: { service: Service | null; onSave: (s: Service) => void; onCancel: () => void }) {
  const { data } = useStore();
  const today = todayISO();
  const [name, setName] = useState(service?.name ?? '');
  const [amount, setAmount] = useState(service ? service.amount.toFixed(2) : '');
  const [frequency, setFrequency] = useState<Frequency>(service?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(service?.startDate ?? today);
  const [accountId, setAccountId] = useState(service?.accountId ?? data.accounts[0]?.id ?? '');
  const [autoAdd, setAutoAdd] = useState(service?.autoAdd ?? true);
  const [tried, setTried] = useState(false);

  const value = parseAmount(amount);
  const errors = {
    name: name.trim() ? '' : 'Enter the service name.',
    amount: Number.isFinite(value) && value > 0 ? '' : 'Enter an amount greater than zero.',
    date: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? '' : 'Pick a date.',
  };
  // Payments between the first payment date and today will be added right away.
  const backfill = autoAdd && startDate < today && (!service || !service.autoAdd || startDate < service.startDate);

  const submit = () => {
    setTried(true);
    if (errors.name || errors.amount || errors.date) return;
    onSave({
      id: service?.id ?? uid(),
      name: name.trim(),
      amount: round2(Math.abs(value)),
      categoryId: service?.categoryId ?? '',
      accountId,
      frequency,
      startDate,
      autoAdd,
    });
  };

  return (
    // Enter inside the editor saves the service, not the whole category.
    <div
      className="svc-editor"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="two">
        <div className="field" style={{ flexBasis: 240 }}>
          <label htmlFor="svc-name">Service</label>
          <input
            id="svc-name"
            className="input sm"
            autoFocus
            placeholder="e.g. Video streaming"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={tried && !!errors.name}
          />
          {tried && errors.name && <span className="error-text">{errors.name}</span>}
        </div>
        <div className="field" style={{ flexBasis: 140 }}>
          <label htmlFor="svc-amount">Amount</label>
          <input
            id="svc-amount"
            className="input sm"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={tried && !!errors.amount}
          />
          {tried && errors.amount && <span className="error-text">{errors.amount}</span>}
        </div>
      </div>

      <div className="two">
        <div className="field">
          <span className="label" id="svc-freq-label">
            Paid
          </span>
          <div className="toggle" role="group" aria-labelledby="svc-freq-label" style={{ padding: 3 }}>
            {(['monthly', 'yearly'] as Frequency[]).map((f) => (
              <button type="button" key={f} aria-pressed={frequency === f} onClick={() => setFrequency(f)} style={{ height: 38 }}>
                {f === 'monthly' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="svc-date">{service ? 'First payment' : 'Payment date'}</label>
          <input id="svc-date" className="input sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-invalid={tried && !!errors.date} />
          {tried && errors.date && <span className="error-text">{errors.date}</span>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="svc-account">Paid from</label>
        <SelectBox id="svc-account" className="sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectBox>
      </div>

      <label className="check">
        <input type="checkbox" checked={autoAdd} onChange={(e) => setAutoAdd(e.target.checked)} />
        <span>Add each payment to transactions automatically</span>
      </label>
      {backfill && (
        <p className="hint">
          Payments from {mediumDate(startDate)} until today will be added too. To track only future payments, set the date of the next payment.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-dark" onClick={submit}>
          {service ? 'Update service' : 'Add service'}
        </button>
      </div>
    </div>
  );
}
