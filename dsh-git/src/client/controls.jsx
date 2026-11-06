/**
 * Icon-only actions with the host's tooltip material.
 *
 * The panel is a narrow right-Sidebar column, so every row action is an icon:
 * a glyph plus a tooltip keeps three controls inside the width a word such as
 * "Switch" was already consuming. The tooltip is a Base UI Tooltip rather than
 * a native `title`, so it follows the host theme, appears on keyboard focus, and
 * can carry the *reason* a control is disabled.
 *
 * A disabled `<button>` receives no pointer events in the browser, so its
 * tooltip trigger is a focusable span around it. That is the only reliable way
 * to explain why "Remove" is off on the main worktree.
 *
 * @module @litingyes/dsh-git/client/controls
 */

import * as React from 'react'
import { Tooltip } from '@base-ui-components/react/tooltip'

/** Tooltip delay shared by every icon action in the panel, in milliseconds. */
export const TOOLTIP_DELAY = 500

/**
 * Wrap the panel in the shared tooltip provider.
 *
 * @param {{children: React.ReactNode}} props provider props.
 * @returns {React.ReactElement} the provider.
 */
export function TooltipLayer({ children }) {
  return React.createElement(Tooltip.Provider, { delay: TOOLTIP_DELAY, closeDelay: 0 }, children)
}

/**
 * The portaled bubble, styled from the host menu tokens.
 *
 * @param {{text: string}} props bubble props.
 * @returns {React.ReactElement} the bubble tree.
 */
function Bubble({ text }) {
  return React.createElement(
    Tooltip.Portal,
    null,
    React.createElement(
      Tooltip.Positioner,
      {
        className: 'dgit-tooltip-positioner',
        side: 'top',
        align: 'center',
        sideOffset: 6,
        collisionPadding: 8,
      },
      React.createElement(Tooltip.Popup, { className: 'dgit-tooltip' }, text),
    ),
  )
}

/**
 * One square action button with a tooltip.
 *
 * @param {object} props button props.
 * @param {string} props.label accessible name, and the tooltip when enabled.
 * @param {React.ReactNode} props.icon the glyph.
 * @param {() => void} [props.onClick] action; ignored while disabled.
 * @param {boolean} [props.disabled] whether the action is unavailable.
 * @param {string} [props.disabledReason] why it is unavailable; falls back to the label.
 * @param {string} [props.tooltip] tooltip override while enabled (e.g. "Copied").
 * @param {string} [props.variant] `dgit-btn` variant; ghost by default.
 * @param {string} [props.tone] optional `data-tone` for the button.
 * @returns {React.ReactElement} the button.
 */
export function IconButton({
  label,
  icon,
  onClick,
  disabled = false,
  disabledReason,
  tooltip,
  variant = 'ghost',
  tone,
}) {
  const text = disabled === true ? (disabledReason ?? label) : (tooltip ?? label)
  const off = disabled === true

  const button = React.createElement(
    'button',
    {
      type: 'button',
      className: 'dgit-btn dgit-iconbtn',
      'data-variant': variant,
      'data-tone': tone,
      'aria-label': label,
      disabled: off,
      onClick: off ? undefined : onClick,
    },
    icon,
  )

  const trigger = off
    ? React.createElement(
        Tooltip.Trigger,
        {
          // A disabled button swallows hover and focus, so the tooltip hangs off
          // a wrapper that can receive both. The button stays a real button, so
          // screen readers still read it as disabled with its `aria-label`.
          render: React.createElement('span', { className: 'dgit-tipwrap', tabIndex: 0 }),
        },
        button,
      )
    : React.createElement(
        Tooltip.Trigger,
        {
          className: 'dgit-btn dgit-iconbtn',
          'data-variant': variant,
          'data-tone': tone,
          'aria-label': label,
          onClick,
        },
        icon,
      )

  return React.createElement(Tooltip.Root, null, trigger, React.createElement(Bubble, { text }))
}
