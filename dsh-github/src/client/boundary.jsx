/**
 * The tab body's last-resort error boundary.
 *
 * A component that throws while rendering does not lose only its own panel:
 * React unmounts the subtree, and in the right Sidebar that reads as a blank
 * pane with no clue. Catching it here keeps the failure inside the tab, names
 * the error, and offers a retry that re-renders from a clean state.
 *
 * @module @litingyes/dsh-github/client/boundary
 */

import * as React from 'react'
import { Button } from './controls.jsx'

/** The caught error's message, or its string form when it has none. */
function errorMessage(error) {
  return typeof error?.message === 'string' && error.message !== '' ? error.message : String(error)
}

/**
 * Render `children`, or a readable card when one of them throws.
 *
 * @param {{t: Function, children?: React.ReactNode}} props boundary props.
 */
export class PanelBoundary extends React.Component {
  /**
   * @param {object} props boundary props.
   */
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  /**
   * @param {unknown} error the thrown value.
   * @returns {{error: unknown}} the next state.
   */
  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    const { t } = this.props
    return React.createElement(
      'div',
      { className: 'dgh-panel' },
      React.createElement(
        'div',
        { className: 'dgh-auth' },
        React.createElement('h2', { className: 'dgh-auth-title' }, t('panel.crashedTitle')),
        React.createElement('p', { className: 'dgh-auth-body' }, t('panel.crashed', { message: errorMessage(error) })),
        React.createElement('p', { className: 'dgh-error-hint' }, t('panel.crashedHint')),
        React.createElement(
          'div',
          { className: 'dgh-meta-row' },
          React.createElement(
            Button,
            { variant: 'secondary', onClick: () => this.setState({ error: null }) },
            t('panel.crashedRetry'),
          ),
        ),
      ),
    )
  }
}
