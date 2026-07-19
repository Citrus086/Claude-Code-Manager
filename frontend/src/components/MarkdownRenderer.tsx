import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math-extended';
import type { Processor } from 'unified';
import 'katex/dist/katex.min.css';

export type MarkdownComponents = Components;

interface MarkdownRendererProps {
  children: string;
  className?: string;
  components?: Components;
}

interface MarkdownNode {
  type?: string;
  value?: string;
  data?: Record<string, unknown>;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
  children?: MarkdownNode[];
}

function inlineDisplayMathData(value: string): Record<string, unknown> {
  return {
    hName: 'code',
    hProperties: { className: ['language-math', 'math-display'] },
    hChildren: [{ type: 'text', value }],
  };
}

function isCurrencyPair(raw: string, following: string): boolean {
  if (!raw.startsWith('$') || raw.startsWith('$$') || !raw.endsWith('$')) return false;
  const body = raw.slice(1, -1);
  const firstAmount = body.match(/^\s*\d+(?:[.,]\d+)?/);
  if (!firstAmount) return false;
  const separator = body.slice(firstAmount[0].length);
  const looksLikePriceSeparator = /\s/.test(separator) || /^[-–—/]$/.test(separator);
  return looksLikePriceSeparator && /^\s*[+-]?\s*\d/.test(following);
}

/**
 * Let `\[...\]` use micromark's context-aware text tokenizer everywhere.
 * The extension's flow tokenizer treats same-line formula content as metadata,
 * which can swallow following paragraphs when the opener starts a line.
 */
function remarkMathWithoutSlashFlow(this: Processor) {
  remarkMath.call(this);
  const data = this.data() as {
    micromarkExtensions?: Array<{
      flow?: Record<number, unknown>;
    }>;
  };
  const mathExtension = data.micromarkExtensions?.at(-1);
  if (mathExtension?.flow) delete mathExtension.flow[92]; // ASCII backslash
}

/** Keep TeX's display semantics for `\[...\]` and same-line `$$...$$`. */
function remarkSlashDisplayMath() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value);

    const visit = (node: MarkdownNode) => {
      if (node.type === 'inlineMath') {
        const start = node.position?.start?.offset;
        const end = node.position?.end?.offset;
        const raw = start === undefined || end === undefined ? '' : source.slice(start, end);
        if (
          (raw.startsWith('\\[') && raw.endsWith('\\]'))
          || (raw.startsWith('$$') && raw.endsWith('$$'))
        ) {
          node.data = inlineDisplayMathData(node.value || '');
        } else if (isCurrencyPair(raw, end === undefined ? '' : source.slice(end))) {
          // `$5 or $10` is prose, not a formula spanning both currency signs.
          node.type = 'text';
          node.value = raw;
          delete node.data;
        }
      }

      node.children?.forEach(visit);
    };

    visit(tree);
  };
}

const remarkPlugins = [remarkGfm, remarkMathWithoutSlashFlow, remarkSlashDisplayMath];
const rehypePlugins = [rehypeKatex];

export function MarkdownRenderer({ children, className, components }: MarkdownRendererProps) {
  return (
    <div className={['markdown-body', className].filter(Boolean).join(' ')}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
