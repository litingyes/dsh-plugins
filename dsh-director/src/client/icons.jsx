/**
 * Inline icons. They inherit `currentColor`, so the host theme decides the
 * colour and light/dark switching needs no extra rules.
 *
 * @module @litingyes/dsh-director/client/icons
 */

import * as React from 'react'

function svg(props, children) {
  return React.createElement(
    'svg',
    {
      width: props.size ?? 16,
      height: props.size ?? 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': 'true',
      className: props.className,
    },
    ...children,
  )
}

/** A clapperboard mark used by the tab chip. */
export function DirectorMark(props = {}) {
  return svg(
    props,
    [
      React.createElement('path', {
        key: 'top',
        d: 'M4.2 8.1 19.2 5.3l.7 3.7L4.9 11.8z',
        fill: 'currentColor',
      }),
      React.createElement('rect', {
        key: 'body',
        x: 4.5,
        y: 11.6,
        width: 15,
        height: 8.4,
        rx: 1.6,
        stroke: 'currentColor',
        strokeWidth: 1.4,
      }),
      React.createElement('path', {
        key: 'lines',
        d: 'M7.2 15.2h5.2M7.2 17.4h3.4',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
      }),
    ],
  )
}

/** The guide card's larger mark. */
export function DirectorGuideIcon(props = {}) {
  return DirectorMark({ ...props, size: props.size ?? 20 })
}

/** Refresh arrows. */
export function RefreshIcon(props = {}) {
  return svg(props, [
    React.createElement('path', {
      key: 'path',
      d: 'M19 12a7 7 0 1 1-2.05-4.95M19 4.5V9h-4.5',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/** Two sheets, for the copy action. */
export function CopyIcon(props = {}) {
  return svg(props, [
    React.createElement('rect', {
      key: 'back',
      x: 8.5,
      y: 3.5,
      width: 11,
      height: 13,
      rx: 2,
      stroke: 'currentColor',
      strokeWidth: 1.4,
    }),
    React.createElement('path', {
      key: 'front',
      d: 'M15.5 20.5h-9a2 2 0 0 1-2-2v-9',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
    }),
  ])
}

/** A check, for the copied state. */
export function CheckIcon(props = {}) {
  return svg(props, [
    React.createElement('path', {
      key: 'check',
      d: 'M5 12.5 9.5 17 19 7',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/** A chevron, rotated by the caller for open/closed. */
export function ChevronIcon(props = {}) {
  return svg(props, [
    React.createElement('path', {
      key: 'chevron',
      d: 'M9 6l6 6-6 6',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/** A download arrow. */
export function DownloadIcon(props = {}) {
  return svg(props, [
    React.createElement('path', {
      key: 'shaft',
      d: 'M12 4v10.5M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}
