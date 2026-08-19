import { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './FilterSidebar.css';

const DEFAULT_OPEN = ['price', 'size', 'color', 'fit'];

function CheckboxGroup({ options = [], draft, onToggle, idKey, emptyLabel }) {
  if (!Array.isArray(options) || options.length === 0) {
    return <p className="filter-sidebar__empty">{emptyLabel || 'No options yet'}</p>;
  }
  return (
    <div className="filter-sidebar__options">
      {options.map((option) => {
        const active = Array.isArray(draft[idKey]) && draft[idKey].includes(option);
        return (
          <label key={option} className="filter-sidebar__option">
            <input
              type="checkbox"
              className="filter-sidebar__checkbox"
              checked={active}
              onChange={() => onToggle(idKey, option)}
            />
            <span className="filter-sidebar__option-label">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Snitch-style filter sidebar with accordion sections, a staged draft and a
 * fixed bottom action bar (Clear All / Apply Filters).
 */
export default function FilterSidebar({
  metadata,
  draft,
  onToggle,
  onPriceChange,
  onInStock,
  onApply,
  onClear,
  loading,
  resultCount,
  activeCount,
}) {
  const [openSections, setOpenSections] = useState(() => new Set(DEFAULT_OPEN));

  const toggleSection = useCallback((id) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const Section = useCallback(
    ({ id, title, children }) => {
      const open = openSections.has(id);
      return (
        <section className={`filter-sidebar__section${open ? ' filter-sidebar__section--open' : ''}`}>
          <button
            type="button"
            className="filter-sidebar__header"
            onClick={() => toggleSection(id)}
            aria-expanded={open}
          >
            <span className="filter-sidebar__header-title">{title}</span>
            <ChevronDown className="filter-sidebar__chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {open && <div className="filter-sidebar__body">{children}</div>}
        </section>
      );
    },
    [openSections, toggleSection]
  );

  const price = metadata?.price || { min: 0, max: 0 };
  const inStockActive = draft.inStock === true;

  return (
    <div className="filter-sidebar">
      <div className="filter-sidebar__scroll">
        {loading ? (
          <div className="filter-sidebar__loading" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="filter-sidebar__skeleton" />
            ))}
          </div>
        ) : (
          <>
            <Section id="price" title="Price">
              <div className="filter-sidebar__price">
                <label className="filter-sidebar__field">
                  <span className="filter-sidebar__field-label">Min</span>
                  <input
                    type="number"
                    min={0}
                    max={price.max}
                    value={draft.minPrice ?? ''}
                    onChange={(e) => onPriceChange('minPrice', e.target.value)}
                    placeholder={`₹${price.min}`}
                    className="filter-sidebar__input"
                    aria-label="Minimum price"
                  />
                </label>
                <span className="filter-sidebar__price-sep">—</span>
                <label className="filter-sidebar__field">
                  <span className="filter-sidebar__field-label">Max</span>
                  <input
                    type="number"
                    min={0}
                    max={price.max}
                    value={draft.maxPrice ?? ''}
                    onChange={(e) => onPriceChange('maxPrice', e.target.value)}
                    placeholder={`₹${price.max}`}
                    className="filter-sidebar__input"
                    aria-label="Maximum price"
                  />
                </label>
              </div>
            </Section>

            <Section id="size" title="Size">
              <CheckboxGroup options={metadata?.sizes} draft={draft} onToggle={onToggle} idKey="size" />
            </Section>

            <Section id="color" title="Colour">
              <CheckboxGroup options={metadata?.colors} draft={draft} onToggle={onToggle} idKey="color" />
            </Section>

            {metadata?.brands?.length > 0 && (
              <Section id="brand" title="Brand">
                <CheckboxGroup options={metadata.brands} draft={draft} onToggle={onToggle} idKey="brand" />
              </Section>
            )}

            {metadata?.patterns?.length > 0 && (
              <Section id="pattern" title="Pattern">
                <CheckboxGroup options={metadata.patterns} draft={draft} onToggle={onToggle} idKey="pattern" />
              </Section>
            )}

            {metadata?.fits?.length > 0 && (
              <Section id="fit" title="Fit">
                <CheckboxGroup options={metadata.fits} draft={draft} onToggle={onToggle} idKey="fit" />
              </Section>
            )}

            {metadata?.materials?.length > 0 && (
              <Section id="material" title="Material">
                <CheckboxGroup options={metadata.materials} draft={draft} onToggle={onToggle} idKey="material" />
              </Section>
            )}

            {metadata?.collars?.length > 0 && (
              <Section id="collar" title="Collar">
                <CheckboxGroup options={metadata.collars} draft={draft} onToggle={onToggle} idKey="collar" />
              </Section>
            )}

            {metadata?.sleeves?.length > 0 && (
              <Section id="sleeves" title="Sleeves">
                <CheckboxGroup options={metadata.sleeves} draft={draft} onToggle={onToggle} idKey="sleeves" />
              </Section>
            )}

            {metadata?.deliveryTime?.length > 0 && (
              <Section id="delivery" title="Delivery Time">
                <CheckboxGroup options={metadata.deliveryTime} draft={draft} onToggle={onToggle} idKey="deliveryTime" />
              </Section>
            )}

            <Section id="availability" title="Availability">
              <label className="filter-sidebar__option">
                <input
                  type="checkbox"
                  className="filter-sidebar__checkbox"
                  checked={inStockActive}
                  onChange={() => onInStock(inStockActive ? null : true)}
                />
                <span className="filter-sidebar__option-label">In stock only</span>
              </label>
            </Section>
          </>
        )}
      </div>

      <div className="filter-sidebar__actions">
        <button type="button" className="filter-sidebar__clear" onClick={onClear}>
          Clear All
        </button>
        <button type="button" className="filter-sidebar__apply" onClick={onApply}>
          Apply Filters
          {activeCount > 0 && <span className="filter-sidebar__apply-count">{activeCount}</span>}
          {resultCount !== undefined && (
            <span className="filter-sidebar__apply-results">· {resultCount}</span>
          )}
        </button>
      </div>
    </div>
  );
}