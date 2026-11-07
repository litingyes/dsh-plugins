/**
 * Panel stylesheet, kept as a string so the browser build stays one file.
 *
 * Every surface colour, border, and text colour comes from the host theme
 * tokens, so light/dark switching and future token renames degrade rather than
 * break. The one fixed palette is the status colour mapping, which is data
 * encoding: planned/secondary, prompt_ready/brand, generating/warn,
 * generated/selected/success, dropped/secondary.
 *
 * The right Sidebar can be narrow, so the layout is driven by the panel's own
 * inline size (`container-type`), not the viewport.
 *
 * @module @litingyes/dsh-director/client/styles
 */

export const CSS = `
.ddr-panel{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;container-type:inline-size;container-name:ddr}

.ddr-header{display:flex;flex-direction:column;gap:7px;padding:13px 18px 11px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;min-width:0}
.ddr-header-top{display:flex;align-items:flex-start;gap:9px;min-width:0}
.ddr-brand{width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}
.ddr-heading{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.ddr-title{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ddr-logline{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ddr-path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.ddr-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.ddr-meta-item{display:inline-flex;align-items:baseline;gap:3px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.ddr-meta-item b{font-weight:600;color:var(--dsw-alias-label-primary)}

.ddr-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:24px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;line-height:1;cursor:pointer;white-space:nowrap}
.ddr-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.ddr-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ddr-btn:disabled{opacity:.45;cursor:default}
.ddr-btn[data-variant=ghost]{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.ddr-btn[data-variant=ghost]:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.ddr-icon-btn{width:26px;height:26px;padding:0;justify-content:center;flex:none}

.ddr-tabs{display:flex;align-items:center;gap:2px;padding:0 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;overflow-x:auto;scrollbar-width:none}
.ddr-tabs::-webkit-scrollbar{display:none}
.ddr-tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;padding:8px 9px;margin-bottom:-.5px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.ddr-tab:hover{color:var(--dsw-alias-label-primary)}
.ddr-tab[data-active]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:500}
.ddr-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:6px}
.ddr-tab-count{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10px;color:var(--dsw-alias-label-secondary)}
.ddr-tab-count[data-tone=error]{color:var(--dsw-alias-state-error-primary)}

.ddr-body{flex:1 1 auto;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;padding:11px 13px 26px;display:flex;flex-direction:column;gap:9px}

.ddr-banner{display:flex;gap:7px;align-items:flex-start;padding:8px 10px;border-radius:8px;border:.5px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 9%, transparent);font-size:11.5px;color:var(--dsw-alias-label-secondary)}

.ddr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:44px 22px;text-align:center;color:var(--dsw-alias-label-secondary);flex:1}
.ddr-empty-icon{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}
.ddr-empty-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.ddr-empty-body{font-size:12px;max-width:34ch}
.ddr-empty-hint{font-size:11.5px;opacity:.85;max-width:38ch}
.ddr-error-box{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;border-radius:9px;border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);font-size:12px}

.ddr-scene{border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;flex:none}
.ddr-scene-head{display:flex;align-items:center;gap:7px;width:100%;padding:8px 10px;background:none;border:0;font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0}
.ddr-scene-head:hover{background:var(--dsw-alias-bg-layer-2)}
.ddr-scene-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ddr-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary);transition:transform .12s ease}
.ddr-chevron[data-open]{transform:rotate(90deg)}
.ddr-scene-title{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ddr-scene-sub{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;margin-left:auto;flex:none}
.ddr-title-icon{flex:none}
.ddr-scene-body{display:flex;flex-direction:column;gap:7px;padding:0 8px 8px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:8px}

.ddr-shot{border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);padding:8px 9px;display:flex;flex-direction:column;gap:5px;min-width:0}
.ddr-shot-top{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}
.ddr-shot-id{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;font-weight:600}
.ddr-shot-duration{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.ddr-shot-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:1px}
.ddr-shot-line{font-size:12px;overflow-wrap:anywhere}
.ddr-shot-line[data-muted]{color:var(--dsw-alias-label-secondary);font-size:11.5px}
.ddr-shot-label{color:var(--dsw-alias-label-secondary)}
.ddr-shot-prompt{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}

.ddr-chip{display:inline-flex;align-items:center;gap:3px;height:18px;padding:0 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.ddr-chip[data-tone=brand]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, transparent)}
.ddr-chip[data-tone=success]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 38%, transparent)}
.ddr-chip[data-tone=warn]{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 38%, transparent)}
.ddr-chip[data-tone=error]{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 38%, transparent)}
.ddr-chip[data-tone=muted]{opacity:.8}
.ddr-status[data-status=prompt_ready]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, transparent)}
.ddr-status[data-status=generating]{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 38%, transparent)}
.ddr-status[data-status=generated]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 38%, transparent)}
.ddr-status[data-status=selected]{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-state-success-primary);border-color:transparent;font-weight:600}
.ddr-status[data-status=dropped]{text-decoration:line-through}

.ddr-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:none}
.ddr-toolbar-spacer{flex:1 1 auto}
.ddr-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:1 1 100%}

.ddr-prompt{border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);padding:7px 8px;display:flex;flex-direction:column;gap:4px;min-width:0}
.ddr-prompt-head{display:flex;align-items:center;justify-content:space-between;gap:6px}
.ddr-label{font-size:10.5px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.ddr-prompt-text{font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.ddr-prompt-text[data-empty]{color:var(--dsw-alias-label-secondary);font-style:italic;font-size:11.5px}
.ddr-params{display:flex;flex-wrap:wrap;gap:4px}
.ddr-param{display:inline-flex;align-items:center;gap:3px;max-width:100%;padding:1px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ddr-param b{font-weight:500;color:var(--dsw-alias-label-primary)}

.ddr-audio-group{display:flex;flex-direction:column;gap:6px;flex:none}
.ddr-audio-head{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:5px}
.ddr-audio-row{border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:7px 8px;display:flex;flex-direction:column;gap:3px;min-width:0}
.ddr-audio-top{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.ddr-audio-id{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:600}
.ddr-audio-text{font-size:12px;overflow-wrap:anywhere}
.ddr-audio-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}

.ddr-review-group{display:flex;flex-direction:column;gap:6px;flex:none}
.ddr-review-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.ddr-review-head[data-severity=error]{color:var(--dsw-alias-state-error-primary)}
.ddr-review-head[data-severity=warning]{color:var(--dsw-alias-state-warn-primary)}
.ddr-finding{border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.ddr-finding[data-severity=error]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 32%, transparent)}
.ddr-finding summary{display:flex;align-items:flex-start;gap:6px;padding:7px 9px;cursor:pointer;font-size:12px;list-style:none;min-width:0}
.ddr-finding summary::-webkit-details-marker{display:none}
.ddr-finding summary:hover{background:var(--dsw-alias-bg-layer-2)}
.ddr-finding summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ddr-finding-name{font-weight:500;min-width:0}
.ddr-finding-path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ddr-finding-body{padding:0 9px 8px;display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.ddr-finding-fix{font-size:11.5px;color:var(--dsw-alias-label-primary)}
.ddr-next{display:flex;flex-direction:column;gap:3px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);font-size:11.5px}
.ddr-next-title{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.ddr-next-item{overflow-wrap:anywhere}

@container ddr (max-width: 340px){
  .ddr-header{padding:11px 12px 9px}
  .ddr-body{padding:9px 9px 22px}
  .ddr-tab{padding:7px 7px}
  .ddr-shot{padding:7px 7px}
  .ddr-logline{-webkit-line-clamp:1}
}
`
