import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/check-pdfs.sh', import.meta.url));

// Synthetic content only: a PDF header followed by filler, never a real report.
const PDF_CONTENT = '%PDF-1.7\n%synthetic test content\n';

// Larger than a pipe buffer, so git is still writing when the check stops reading.
const LARGE_FILE_BYTES = 1024 * 1024;

// Isolate the throwaway repositories from the developer's git configuration
// (signing, hooks, global excludes that ignore *.pdf).
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

let repo: string;

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: repo, env: GIT_ENV, stdio: 'pipe' });
}

function write(path: string, content: string): void {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function commitFile(path: string, content: string): void {
  write(path, content);
  git('add', '-f', '--', path);
  git('commit', '-q', '-m', `add ${path}`);
}

function deleteFile(path: string): void {
  git('rm', '-q', '--', path);
  git('commit', '-q', '-m', `remove ${path}`);
}

function check(base?: string): { status: number | null; output: string } {
  const args = base === undefined ? [] : [base];
  const result = spawnSync(SCRIPT, args, { cwd: repo, env: GIT_ENV, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'check-pdfs-'));
  git('init', '-q', '-b', 'main');
  commitFile('README.md', 'A clean repository\n');
  git('branch', 'base');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('check-pdfs', () => {
  it('passes a clean history, with and without a base ref', () => {
    commitFile('src/main.ts', 'export {};\n');
    commitFile('docs/format.md', 'Reports begin with the header %PDF-1.7.\n');

    expect(check()).toMatchObject({ status: 0 });
    expect(check('base')).toMatchObject({ status: 0 });
  });

  it('fails when a PDF was added and deleted again within the range', () => {
    commitFile('report.pdf', PDF_CONTENT);
    deleteFile('report.pdf');

    const result = check('base');
    expect(result.status).toBe(1);
    expect(result.output).toContain('report.pdf');
  });

  it('checks only the tree when no base ref is given', () => {
    commitFile('report.pdf', PDF_CONTENT);
    deleteFile('report.pdf');

    expect(check()).toMatchObject({ status: 0 });
  });

  // Each case is caught by one scan only: by name, or by content.
  const pdfFiles = [
    { found: 'by name', path: 'report.pdf', content: 'not really a PDF\n' },
    { found: 'by content', path: 'report.bin', content: PDF_CONTENT },
  ];

  it.each(pdfFiles)('fails when a merged branch added and deleted a PDF $found', ({ path, content }) => {
    git('switch', '-q', '-c', 'side', 'base');
    commitFile(path, content);
    deleteFile(path);
    git('switch', '-q', 'main');
    commitFile('src/main.ts', 'export {};\n');
    git('merge', '-q', '--no-edit', 'side');

    const result = check('base');
    expect(result.status).toBe(1);
    expect(result.output).toContain(path);
  });

  it.each(pdfFiles)(
    'fails when a merge commit itself added a PDF $found that was later deleted',
    ({ path, content }) => {
      git('switch', '-q', '-c', 'side', 'base');
      commitFile('src/side.ts', 'export {};\n');
      git('switch', '-q', 'main');
      commitFile('src/main.ts', 'export {};\n');
      git('merge', '-q', '--no-commit', 'side');
      write(path, content);
      git('add', '-f', '--', path);
      git('commit', '-q', '--no-edit');
      deleteFile(path);

      const result = check('base');
      expect(result.status).toBe(1);
      expect(result.output).toContain(path);
    },
  );

  it('fails when a file under another name with PDF content was added and deleted', () => {
    commitFile('notes.txt', PDF_CONTENT);
    deleteFile('notes.txt');

    const result = check('base');
    expect(result.status).toBe(1);
    expect(result.output).toContain('notes.txt');
  });

  it('passes a range that adds a file larger than a pipe buffer', () => {
    commitFile('data/large.bin', 'x'.repeat(LARGE_FILE_BYTES));

    expect(check('base')).toMatchObject({ status: 0 });
  });

  it('fails when a file was changed to PDF content and then deleted', () => {
    commitFile('README.md', PDF_CONTENT);
    deleteFile('README.md');

    const result = check('base');
    expect(result.status).toBe(1);
    expect(result.output).toContain('README.md');
  });

  it('fails when a renamed file gained PDF content and was then deleted', () => {
    const body = 'synthetic filler line\n'.repeat(50);
    commitFile('notes.txt', body);
    git('branch', '-f', 'base');
    git('mv', '--', 'notes.txt', 'renamed.txt');
    write('renamed.txt', `${PDF_CONTENT}${body}`);
    git('add', '--', 'renamed.txt');
    git('commit', '-q', '-m', 'rename notes.txt');
    deleteFile('renamed.txt');

    const result = check('base');
    expect(result.status).toBe(1);
    expect(result.output).toContain('renamed.txt');
  });

  it('fails when a file was renamed to a PDF name and then deleted', () => {
    git('mv', '--', 'README.md', 'report.pdf');
    git('commit', '-q', '-m', 'rename README.md');
    deleteFile('report.pdf');

    const result = check('base');
    expect(result.status).toBe(1);
    expect(result.output).toContain('report.pdf');
  });

  it('fails when a tracked file under another name holds PDF content', () => {
    commitFile('notes.txt', PDF_CONTENT);

    const result = check();
    expect(result.status).toBe(1);
    expect(result.output).toContain('notes.txt');
  });

  it('fails on an upper-case extension in a subdirectory', () => {
    commitFile('reports/REPORT.PDF', 'not really a PDF\n');

    const result = check();
    expect(result.status).toBe(1);
    expect(result.output).toContain('reports/REPORT.PDF');
  });

  it('fails rather than passing when the base ref does not exist', () => {
    const result = check('no-such-ref');
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('no-such-ref');
  });

  it('fails rather than passing outside a git repository', () => {
    rmSync(join(repo, '.git'), { recursive: true, force: true });

    const result = check();
    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain('No PDF files');
  });

  it('fails rather than passing when a history scan cannot run git log', () => {
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const bin = join(repo, '.fake-bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh\n[ "$1" = log ] && { echo 'simulated failure' >&2; exit 128; }\nexec '${realGit}' "$@"\n`,
      { mode: 0o755 },
    );

    const result = spawnSync(SCRIPT, ['base'], {
      cwd: repo,
      env: { ...GIT_ENV, PATH: `${bin}:${process.env.PATH ?? ''}` },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toContain('No PDF files');
  });
});
