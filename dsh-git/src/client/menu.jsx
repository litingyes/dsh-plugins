/**
 * A right-click menu over one list row.
 *
 * The panel has two row types that carry history actions — commit nodes and
 * branch rows — and both ask for the same gesture: right-click (or long-press
 * on touch) opens a small menu of actions for that row. This module owns that
 * shell, so the two call sites only describe their items.
 *
 * Items are data, not JSX: `{ key, label, disabled, reason, tone,
 * separatorBefore, onSelect }`. A refused item stays in the menu — hiding it
 * would leave the reader wondering whether the action exists — and its `title`
 * repeats the reason the tooltip would give.
 *
 * @module @litingyes/dsh-git/client/menu
 */

import * as React from 'react'
import { ContextMenu } from '@base-ui-components/react/context-menu'

/**
 * Translate one availability decision into disabled-item wording.
 *
 * The pure `*-actions` modules answer in dictionary keys so they stay free of
 * the locale service; every menu call site needs the same conversion.
 *
 * @param {{enabled: boolean, reasonKey: string|null}|undefined} decision availability.
 * @param {(key: string) => string} t translator.
 * @returns {string|undefined} the refusal reason, or undefined when allowed.
 */
export function refusalText(decision, t) {
  if (decision?.enabled === true || typeof decision?.reasonKey !== 'string') return undefined
  return t(decision.reasonKey)
}

/**
 * One menu item row.
 *
 * @param {{item: object}} props item props.
 * @returns {React.ReactElement} the item.
 */
function Item({ item }) {
  return React.createElement(
    ContextMenu.Item,
    {
      className: 'dgit-menu-item',
      'data-tone': item.tone,
      disabled: item.disabled === true,
      title: item.disabled === true ? item.reason : undefined,
      onClick: item.disabled === true ? undefined : item.onSelect,
    },
    item.label,
  )
}

/**
 * Wrap one row in a context menu.
 *
 * The trigger element is the row itself when `className` is given, which keeps
 * the row a direct child of its section (and its last-child border) exactly as
 * it was before the menu existed.
 *
 * @param {object} props menu props.
 * @param {string} props.label accessible name of the menu.
 * @param {object[]} props.items items, rendered in order.
 * @param {React.ReactNode} props.children the row content.
 * @param {string} [props.className] trigger class; the row's own class when it is the row.
 * @param {Record<string, unknown>} [props.attributes] extra trigger attributes.
 * @returns {React.ReactElement} the menu-wrapped row.
 */
export function ContextActions({ label, items, children, className, attributes }) {
  const rows = []
  for (const item of items) {
    if (item.separatorBefore === true) {
      rows.push(React.createElement(ContextMenu.Separator, {
        key: `sep:${item.key}`,
        className: 'dgit-menu-sep',
      }))
    }
    rows.push(React.createElement(Item, { key: item.key, item }))
  }

  return React.createElement(
    ContextMenu.Root,
    null,
    React.createElement(
      ContextMenu.Trigger,
      {
        className: className ?? 'dgit-menu-anchor',
        ...(attributes ?? {}),
      },
      children,
    ),
    React.createElement(
      ContextMenu.Portal,
      null,
      React.createElement(
        ContextMenu.Positioner,
        {
          className: 'dgit-menu-positioner',
          sideOffset: 4,
          collisionPadding: 8,
        },
        React.createElement(
          ContextMenu.Popup,
          { className: 'dgit-menu', 'aria-label': label },
          rows,
        ),
      ),
    ),
  )
}
