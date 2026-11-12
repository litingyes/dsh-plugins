/**
 * The panel's glyphs, drawn as plain SVG paths.
 *
 * Nothing is imported: the browser half bundles no third-party module, so every
 * icon is one `path` (or a couple of them) with `currentColor` and no width or
 * height of its own. Callers set the size.
 *
 * These are generic shapes — a circle with a dot for an issue, two nodes and an
 * arrow for a pull request, a bell for notifications — not GitHub's marks.
 *
 * @module @litingyes/dsh-github/client/icons
 */

import * as React from 'react'

/**
 * Shared SVG frame.
 *
 * @param {{size?: number, className?: string, children: React.ReactNode}} props frame props.
 * @returns {React.ReactElement} the svg element.
 */
function Svg({ size = 16, className, children }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      className,
    },
    children,
  )
}

export function RepoIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('path', { d: 'M3 12.5V3.6c0-.8.6-1.4 1.4-1.4H13v9.6H4.4C3.6 11.8 3 12 3 12.5Z' }),
    React.createElement('path', { d: 'M3 12.5c0 .6.6 1 1.4 1H13' }),
  )
}

export function IssueIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('circle', { cx: 8, cy: 8, r: 5.5 }),
    React.createElement('circle', { cx: 8, cy: 8, r: 1.4, fill: 'currentColor', stroke: 'none' }),
  )
}

export function PullIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('circle', { cx: 4.5, cy: 3.5, r: 1.6 }),
    React.createElement('circle', { cx: 4.5, cy: 12.5, r: 1.6 }),
    React.createElement('path', { d: 'M4.5 5.1v5.8' }),
    React.createElement('circle', { cx: 11.5, cy: 12.5, r: 1.6 }),
    React.createElement('path', { d: 'M11.5 10.9V6.4a1.2 1.2 0 0 0-1.2-1.2H7.6' }),
    React.createElement('path', { d: 'm9 3.6-1.6 1.6L9 6.8' }),
  )
}

export function BellIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('path', { d: 'M8 2.4a3.4 3.4 0 0 0-3.4 3.4c0 3-1.2 4.1-1.2 4.1h9.2s-1.2-1.1-1.2-4.1A3.4 3.4 0 0 0 8 2.4Z' }),
    React.createElement('path', { d: 'M6.6 12.4a1.5 1.5 0 0 0 2.8 0' }),
  )
}

export function CommentIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('path', { d: 'M13.5 8.4c0 2.4-2.5 4.3-5.5 4.3-.7 0-1.4-.1-2-.3L3 13.4l.9-2.4C3.3 10.3 2.5 9.4 2.5 8.4 2.5 6 5 4.1 8 4.1s5.5 1.9 5.5 4.3Z' }),
  )
}

export function RefreshIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
    React.createElement('path', { d: 'M13 2.6v3h-3' }),
  )
}

export function ExternalIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('path', { d: 'M9.5 3H13v3.5' }),
    React.createElement('path', { d: 'M13 3 7.6 8.4' }),
    React.createElement('path', { d: 'M12 9.8V12a1.4 1.4 0 0 1-1.4 1.4H4A1.4 1.4 0 0 1 2.6 12V5.4A1.4 1.4 0 0 1 4 4h2.2' }),
  )
}

export function BackIcon(props) {
  return React.createElement(Svg, props, React.createElement('path', { d: 'M9.5 3.5 5 8l4.5 4.5' }))
}

export function LockIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('rect', { x: 3.5, y: 7, width: 9, height: 6, rx: 1.2 }),
    React.createElement('path', { d: 'M5.8 7V5.6a2.2 2.2 0 0 1 4.4 0V7' }),
  )
}

export function StarIcon(props) {
  return React.createElement(Svg, props, React.createElement('path', { d: 'm8 2.6 1.7 3.4 3.8.6-2.7 2.6.6 3.7L8 11.2l-3.4 1.7.6-3.7-2.7-2.6 3.8-.6Z' }))
}

export function ForkIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('circle', { cx: 4.5, cy: 12, r: 1.5 }),
    React.createElement('circle', { cx: 11.5, cy: 12, r: 1.5 }),
    React.createElement('circle', { cx: 8, cy: 4, r: 1.5 }),
    React.createElement('path', { d: 'M4.5 10.5V8.6c0-.8.7-1.5 1.5-1.5h4c.8 0 1.5.7 1.5 1.5v1.9' }),
  )
}

export function CheckIcon(props) {
  return React.createElement(Svg, props, React.createElement('path', { d: 'm3.5 8.4 2.8 2.8 6.2-6.4' }))
}

export function CloseIcon(props) {
  return React.createElement(
    Svg,
    props,
    React.createElement('path', { d: 'm4 4 8 8' }),
    React.createElement('path', { d: 'm12 4-8 8' }),
  )
}

export function DotIcon({ size = 8, className }) {
  return React.createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 8 8', 'aria-hidden': 'true', focusable: 'false', className },
    React.createElement('circle', { cx: 4, cy: 4, r: 3.2, fill: 'currentColor' }),
  )
}
