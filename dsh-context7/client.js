/**
 * dsh-context7 browser half.
 *
 * Presentation only: registers a dedicated conversation row for the two
 * Context7 MCP tools, keyed by their wire names in `tool.call.toolview`. Tools,
 * arguments, and results are untouched; the row shows the Context7 mark, a
 * localized action title, the call summary, and an expandable request/result.
 *
 * The mark is the Context7 file-type icon from the MIT-licensed vscode-icons
 * project; see THIRD_PARTY_NOTICES.md in this package.
 */
window.__ModuleLoader__.load({
  id: '@litingyes/dsh-context7',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'context7';
    const TOOL_RESOLVE = 'mcp__context7__resolve-library-id';
    const TOOL_DOCS = 'mcp__context7__query-docs';

    const zh = {
      'row.title': 'Context7',
      'row.resolve': '解析库 ID',
      'row.docs': '查询文档',
      'row.preparing': '正在准备',
      'row.running': '正在调用 Context7',
      'row.failed': '调用失败',
      'row.stopped': '调用已中止',
      'row.request': '请求',
      'row.result': '文档',
      'row.inspect': '查看',
    };
    const en = {
      'row.title': 'Context7',
      'row.resolve': 'Resolve library',
      'row.docs': 'Query docs',
      'row.preparing': 'Preparing',
      'row.running': 'Calling Context7',
      'row.failed': 'Call failed',
      'row.stopped': 'Call stopped',
      'row.request': 'Request',
      'row.result': 'Documentation',
      'row.inspect': 'Inspect',
    };

    const CSS = `
.ctx7-card{display:flex;flex-direction:column}
.ctx7-row{display:flex;align-items:center;height:calc(24px + var(--dsh-content-font-delta,0px));min-width:0;color:var(--dsw-alias-label-tertiary);transition:color .1s;overflow:hidden;position:relative}
.ctx7-row:hover{color:var(--dsw-alias-label-secondary)}
.ctx7-row[data-expandable]{cursor:pointer}
.ctx7-leading{width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px));flex:none;display:inline-flex;align-items:center;justify-content:center;margin-right:6px;position:relative;color:inherit}
.ctx7-logo{width:14px;height:14px;display:block;border-radius:3px;transition:opacity .1s}
.ctx7-chevron{position:absolute;inset:0;margin:auto;width:14px;height:14px;opacity:0;transition:opacity .1s}
.ctx7-row[data-expandable]:hover .ctx7-logo{opacity:0}
.ctx7-row[data-expandable]:hover .ctx7-chevron{opacity:1}
.ctx7-row[data-open] .ctx7-logo{opacity:0}
.ctx7-row[data-open] .ctx7-chevron{opacity:1}
.ctx7-title{flex:none;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px))}
.ctx7-sep{flex:none;width:2px;height:2px;border-radius:1px;margin:0 8px;background:var(--dsw-alias-label-caption)}
.ctx7-summary{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px))}
.ctx7-summary[data-error]{color:var(--dsw-alias-state-error-primary)}
.ctx7-summary[data-stopped]{color:var(--dsw-alias-state-warn-label)}
.ctx7-status{clip:rect(0 0 0 0);position:absolute;width:1px;height:1px;overflow:hidden;white-space:nowrap}
.ctx7-body{display:flex;flex-direction:column;gap:6px;margin:2px 0 6px 4px}
.ctx7-section{display:flex;flex-direction:column;overflow:hidden;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-markdown-code-block)}
.ctx7-label{padding:6px 12px;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.ctx7-pre{margin:0;padding:10px 12px;max-height:240px;overflow:auto;display:block;font:var(--dsw-font-markdown-code-block-small);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.ctx7-pre[data-error]{color:var(--dsw-alias-state-error-primary)}
.ctx7-inspect{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;margin:2px 0 0 0;padding:2px 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:999px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;cursor:pointer;transition:opacity .1s}
.ctx7-inspect:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
`;

    const LOGO = h(
      'svg',
      { className: 'ctx7-logo', viewBox: '0 0 32 32', 'aria-hidden': true },
      h(
        'g',
        { fill: 'none', transform: 'translate(2 2)' },
        h('rect', { width: 28, height: 28, fill: '#059669', rx: 4 }),
        h('path', {
          fill: '#fff',
          d: 'M10.572 15.257c0 2.246-.91 4.12-2.394 5.848h3.454v1.674H6.335v-1.59c1.62-1.832 2.246-3.326 2.246-5.932zm6.856 0c0 2.246.91 4.12 2.394 5.848h-3.454v1.674h5.297v-1.59c-1.62-1.832-2.246-3.326-2.246-5.932zm-6.856-2.513c0-2.247-.91-4.122-2.394-5.849h3.454V5.221H6.335v1.59c1.62 1.832 2.246 3.326 2.246 5.933zm6.856 0c0-2.247.91-4.122 2.394-5.849h-3.454V5.221h5.297v1.59c-1.62 1.832-2.246 3.326-2.246 5.933z',
        }),
      ),
    );

    const CHEVRON = h(
      'svg',
      { className: 'ctx7-chevron', viewBox: '0 0 16 16', 'aria-hidden': true },
      h('path', {
        d: 'M4.5 6.25 8 9.75l3.5-3.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    );

    /** Parse a possibly-growing raw argument string without throwing. */
    function parseArgs(argsRaw) {
      try {
        const parsed = JSON.parse(argsRaw);
        return parsed !== null && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    /** Flatten the settled result under the generic tool-row text contract. */
    function resultText(block) {
      if (!('kind' in block)) return null;
      const parts = [];
      for (const item of block.content ?? []) {
        parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2));
      }
      if (parts.length === 0 && block.error !== undefined) {
        parts.push(`${block.error.name}: ${block.error.code}`);
      }
      return parts.join('\n') || null;
    }

    function firstLine(text) {
      const newline = text.indexOf('\n');
      return newline === -1 ? text : text.slice(0, newline);
    }

    function actionKey(toolName) {
      return toolName === TOOL_DOCS ? 'row.docs' : 'row.resolve';
    }

    /** The one argument the collapsed row names, mirroring the tool's own purpose. */
    function detailText(toolName, args) {
      const value = toolName === TOOL_DOCS ? args.libraryId : args.libraryName;
      return typeof value === 'string' && value !== '' ? firstLine(value) : '';
    }

    function stateOf(block) {
      if (!('kind' in block)) return 'running';
      if (block.error?.code === 'interrupted') return 'stopped';
      return block.isError ? 'error' : 'ok';
    }

    function statusText(state, t) {
      if (state === 'running') return t('row.running');
      if (state === 'error') return t('row.failed');
      if (state === 'stopped') return t('row.stopped');
      return '';
    }

    function prettyArgs(args, argsRaw) {
      return Object.keys(args).length === 0 ? argsRaw : JSON.stringify(args, null, 2);
    }

    /** One Context7 tool call: mark, action summary, and request/result disclosure. */
    function Context7Row(props) {
      const { phase, block, toolName } = props;
      const t = props.t;

      if (phase === 'preparing') {
        return h(
          'div',
          { className: 'ctx7-card', 'data-tool': toolName, 'data-state': 'preparing' },
          h(
            'div',
            { className: 'ctx7-row' },
            h('span', { className: 'ctx7-leading' }, LOGO),
            h('span', { className: 'ctx7-title' }, t('row.title')),
            h('span', { className: 'ctx7-sep', 'aria-hidden': true }),
            h('span', { className: 'ctx7-summary' }, t('row.preparing')),
          ),
        );
      }

      return h(SettledRow, { ...props, t });
    }

    function SettledRow({ block, toolName, inspect, t }) {
      const [expanded, setExpanded] = React.useState(false);
      const settled = 'kind' in block;
      const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? '';
      const args = parseArgs(argsRaw);
      const output = settled ? resultText(block) : null;
      const state = stateOf(block);
      const detail = detailText(toolName, args);
      const summary = detail === '' ? t(actionKey(toolName)) : `${t(actionKey(toolName))} · ${detail}`;
      const expandable = settled && (output !== null || argsRaw !== '');
      const open = expanded && expandable;
      const status = statusText(state, t);

      const toggle = () => {
        if (expandable) setExpanded((value) => !value);
      };
      const toggleFromKeyboard = (event) => {
        if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        toggle();
      };
      const disclosure =
        expandable === true
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': open,
              onClick: toggle,
              onKeyDown: toggleFromKeyboard,
            }
          : {};

      return h(
        'div',
        { className: 'ctx7-card', 'data-tool': toolName, 'data-state': state },
        h(
          'div',
          {
            className: 'ctx7-row',
            'data-expandable': expandable || undefined,
            'data-open': open || undefined,
            ...disclosure,
          },
          h('span', { className: 'ctx7-leading' }, LOGO, expandable === true ? CHEVRON : null),
          status !== '' ? h('span', { className: 'ctx7-status' }, status) : null,
          h('span', { className: 'ctx7-title' }, t('row.title')),
          h('span', { className: 'ctx7-sep', 'aria-hidden': true }),
          h(
            'span',
            {
              className: 'ctx7-summary',
              'data-error': state === 'error' || undefined,
              'data-stopped': state === 'stopped' || undefined,
            },
            summary,
          ),
        ),
        open
          ? h(
              'div',
              { className: 'ctx7-body' },
              h(
                'div',
                { className: 'ctx7-section' },
                h('div', { className: 'ctx7-label' }, t('row.request')),
                h(
                  'pre',
                  { className: 'ctx7-pre' },
                  prettyArgs(settled ? parseArgs(block.call?.argsRaw ?? '') : args, argsRaw),
                ),
              ),
              output !== null
                ? h(
                    'div',
                    { className: 'ctx7-section' },
                    h('div', { className: 'ctx7-label' }, t('row.result')),
                    h(
                      'pre',
                      {
                        className: 'ctx7-pre',
                        'data-error': state === 'error' || undefined,
                      },
                      output,
                    ),
                  )
                : null,
              typeof inspect === 'function'
                ? h(
                    'button',
                    { type: 'button', className: 'ctx7-inspect', onClick: inspect },
                    t('row.inspect'),
                  )
                : null,
            )
          : null,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context7-ui: dictionaries');
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {};
          const tag = document.createElement('style');
          tag.dataset.plugin = '@litingyes/dsh-context7';
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, 'context7-ui: styles');
        ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register({ name: 'tool.call.toolview', key: TOOL_RESOLVE, locale: NS }, Context7Row),
        );
        ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register({ name: 'tool.call.toolview', key: TOOL_DOCS, locale: NS }, Context7Row),
        );
      },
    };
  },
});
