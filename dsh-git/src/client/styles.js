/**
 * Panel stylesheet, kept as a string so the browser build stays one file.
 *
 * Every surface colour, border, and text colour comes from the host theme
 * tokens the inspector lists, so light/dark switching and future token renames
 * degrade rather than break. Spacing, radii, and type sizes are plain values
 * matched against the host's own management pages.
 *
 * The one deliberate exception is {@link LANE_PALETTE}: commit-graph lanes are
 * data encoding, not chrome, and need eight hues that stay legible on both
 * themes. Those eight are the only fixed colours in the plugin.
 *
 * @module @litingyes/dsh-git/client/styles
 */

/** Eight mid-tone hues that read on both light and dark backgrounds. */
export const LANE_PALETTE = [
  '#4e79a7',
  '#f28e2b',
  '#59a14f',
  '#e15759',
  '#af7aa1',
  '#b5a11a',
  '#2f8f8a',
  '#c2717c',
]

export const CSS = `
/* The panel is a right-Sidebar tab, so its own width — not the viewport — decides
   the layout. container-type makes the rules below follow the tab. */
.dgit-panel{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;container-type:inline-size;container-name:dgit}
.dgit-header{display:flex;align-items:center;gap:10px;padding:14px 20px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;min-width:0}
.dgit-brand{width:26px;height:26px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-brand-primary)}
.dgit-heading{display:flex;flex-direction:column;gap:2px;min-width:0}
.dgit-heading-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dgit-heading-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dgit-spacer{flex:1 1 auto;min-width:8px}
.dgit-pill{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;height:20px;padding:0 8px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden}
.dgit-pill-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.dgit-pill[data-tone=brand]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent)}
.dgit-pill[data-tone=ok]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent)}
.dgit-pill[data-tone=warn]{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent)}
.dgit-pill[data-tone=error]{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent)}
.dgit-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}

.dgit-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dgit-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dgit-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dgit-btn:disabled{opacity:.45;cursor:default}
/* brand-primary is a *surface* token: it is near-white in the dark theme and
   near-black in the light one. Its label is therefore whatever the host paints on
   a primary fill — a hard-coded white disappears on the light fill, which is
   exactly how the create button lost its text. */
.dgit-btn[data-variant=primary]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff)}
.dgit-btn[data-variant=primary]:hover:not(:disabled){background:var(--dsw-alias-brand-primary);opacity:.9}
/* A disabled primary drops the brand fill entirely: dimming an inverted fill to
   the generic 45% leaves grey text on a grey block. A neutral surface with the
   secondary label is both readable and unmistakably not pressable. */
.dgit-btn[data-variant=primary]:disabled{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);opacity:1}
.dgit-btn[data-variant=ghost]{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);padding:0 6px}
.dgit-btn[data-variant=ghost]:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dgit-btn[data-variant=danger]{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent)}

.dgit-input{height:26px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;min-width:0}
.dgit-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}
.dgit-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dgit-textarea{width:100%;box-sizing:border-box;min-height:62px;max-height:160px;resize:vertical;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.5}
.dgit-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}

.dgit-tabs{display:flex;align-items:center;gap:2px;padding:0 14px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none}
.dgit-tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;padding:9px 10px;margin-bottom:-.5px;font:inherit;font-size:13px;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.dgit-tab:hover{color:var(--dsw-alias-label-primary)}
.dgit-tab[data-active]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:500}
.dgit-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:6px}
.dgit-tab-count{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dgit-tabpanel{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.dgit-tabpanel[data-hidden]{display:none}

.dgit-toolbar{display:flex;align-items:center;gap:10px;padding:8px 20px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;flex-wrap:wrap}
.dgit-scroll{overflow-y:auto;overflow-x:hidden;flex:1 1 auto;min-height:0}
.dgit-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 24px;color:var(--dsw-alias-label-secondary);text-align:center;flex:1 1 auto;min-width:0;white-space:pre-line;overflow-wrap:anywhere}
.dgit-banner{display:flex;align-items:flex-start;gap:8px;margin:8px 16px 0;padding:8px 12px;border-radius:8px;border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-label-primary);font-size:12px}
.dgit-banner-text{flex:1 1 auto;min-width:0;word-break:break-word}

/* ---- commit graph ---- */
.dgit-graph{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:6px 0 28px}
.dgit-node{position:relative;padding-left:var(--dgit-gutter,44px)}
/* The svg fills the node so an expanding row is drawn at full height in the very
   frame it grows, before the measured height arrives. It turns off aspect
   correction (see graph-view.jsx), so filling the box never re-centres the lane
   drawing and no seam appears while the two heights differ. */
.dgit-lanes{position:absolute;left:0;top:0;bottom:0;pointer-events:none}
/* A row grows instead of clipping: the lane svg measures its element, so a
   wrapped subject or meta line keeps the through-lines continuous. */
.dgit-node-head{display:flex;align-items:center;gap:10px;width:100%;min-width:0;min-height:56px;box-sizing:border-box;text-align:left;background:none;border:0;padding:6px 20px 6px 4px;cursor:pointer;font:inherit;color:inherit;border-radius:0}
.dgit-node-head:hover{background:var(--dsw-alias-bg-layer-1)}
.dgit-node-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dgit-node-body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}
.dgit-node-subject{display:flex;align-items:center;gap:6px;row-gap:3px;flex-wrap:wrap;min-width:0;font-size:13px;color:var(--dsw-alias-label-primary)}
.dgit-node-subject-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.dgit-node-meta{display:flex;align-items:center;gap:8px;row-gap:2px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary);min-width:0}
.dgit-node-meta-author{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(180px,100%)}
.dgit-chevron{flex:none;width:14px;height:14px;color:var(--dsw-alias-label-secondary);transition:transform .12s ease;margin-top:2px}
.dgit-node[data-open] .dgit-chevron{transform:rotate(90deg)}
.dgit-badge{display:inline-flex;align-items:center;height:17px;max-width:180px;min-width:0;overflow:hidden;padding:0 6px;border-radius:4px;font-size:10.5px;line-height:1;white-space:nowrap;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dgit-badge-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dgit-badge[data-tone=head]{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent);color:var(--dsw-alias-brand-primary)}
.dgit-badge[data-tone=tag]{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent);color:var(--dsw-alias-state-warn-primary)}

.dgit-detail{padding:2px 20px 16px 4px;display:flex;flex-direction:column;gap:14px}
.dgit-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px 20px}
.dgit-field{display:flex;flex-direction:column;gap:2px;min-width:0}
.dgit-field-label{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dgit-field-value{font-size:12.5px;color:var(--dsw-alias-label-primary);word-break:break-word;overflow-wrap:anywhere;min-width:0}
.dgit-inline{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;max-width:100%}
.dgit-message{margin:0;padding:10px 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-family:inherit;font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);max-height:220px;overflow:auto}
.dgit-detail-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.03em}
.dgit-filelist{display:flex;flex-direction:column;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}
/* No fixed width: the row is a block-level flex box, so it already fills the
   list. Fixing it to 100% without border-box made the padding push the row's
   right edge past the scroll container, which clips (overflow-x:hidden) the
   action button at the end of every row. */
.dgit-filerow{display:flex;align-items:center;gap:8px;box-sizing:border-box;min-width:0;padding:5px 10px;background:none;border:0;border-bottom:.5px solid var(--dsw-alias-border-l1);font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left}
.dgit-filerow:last-child{border-bottom:0}
.dgit-filerow:hover{background:var(--dsw-alias-bg-layer-1)}
.dgit-filerow[data-selected]{background:var(--dsw-alias-bg-layer-2)}
.dgit-status{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;font-size:10.5px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.dgit-status[data-code=M]{color:var(--dsw-alias-state-warn-primary)}
.dgit-status[data-code=A]{color:var(--dsw-alias-state-success-primary)}
.dgit-status[data-code=D]{color:var(--dsw-alias-state-error-primary)}
.dgit-status[data-code=R]{color:var(--dsw-alias-brand-primary)}
.dgit-status[data-code=U]{color:var(--dsw-alias-state-error-primary)}
.dgit-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.dgit-path-dir{color:var(--dsw-alias-label-secondary)}
.dgit-stat{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);display:inline-flex;gap:6px}
.dgit-stat-add{color:var(--dsw-alias-state-success-primary)}
.dgit-stat-del{color:var(--dsw-alias-state-error-primary)}

/* ---- split panes ---- */
.dgit-split{display:flex;flex:1 1 auto;min-height:0;min-width:0}
.dgit-split-list{width:360px;flex:none;display:flex;flex-direction:column;min-height:0;border-right:.5px solid var(--dsw-alias-border-l1)}
.dgit-split-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;min-height:0}
.dgit-group{border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dgit-group-head{display:flex;align-items:center;gap:8px;row-gap:4px;flex-wrap:wrap;min-width:0;padding:7px 12px;font-size:11.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);position:sticky;top:0;z-index:1}
.dgit-group-name{font-weight:600;letter-spacing:.02em;min-width:0}
/* The header is a button so a whole section folds with one click; the section's
   own actions stay siblings, because a button inside a button is not a control. */
.dgit-group-toggle{flex:1 1 auto;display:flex;align-items:center;gap:8px;min-width:0;padding:0;margin:0;background:none;border:0;font:inherit;font-size:11.5px;color:inherit;cursor:pointer;text-align:left}
.dgit-group-toggle:hover{color:var(--dsw-alias-label-primary)}
.dgit-group-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.dgit-group-chevron{flex:none;width:12px;height:12px;color:var(--dsw-alias-label-secondary);transition:transform .12s ease}
.dgit-group-toggle[data-open] .dgit-group-chevron{transform:rotate(90deg)}
.dgit-group-icon{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}
.dgit-count{color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dgit-branch-time{flex:0 0 auto}

/* ---- branch and worktree rows ---- */
/* A branch row is two lines on purpose. In a right-Sidebar column a single-line
   row cannot hold the name, its upstream, the worktree that checked it out, and
   the age at once: whichever part is last loses to the pane's clipping edge.
   The name keeps its own line, the slower facts share a meta line that
   ellipsizes as a whole, and the controls live in a non-shrinking third column
   so a switch button or state pill is never squeezed out. */
.dgit-branchrow{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 10px}
.dgit-branchrow-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.dgit-branchrow-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.dgit-branchrow-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dgit-branchrow-actions{flex:none;display:flex;align-items:center;gap:4px;min-width:0}

/* ---- diff ---- */
.dgit-diff{flex:1 1 auto;min-height:0;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;background:var(--dsw-alias-bg-base)}
.dgit-diff-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-family:inherit;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dgit-dl{display:block;padding:0 12px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}
.dgit-dl[data-t=add]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 15%, transparent)}
.dgit-dl[data-t=del]{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 15%, transparent)}
.dgit-dl[data-t=hunk]{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
.dgit-dl[data-t=meta]{color:var(--dsw-alias-label-secondary)}

/* ---- commit box ---- */
.dgit-commitbox{flex:none;display:flex;flex-direction:column;gap:8px;padding:10px 16px 14px;border-top:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.dgit-commitbox-row{display:flex;align-items:center;gap:8px;row-gap:6px;flex-wrap:wrap;justify-content:flex-end}
.dgit-commitbox-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-right:auto;min-width:0;overflow-wrap:anywhere}

/* ---- dialog ---- */
.dgit-backdrop{position:fixed;inset:0;z-index:60;background:color-mix(in srgb, #000 38%, transparent)}
.dgit-dialog{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:61;width:min(440px,92vw);box-sizing:border-box;padding:18px 20px 16px;border-radius:12px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 48px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary)}
.dgit-dialog-title{font-size:14px;font-weight:600;margin:0 0 8px}
.dgit-dialog-body{font-size:12.5px;color:var(--dsw-alias-label-secondary);line-height:1.6;margin:0 0 16px;word-break:break-word}
.dgit-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
/* Dialogs stay inside the viewport: a long worktree path can push the form past
   the screen on a short window, and a cut-off confirm button is a dead end. */
.dgit-dialog{max-height:calc(100vh - 48px);overflow-y:auto}
.dgit-dialog-form{display:flex;flex-direction:column;gap:10px;margin:0 0 16px;min-width:0}
.dgit-dialog-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.dgit-dialog-label{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dgit-dialog-hint{min-width:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dgit-dialog .dgit-input{width:100%;box-sizing:border-box}
.dgit-dialog-modes{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.dgit-dialog-modes .dgit-btn{flex:1 1 auto;min-width:0}
.dgit-dialog-check{display:flex;align-items:flex-start;gap:8px;min-width:0;margin:0 0 16px}
.dgit-dialog-check .dgit-check{margin-top:2px}
.dgit-dialog-check-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.dgit-dialog-check-label{font-size:12.5px;color:var(--dsw-alias-label-primary)}

/* ---- controls owned by this plugin ---- */
.dgit-icon{display:block;width:14px;height:14px;flex:none}
.dgit-check{width:14px;height:14px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:4px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:transparent;cursor:pointer}
.dgit-check:hover{border-color:var(--dsw-alias-label-secondary)}
.dgit-check[data-checked],.dgit-check[data-indeterminate]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff)}
.dgit-check:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dgit-check-ind{display:inline-flex;align-items:center;justify-content:center;line-height:0}
.dgit-check-ind .dgit-icon{width:11px;height:11px}
.dgit-check-dash{width:7px;height:1.5px;border-radius:1px;background:currentColor;display:block}
.dgit-path-btn{flex:1 1 auto;min-width:0;display:flex;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer;overflow:hidden}
.dgit-path-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.dgit-row-actions{flex:none;display:none;align-items:center;gap:2px}
.dgit-filerow:hover .dgit-row-actions,.dgit-filerow:focus-within .dgit-row-actions{display:inline-flex}
/* The tail of a row never shrinks: the name/meta column absorbs every pixel of
   pressure, so a state pill or a switch button is always fully drawn. */
.dgit-filerow .dgit-btn,.dgit-filerow .dgit-pill{flex:0 0 auto}
.dgit-filerow .dgit-btn{height:20px;font-size:11px;padding:0 6px}

/* ---- marks ---- */
/* No forced box: the caller's size decides, so the guide card's 22-26px glyph
   and the 14px chip glyph are both drawn at the size they ask for. */
.dgit-mark{display:block;flex:none}
.dgit-title-icon{display:block;flex:none;color:var(--dsw-alias-label-secondary)}

/* ---- narrow right-Sidebar tab ---- */
/* ---- composer branch status pill ---- */
/* The chip is one entry of the composer's status dock, next to the token
   statistics. It therefore borrows the dock pill's metrics (transparent,
   label-tertiary, 12px, 14px glyph) instead of looking like a toolbar button;
   the only additions are the branch glyph and the uncommitted-changes dot. */
.dgit-branchchip{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:min(200px,42vw);padding:1px 8px;border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;cursor:pointer}
.dgit-branchchip:hover,.dgit-branchchip[aria-expanded=true],.dgit-branchchip[data-open]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dgit-branchchip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dgit-branchchip[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}
.dgit-branchchip-icon{width:14px;height:14px;flex:none;color:currentColor}
.dgit-branchchip-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr}
.dgit-branchchip-dot{width:6px;height:6px;flex:none;border-radius:999px;background:var(--dsw-alias-state-warn-primary)}

/* The picker is portaled to the document body and opens upward from the dock.
   Its surface is the host's menu material, so text, border, and elevation match
   the model-selector menu instead of a translucent gray panel. */
.dgit-branchpop-positioner{z-index:1100}
.dgit-branchpop{box-sizing:border-box;display:flex;flex-direction:column;width:min(320px,calc(100vw - 24px));max-height:min(420px,calc(100vh - 96px));padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.5;overflow:hidden}
.dgit-branchpop-head{display:flex;flex:none;align-items:center;gap:8px;min-width:0;padding:6px 6px 2px 8px}
.dgit-branchpop-title{margin:0;flex:1 1 auto;min-width:0;font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
.dgit-branchpop-head .dgit-btn{flex:none;width:24px;height:24px;padding:0;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary)}
.dgit-branchpop-head .dgit-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dgit-branchpop-note{flex:none;margin:4px 8px 0;font-size:11.5px;color:var(--dsw-alias-state-warn-primary)}
.dgit-branchpop .dgit-branchpop-search,.dgit-branchpop .dgit-branchpop-create{box-sizing:border-box;width:100%;height:28px;border:0;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;padding:0 9px}
.dgit-branchpop .dgit-branchpop-search{margin:6px 4px 4px}
.dgit-branchpop .dgit-branchpop-search::placeholder,.dgit-branchpop .dgit-branchpop-create::placeholder{color:var(--dsw-alias-label-caption);opacity:1}
.dgit-branchpop .dgit-branchpop-search:focus-visible,.dgit-branchpop .dgit-branchpop-create:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dgit-branchpop-list{display:flex;flex:1 1 auto;flex-direction:column;gap:1px;min-height:0;padding:2px 0;overflow-y:auto;overscroll-behavior:contain;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dgit-branchpop-row{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;min-height:34px;padding:5px 7px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
button.dgit-branchpop-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dgit-branchpop-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dgit-branchpop-row:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dgit-branchpop-row[data-current]{background:var(--dsw-alias-interactive-bg-hover)}
.dgit-branchpop-row[data-pending]{color:var(--dsw-alias-label-secondary)}
.dgit-branchpop-mark{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex:none;color:var(--dsw-alias-brand-primary)}
.dgit-branchpop-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr}
.dgit-branchpop-state{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.dgit-branchpop-badge{flex:none;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 5px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:16px}
.dgit-branchpop-empty{padding:12px 8px;color:var(--dsw-alias-label-tertiary);text-align:center;font-size:12px}
.dgit-branchpop-error{display:flex;flex:none;flex-direction:column;gap:2px;margin:6px 4px 2px;padding:6px 8px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);font-size:11.5px;color:var(--dsw-alias-label-primary)}
.dgit-branchpop-error-label{font-weight:600;color:var(--dsw-alias-state-error-primary)}
.dgit-branchpop-error-text{word-break:break-word}
.dgit-branchpop-new{display:flex;flex:none;align-items:center;gap:6px;margin-top:4px;padding:8px 4px 4px;border-top:.5px solid var(--dsw-alias-border-l1)}
.dgit-branchpop-new .dgit-branchpop-create{flex:1 1 auto;min-width:0}
.dgit-branchpop-new .dgit-btn{flex:none;height:28px;font-size:12px}
.dgit-branchpop-spin{width:12px;height:12px;border-radius:999px;border:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);border-top-color:var(--dsw-alias-brand-primary);animation:dgit-spin .7s linear infinite}
@keyframes dgit-spin{to{transform:rotate(360deg)}}

/* The right Sidebar is a column of the page, not a full-width panel: at these
   widths the two-pane layouts stack, chrome tightens, and anything that cannot
   fit is dropped rather than scrolled sideways. */
@container dgit (max-width:760px){
  .dgit-header{gap:8px;padding:10px 12px 9px}
  .dgit-brand{display:none}
  .dgit-heading-name{font-size:13.5px}
  .dgit-toolbar{gap:6px;padding:6px 12px}
  .dgit-tabs{padding:0 8px}
  .dgit-tab{padding:8px 8px}
  .dgit-empty{padding:32px 16px}
  .dgit-banner{margin:8px 12px 0}
  .dgit-node-head{padding:6px 12px 6px 2px}
  .dgit-detail{padding:2px 12px 14px 2px}
  .dgit-detail-grid{grid-template-columns:minmax(0,1fr);gap:8px 12px}
  .dgit-commitbox{padding:8px 12px 12px}
  .dgit-split{flex-direction:column}
  .dgit-split-list{width:auto;max-height:45%;border-right:0;border-bottom:.5px solid var(--dsw-alias-border-l1)}
  .dgit-node-meta-author{max-width:100%}
}

@container dgit (max-width:520px){
  /* A phone-width Sidebar: padding yields first, so the last control in a row
     still lands inside the pane instead of under the clipping edge. */
  .dgit-header{padding:9px 10px 8px}
  .dgit-toolbar{padding:6px 10px}
  .dgit-tabs{padding:0 6px}
  .dgit-tab{padding:8px 6px}
  .dgit-banner{margin:8px 10px 0}
  .dgit-empty{padding:28px 12px}
  .dgit-filerow{padding:5px 8px}
  .dgit-branchrow{padding:6px 8px}
  .dgit-group-head{padding:6px 8px;column-gap:6px}
  .dgit-node-head{padding:6px 8px 6px 2px}
  .dgit-detail{padding:2px 8px 12px 2px}
  .dgit-commitbox{padding:8px 10px 10px}
}

@media (prefers-reduced-motion:reduce){.dgit-chevron,.dgit-group-chevron{transition:none}.dgit-branchpop-spin{animation:none}}
`
