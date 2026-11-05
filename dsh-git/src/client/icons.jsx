/**
 * Inline marks.
 *
 * `GIT_PATH` is the Git logo shipped as this package's `icon.svg`, reduced to a
 * single path so the sidebar mark and the header mark can tint it with
 * `currentColor`. Attribution lives in `THIRD_PARTY_NOTICES.md`.
 *
 * @module @litingyes/dsh-git/client/icons
 */

import * as React from 'react'

/** The Git logo outline, verbatim from `icon.svg` (viewBox 0 0 128 128). */
export const GIT_PATH =
  'M124.737 58.378L69.621 3.264c-3.172-3.174-8.32-3.174-11.497 0L46.68 14.71l14.518 14.518c3.375-1.139 7.243-.375 9.932 2.314c2.703 2.706 3.461 6.607 2.294 9.993l13.992 13.993c3.385-1.167 7.292-.413 9.994 2.295c3.78 3.777 3.78 9.9 0 13.679a9.673 9.673 0 0 1-13.683 0a9.68 9.68 0 0 1-2.105-10.521L68.574 47.933l-.002 34.341a9.7 9.7 0 0 1 2.559 1.828c3.778 3.777 3.778 9.898 0 13.683c-3.779 3.777-9.904 3.777-13.679 0c-3.778-3.784-3.778-9.905 0-13.683a9.7 9.7 0 0 1 3.167-2.11V47.333a9.6 9.6 0 0 1-3.167-2.111c-2.862-2.86-3.551-7.06-2.083-10.576L41.056 20.333L3.264 58.123a8.133 8.133 0 0 0 0 11.5l55.117 55.114c3.174 3.174 8.32 3.174 11.499 0l54.858-54.858a8.135 8.135 0 0 0-.001-11.501'

/**
 * The Git mark.
 *
 * @param {{size?: number, title?: string, className?: string}} props mark props.
 * @returns {React.ReactElement} the svg.
 */
export function GitMark({ size = 16, title, className }) {
  const accessible = typeof title === 'string' && title !== ''
  return React.createElement(
    'svg',
    {
      className: className ?? 'dgit-mark',
      viewBox: '0 0 128 128',
      width: size,
      height: size,
      role: accessible ? 'img' : undefined,
      'aria-label': accessible ? title : undefined,
      'aria-hidden': accessible ? undefined : true,
      focusable: 'false',
    },
    React.createElement('path', { fill: 'currentColor', d: GIT_PATH }),
  )
}

/**
 * The Git mark as the right Sidebar's guide card shows it.
 *
 * The guide calls a contributed `icon` with `{ size, className }`; this adapter
 * keeps `GitMark`'s own props unchanged for the panel header.
 *
 * @param {{size?: number, className?: string}} props guide icon props.
 * @returns {React.ReactElement} the svg.
 */
export function GitGuideIcon(props) {
  return GitMark({ size: props?.size ?? 22, className: props?.className ?? 'dgit-mark' })
}

/**
 * One 16px stroke icon.
 *
 * @param {{children: React.ReactNode, className?: string}} props icon props.
 * @returns {React.ReactElement} the svg.
 */
function Icon({ children, className }) {
  return React.createElement(
    'svg',
    {
      className: className ?? 'dgit-icon',
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: 'false',
    },
    children,
  )
}

/** Disclosure chevron. */
export function ChevronRight(props) {
  return Icon({ className: props?.className, children: React.createElement('path', { d: 'M6 3.5 10.5 8 6 12.5' }) })
}

/** Refresh arrow. */
export function RefreshIcon(props) {
  return Icon({
    className: props?.className,
    children: [
      React.createElement('path', { key: 'a', d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
      React.createElement('path', { key: 'b', d: 'M13 2.6v2.9h-2.9' }),
    ],
  })
}

/** Check mark. */
export function CheckIcon(props) {
  return Icon({ className: props?.className, children: React.createElement('path', { d: 'M3.5 8.5 6.5 11.5 12.5 5' }) })
}

/** Plus sign. */
export function PlusIcon(props) {
  return Icon({
    className: props?.className,
    children: [
      React.createElement('path', { key: 'a', d: 'M8 3.5v9' }),
      React.createElement('path', { key: 'b', d: 'M3.5 8h9' }),
    ],
  })
}

/** Branch fork. */
export function BranchIcon(props) {
  return Icon({
    className: props?.className,
    children: [
      React.createElement('circle', { key: 'a', cx: 4.5, cy: 3.5, r: 1.5 }),
      React.createElement('circle', { key: 'b', cx: 4.5, cy: 12.5, r: 1.5 }),
      React.createElement('circle', { key: 'c', cx: 11.5, cy: 5.5, r: 1.5 }),
      React.createElement('path', { key: 'd', d: 'M4.5 5v6' }),
      React.createElement('path', { key: 'e', d: 'M11.5 7v1a3 3 0 0 1-3 3h-4' }),
    ],
  })
}

/** Copy to clipboard. */
export function CopyIcon(props) {
  return Icon({
    className: props?.className,
    children: [
      React.createElement('rect', { key: 'a', x: 6, y: 6, width: 7, height: 7, rx: 1.5 }),
      React.createElement('path', { key: 'b', d: 'M10 6V4.5A1.5 1.5 0 0 0 8.5 3h-5A1.5 1.5 0 0 0 2 4.5v5A1.5 1.5 0 0 0 3.5 11H5' }),
    ],
  })
}
