/**
 * Copy button with a transient "copied" state.
 *
 * `navigator.clipboard` needs a secure context (the Web GUI is on localhost, so
 * it is available), but the fallback keeps the button honest when the clipboard
 * permission is denied: it still selects the text and tries `execCommand`.
 *
 * @module @litingyes/dsh-director/client/copy-button
 */

import * as React from 'react'
import { CheckIcon, CopyIcon } from './icons.jsx'

/** Last-resort clipboard write for a browser that refuses the async API. */
function fallbackCopy(text) {
  if (typeof document === 'undefined') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

/**
 * A small copy button.
 *
 * @param {{ text: string, label: string, copiedLabel: string, className?: string }} props text and labels.
 * @returns {React.ReactElement} button.
 */
export function CopyButton({ text, label, copiedLabel, className = '' }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef(null)

  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const onClick = async () => {
    if (typeof text !== 'string' || text === '') return
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) ok = fallbackCopy(text)
    if (!ok) return
    setCopied(true)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }

  return React.createElement(
    'button',
    {
      type: 'button',
      className: `ddr-btn ddr-copy ${className}`.trim(),
      onClick,
      disabled: typeof text !== 'string' || text === '',
      title: copied ? copiedLabel : label,
      'aria-label': copied ? copiedLabel : label,
    },
    copied
      ? React.createElement(CheckIcon, { size: 13 })
      : React.createElement(CopyIcon, { size: 13 }),
    React.createElement('span', null, copied ? copiedLabel : label),
  )
}
