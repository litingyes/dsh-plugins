/**
 * The panel's stylesheet, injected once as a `<style>` element owned by the
 * plugin's effect so unloading the plugin removes the rules with it.
 *
 * Every colour is a `--dsw-alias-*` theme token, so light and dark switch with
 * the rest of the application and a renamed token degrades the look instead of
 * breaking rendering. Sizes and spacing are plain pixels, copied from the
 * density the sidebar already uses.
 *
 * @module @litingyes/dsh-github/client/styles
 */

export const CSS = `
.dgh-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
  padding: 10px 10px 14px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.45;
}

.dgh-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dgh-repo {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.dgh-repo-mark {
  color: var(--dsw-alias-label-secondary);
  margin-top: 1px;
}

.dgh-repo-name {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.dgh-repo-description {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.dgh-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.dgh-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dgh-spacer { flex: 1 1 auto; }

.dgh-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dgh-icon-button:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dgh-icon-button:disabled { opacity: 0.45; cursor: default; }
.dgh-icon-button--danger:hover { color: var(--dsw-alias-state-error-primary); }
.dgh-icon-button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.dgh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.dgh-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.dgh-button:disabled { opacity: 0.45; cursor: default; }
.dgh-button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dgh-button--primary {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.dgh-button--ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.dgh-button--ghost:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dgh-button--danger {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
  background: transparent;
}

.dgh-segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2);
}
.dgh-segment {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.dgh-segment:hover { color: var(--dsw-alias-label-primary); }
.dgh-segment--active {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
}
.dgh-segment:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.dgh-segment-count {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}

.dgh-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
}
.dgh-badge--open { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.dgh-badge--closed { color: var(--dsw-alias-state-idle-primary); border-color: currentColor; }
.dgh-badge--merged { color: var(--dsw-alias-brand-primary); border-color: currentColor; }
.dgh-badge--warn { color: var(--dsw-alias-state-warn-primary); border-color: currentColor; }

.dgh-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 120px;
  padding: 0 6px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dgh-label-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }

.dgh-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  gap: 2px;
}

.dgh-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
}
.dgh-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dgh-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.dgh-row-icon { color: var(--dsw-alias-label-secondary); margin-top: 2px; }
.dgh-row-icon--open { color: var(--dsw-alias-state-success-primary); }
.dgh-row-icon--closed { color: var(--dsw-alias-state-idle-primary); }
.dgh-row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 auto; }
.dgh-row-title {
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dgh-row-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dgh-row-number { font-variant-numeric: tabular-nums; opacity: 0.8; }
.dgh-row-labels { display: flex; flex-wrap: wrap; gap: 4px; }
.dgh-mono { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 11px; }

.dgh-detail { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
.dgh-detail-head { display: flex; align-items: flex-start; gap: 8px; }
.dgh-detail-title { font-size: 14px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
.dgh-detail-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  padding: 8px 10px;
  max-height: 40vh;
  overflow-y: auto;
}
.dgh-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--dsw-alias-label-secondary);
}

.dgh-comment {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  padding: 8px 10px;
}
.dgh-comment-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dgh-comment-body { white-space: pre-wrap; overflow-wrap: anywhere; }

.dgh-textarea, .dgh-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12.5px;
  padding: 6px 8px;
  resize: vertical;
}
.dgh-textarea:focus-visible, .dgh-input:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dgh-input { height: 28px; resize: none; }

.dgh-form { display: flex; flex-direction: column; gap: 6px; }
.dgh-form-actions { display: flex; justify-content: flex-end; gap: 6px; }

.dgh-loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  padding: 10px 4px;
}
.dgh-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary);
  animation: dgh-spin 0.8s linear infinite;
}
@keyframes dgh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .dgh-spinner { animation-duration: 2s; }
}

.dgh-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  padding: 16px 8px;
  color: var(--dsw-alias-label-secondary);
}
.dgh-empty-title { margin: 0; font-size: 12.5px; }

.dgh-error {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 7px;
  padding: 10px;
}
.dgh-error-message { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12.5px; }
.dgh-error-hint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 11.5px; white-space: pre-wrap; }

.dgh-auth { display: flex; flex-direction: column; gap: 8px; }
.dgh-auth-title { margin: 0; font-size: 13px; font-weight: 600; }
.dgh-auth-body { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dgh-code {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 5px;
  padding: 3px 6px;
  user-select: all;
  overflow-wrap: anywhere;
}

.dgh-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.35);
}
.dgh-dialog {
  width: min(360px, calc(100vw - 32px));
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.28);
}
.dgh-dialog-head { display: flex; align-items: center; gap: 8px; }
.dgh-dialog-title { margin: 0; font-size: 14px; font-weight: 600; flex: 1 1 auto; }
.dgh-dialog-message { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.dgh-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

.dgh-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}
`
