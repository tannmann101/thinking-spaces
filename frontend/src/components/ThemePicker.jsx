// The manual half of personalization: a compact picker for one item's
// own look. Works the same for a Space and for a single Tool -- both
// take the same four dimensions (see theme/itemTheme.js), so this is
// one component rather than two near-identical ones.
//
// Deliberately shows the *resolved* theme, not just the override: the
// swatches reflect what the item actually looks like right now, whether
// that came from its type's default or from a previous hand-pick. The
// "Reset" action clears the override entirely, dropping the item back
// onto its default -- which is why the override is stored as its own
// nullable field rather than being flattened into the defaults at save
// time. An item that was never themed and an item themed to exactly its
// default are genuinely different things: the second one stops tracking
// its type's default if that default ever changes.

import { useState } from 'react';
import { THEME_DIMENSIONS, resolveBlockTheme, resolveSpaceTheme } from '../theme/itemTheme.js';

function ThemePicker({ item, kind, onSave }) {
  const [open, setOpen] = useState(false);
  const resolved = kind === 'space' ? resolveSpaceTheme(item) : resolveBlockTheme(item);
  const override = (kind === 'space' ? item.theme : item.properties?.theme) || null;

  function pick(dimension, value) {
    onSave({ ...override, [dimension]: value });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="theme-picker-toggle"
        onClick={() => setOpen(true)}
        title="Change how this looks -- color, shape, density, and type"
      >
        ◐ Theme
      </button>
    );
  }

  return (
    <div className="theme-picker">
      <div className="theme-picker-head">
        <span className="mono-caption">Theme</span>
        <span>
          {override && (
            <button type="button" className="btn-ghost-small" onClick={() => onSave(null)}>
              Reset to default
            </button>
          )}
          <button type="button" className="btn-ghost-small" onClick={() => setOpen(false)}>
            Done
          </button>
        </span>
      </div>

      {THEME_DIMENSIONS.map((dimension) => (
        <div key={dimension.key} className="theme-picker-row">
          <span className="theme-picker-label">{dimension.label}</span>
          <span className="theme-picker-options">
            {dimension.options.map((option) => {
              const active = resolved[dimension.key] === option;
              // Color is the one dimension worth showing rather than
              // naming -- a swatch says more than the word "plum".
              if (dimension.key === 'accent') {
                return (
                  <button
                    key={option}
                    type="button"
                    className={`theme-swatch${active ? ' theme-swatch-active' : ''}`}
                    style={{ background: `var(--theme-accent-${option})` }}
                    title={option}
                    aria-label={option}
                    aria-pressed={active}
                    onClick={() => pick(dimension.key, option)}
                  />
                );
              }
              return (
                <button
                  key={option}
                  type="button"
                  className={`category-chip category-chip-toggle${active ? ' category-chip-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => pick(dimension.key, option)}
                >
                  {option}
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default ThemePicker;
