import { CATEGORIES } from "../../../lib/categories";
import { BUSINESS_GROUPS, KIND_LABEL_MAX } from "../../../lib/sync/businessTypes";

// The two controls that belong together in both Sync forms, as plain pieces with no
// state of their own, so they can be rendered and checked without a browser.

// The type of business, grouped by the category each is filed under by default.
export function BusinessTypeSelect({ id, value, onChange }) {
  return (
    <select id={id} className="admin-select" value={value} onChange={onChange} autoComplete="off">
      {BUSINESS_GROUPS.map((group) => (
        <optgroup key={group.category} label={group.category}>
          {group.types.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// The category: set from the type, and changeable by hand when a business is an exception.
//   effective  the category the business will be filed under
//   overridden whether it was chosen by hand (it differs from the type's own)
//   picking    whether the list of categories is open
export function CategoryControl({ effective, derived, overridden, picking, onStartPicking, onChoose, onReset }) {
  return (
    <div>
      <span className="admin-label">Category</span>
      <div className="admin-row-title">{effective}</div>
      <div className="admin-helper">
        {overridden ? `Chosen by hand. The business type would give ${derived}.` : "Set from the business type."}
      </div>
      <div className="admin-actions">
        {overridden ? (
          <button type="button" className="btn-outline" onClick={onReset}>Use the type&apos;s category</button>
        ) : picking ? null : (
          <button type="button" className="btn-outline" onClick={onStartPicking}>Change category</button>
        )}
      </div>
      {picking ? (
        <div className="admin-field">
          <label className="admin-label" htmlFor="category-choice">Choose a category</label>
          <select id="category-choice" className="admin-select" value={effective} onChange={(e) => onChoose(e.target.value)} autoComplete="off">
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.label}>{c.label}</option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

// Shown only when the type is Other: what the business is, in the admin's own words.
// Customers see these words in place of the business type.
export function KindLabelField({ id, value, onChange }) {
  return (
    <div className="admin-field">
      <label className="admin-label" htmlFor={id}>What is this business?</label>
      <input
        id={id}
        className="admin-input"
        type="text"
        value={value}
        onChange={onChange}
        maxLength={KIND_LABEL_MAX}
        required
        autoComplete="off"
        placeholder="For example: Motorcycle workshop"
      />
      <div className="admin-helper">
        {value.length} / {KIND_LABEL_MAX} characters. Customers see these words in place of the business type.
      </div>
    </div>
  );
}
