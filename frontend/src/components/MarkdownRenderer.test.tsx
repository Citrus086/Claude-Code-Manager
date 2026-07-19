import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';

function texAnnotations(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll('annotation[encoding="application/x-tex"]'),
    (node) => node.textContent || '',
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('MarkdownRenderer', () => {
  it('renders dollar-delimited inline and display math with KaTeX', () => {
    const source = String.raw`Inline $E=mc^2$.

$$
\frac{1}{2}
$$

Same-line display: $$a+b$$.`;
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(container.querySelectorAll('.katex')).toHaveLength(3);
    expect(container.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(texAnnotations(container)).toEqual(['E=mc^2', String.raw`\frac{1}{2}`, 'a+b']);
  });

  it('renders model-style slash delimiters without losing TeX backslashes', () => {
    const source = String.raw`Inline \(x^2 + \sqrt{x}\).

\[
\sum_i x_i
\]

Same-line display: \[a^2 + b^2 = c^2\].`;
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(container.querySelectorAll('.katex')).toHaveLength(3);
    expect(container.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(texAnnotations(container)).toEqual([
      String.raw`x^2 + \sqrt{x}`,
      String.raw`\sum_i x_i`,
      'a^2 + b^2 = c^2',
    ]);
  });

  it('does not convert math delimiters inside inline or fenced code', () => {
    const source = [
      `Code: \`${String.raw`$x$ and \(y\)`}\``,
      '',
      '~~~tex',
      '$$z$$',
      String.raw`\[w\]`,
      '~~~',
      '',
      'Math: $q$',
    ].join('\n');
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(container.querySelectorAll('.katex')).toHaveLength(1);
    expect(texAnnotations(container)).toEqual(['q']);
    expect(screen.getByText(String.raw`$x$ and \(y\)`)).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes(String.raw`\[w\]`))).toBeInTheDocument();
  });

  it('leaves escaped currency, unmatched delimiters, and literal double slashes alone', () => {
    const source = String.raw`Price: \$5. Math: $x$.

Unclosed \(broken.

Literal \\(not math\\).`;
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(container.querySelectorAll('.katex')).toHaveLength(1);
    expect(texAnnotations(container)).toEqual(['x']);
    expect(container.textContent).toContain('Price: $5.');
    expect(container.textContent).toContain('Unclosed (broken.');
    expect(container.textContent).toContain(String.raw`\(not math\)`);
  });

  it('parses slash display math in list and paragraph continuation contexts', () => {
    const source = [
      '- Formula:',
      String.raw`    \[x^2\]`,
      '',
      'Paragraph continuation',
      String.raw`    \[y^2\]`,
    ].join('\n');
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(container.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(texAnnotations(container)).toEqual(['x^2', 'y^2']);
  });

  it('preserves formula and trailing prose after a line-leading slash display', () => {
    const source = String.raw`\[x^2\].

\[y^2\] trailing text`;
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);
    const paragraphs = Array.from(container.querySelectorAll('p'));

    expect(container.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(texAnnotations(container)).toEqual(['x^2', 'y^2']);
    expect(paragraphs[0]).toHaveTextContent(/\.$/);
    expect(paragraphs[1]).toHaveTextContent(/trailing text$/);
  });

  it('does not parse ordinary unescaped currency pairs as math', () => {
    const source = 'Cost $5 or $10, range $ 5 to $ 10, debt $5 or $-10; formulas $2x$3 and $x+1$.';
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(texAnnotations(container)).toEqual(['2x', 'x+1']);
    expect(container).toHaveTextContent('Cost $5 or $10, range $ 5 to $ 10, debt $5 or $-10');
  });

  it('does not interpret delimiters inside a fenced block nested in a quote', () => {
    const source = [
      '> ```tex',
      String.raw`> \[not math\]`,
      '> $also_not_math$',
      '> ```',
      '',
      String.raw`\[real_math\]`,
    ].join('\n');
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(container.querySelectorAll('.katex')).toHaveLength(1);
    expect(texAnnotations(container)).toEqual(['real_math']);
    expect(screen.getByText((text) => text.includes(String.raw`\[not math\]`))).toBeInTheDocument();
  });

  it('leaves slash delimiters in link destinations and autolinks to Markdown', () => {
    const source = String.raw`[link](https://example.test/a\(b\)) <https://example.test/c\(d\)>`;
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);
    const links = Array.from(container.querySelectorAll('a'));

    expect(container.querySelector('.katex')).not.toBeInTheDocument();
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.test/a(b)',
      'https://example.test/c%5C(d%5C)',
    ]);
    expect(links[1]).toHaveTextContent(String.raw`https://example.test/c\(d\)`);
  });

  it('keeps GFM features alongside math', () => {
    const source = `| Formula | Value |\n| --- | --- |\n| $x^2$ | ~~old~~ |`;
    const { container } = render(<MarkdownRenderer>{source}</MarkdownRenderer>);

    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelector('del')).toHaveTextContent('old');
    expect(container.querySelector('.katex')).toBeInTheDocument();
  });

  it('does not route display math through a custom code-block renderer', () => {
    const { queryByTestId } = render(
      <MarkdownRenderer components={{ pre: ({ children }) => <pre data-testid="code-pre">{children}</pre> }}>
        {'$$\nx^2\n$$\n\n\\[\ny^2\n\\]'}
      </MarkdownRenderer>,
    );

    expect(queryByTestId('code-pre')).not.toBeInTheDocument();
  });

  it('is the only direct react-markdown integration in the frontend', () => {
    const root = resolve(process.cwd());
    const importers = sourceFiles(resolve(root, 'src'))
      .filter((file) => /from ['"]react-markdown['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(importers).toEqual(['src/components/MarkdownRenderer.tsx']);
  });
});
