/**
 * The panel's own controls.
 *
 * Nothing here is imported from the Harness UI packages: a plugin may not load
 * another Client package as a module, and a throwing component would blank the
 * slot entry. So these are ordinary elements with the harness's theme tokens,
 * the behaviour users rely on kept intact — a dialog closes on Escape, a modal
 * takes focus, a segmented control is a radio group — and every class namespaced
 * under this plugin's prefix.
 *
 * @module @litingyes/dsh-github/client/controls
 */

import * as React from 'react'
import { CloseIcon } from './icons.jsx'

/**
 * A clickable glyph with an accessible name.
 *
 * @param {{label: string, onClick: Function, disabled?: boolean, tone?: 'default'|'danger', children: React.ReactNode}} props
 *   button props.
 * @returns {React.ReactElement} the button.
 */
export function IconButton({ label, onClick, disabled = false, tone = 'default', children }) {
  return React.createElement(
    'button',
    {
      type: 'button',
      className: `dgh-icon-button dgh-icon-button--${tone}`,
      onClick,
      disabled,
      title: label,
      'aria-label': label,
    },
    children,
  )
}

/**
 * A text button.
 *
 * @param {{children: React.ReactNode, onClick?: Function, disabled?: boolean,
 *   variant?: 'primary'|'secondary'|'ghost'|'danger', type?: string}} props button props.
 * @returns {React.ReactElement} the button.
 */
export function Button({ children, onClick, disabled = false, variant = 'secondary', type = 'button' }) {
  return React.createElement(
    'button',
    { type, className: `dgh-button dgh-button--${variant}`, onClick, disabled },
    children,
  )
}

/**
 * A segmented control, rendered as radios so arrow keys and screen readers work.
 *
 * @param {{items: {id: string, label: React.ReactNode, count?: number}[], value: string,
 *   onChange: (id: string) => void, label: string}} props control props.
 * @returns {React.ReactElement} the group.
 */
export function Segmented({ items, value, onChange, label }) {
  return React.createElement(
    'div',
    { className: 'dgh-segmented', role: 'radiogroup', 'aria-label': label },
    items.map(item =>
      React.createElement(
        'button',
        {
          key: item.id,
          type: 'button',
          role: 'radio',
          'aria-checked': item.id === value ? 'true' : 'false',
          className: item.id === value ? 'dgh-segment dgh-segment--active' : 'dgh-segment',
          onClick: () => onChange(item.id),
        },
        item.label,
        item.count === undefined
          ? null
          : React.createElement('span', { className: 'dgh-segment-count' }, String(item.count)),
      ),
    ),
  )
}

/**
 * A small pill for a state or a count.
 *
 * @param {{children: React.ReactNode, tone?: 'neutral'|'open'|'closed'|'merged'|'warn'}} props badge props.
 * @returns {React.ReactElement} the badge.
 */
export function Badge({ children, tone = 'neutral' }) {
  return React.createElement('span', { className: `dgh-badge dgh-badge--${tone}` }, children)
}

/**
 * One label chip. The colour comes from the Host (hex) or from a stable hash.
 *
 * @param {{name: string, color: string}} props chip props.
 * @returns {React.ReactElement} the chip.
 */
export function LabelChip({ name, color }) {
  return React.createElement(
    'span',
    { className: 'dgh-label', title: name },
    React.createElement('span', { className: 'dgh-label-dot', style: { background: color } }),
    name,
  )
}

/**
 * A loading line.
 *
 * @param {{label: string}} props spinner props.
 * @returns {React.ReactElement} the row.
 */
export function Spinner({ label }) {
  return React.createElement(
    'div',
    { className: 'dgh-loading', role: 'status' },
    React.createElement('span', { className: 'dgh-spinner', 'aria-hidden': 'true' }),
    React.createElement('span', null, label),
  )
}

/**
 * An empty list or an empty panel.
 *
 * @param {{title: string, children?: React.ReactNode}} props empty state props.
 * @returns {React.ReactElement} the block.
 */
export function EmptyState({ title, children }) {
  return React.createElement(
    'div',
    { className: 'dgh-empty' },
    React.createElement('p', { className: 'dgh-empty-title' }, title),
    children ?? null,
  )
}

/**
 * A failure with the one action that can help.
 *
 * @param {{message: string, hint?: string, actionLabel?: string, onAction?: Function}} props error props.
 * @returns {React.ReactElement} the card.
 */
export function ErrorCard({ message, hint, actionLabel, onAction }) {
  return React.createElement(
    'div',
    { className: 'dgh-error', role: 'alert' },
    React.createElement('p', { className: 'dgh-error-message' }, message),
    hint === undefined ? null : React.createElement('p', { className: 'dgh-error-hint' }, hint),
    actionLabel === undefined
      ? null
      : React.createElement(
          Button,
          { variant: 'secondary', onClick: onAction },
          actionLabel,
        ),
  )
}

/**
 * A labelled text field.
 *
 * @param {{value: string, onChange: (value: string) => void, placeholder?: string,
 *   label: string, rows?: number, disabled?: boolean}} props field props.
 * @returns {React.ReactElement} the field.
 */
export function TextArea({ value, onChange, placeholder, label, rows = 3, disabled = false }) {
  return React.createElement('textarea', {
    className: 'dgh-textarea',
    value,
    placeholder,
    rows,
    disabled,
    'aria-label': label,
    onChange: event => onChange(event.target.value),
  })
}

/**
 * A single-line labeled input.
 *
 * @param {{value: string, onChange: (value: string) => void, placeholder?: string,
 *   label: string, disabled?: boolean}} props field props.
 * @returns {React.ReactElement} the field.
 */
export function TextInput({ value, onChange, placeholder, label, disabled = false }) {
  return React.createElement('input', {
    className: 'dgh-input',
    type: 'text',
    value,
    placeholder,
    disabled,
    'aria-label': label,
    onChange: event => onChange(event.target.value),
  })
}

/**
 * A modal confirmation.
 *
 * Escape cancels, the confirm button takes focus when the dialog opens, and the
 * background is click-to-cancel — the three behaviours the harness modals have.
 *
 * @param {{open: boolean, title: string, message?: string, confirmLabel: string,
 *   cancelLabel: string, busy?: boolean, onConfirm: Function, onCancel: Function}} props dialog props.
 * @returns {React.ReactElement | null} the dialog, or nothing.
 */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, busy = false, onConfirm, onCancel }) {
  const confirmRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return undefined
    const onKeyDown = event => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    confirmRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return React.createElement(
    'div',
    { className: 'dgh-overlay', onClick: onCancel },
    React.createElement(
      'div',
      {
        className: 'dgh-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onClick: event => event.stopPropagation(),
      },
      React.createElement(
        'div',
        { className: 'dgh-dialog-head' },
        React.createElement('h2', { className: 'dgh-dialog-title' }, title),
        IconButton({ label: cancelLabel, onClick: onCancel, children: React.createElement(CloseIcon, { size: 14 }) }),
      ),
      message === undefined ? null : React.createElement('p', { className: 'dgh-dialog-message' }, message),
      React.createElement(
        'div',
        { className: 'dgh-dialog-actions' },
        React.createElement(Button, { variant: 'ghost', onClick: onCancel, disabled: busy }, cancelLabel),
        React.createElement(
          'button',
          {
            ref: confirmRef,
            type: 'button',
            className: 'dgh-button dgh-button--danger',
            onClick: onConfirm,
            disabled: busy,
          },
          confirmLabel,
        ),
      ),
    ),
  )
}
