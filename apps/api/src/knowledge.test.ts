import { describe, expect, it } from 'vitest';
import { chunkText, extractFileText } from './knowledge.js';

describe('knowledge ingestion', () => {
  it('chunks normalized text without losing content', () => {
    const input = Array.from({ length: 80 }, (_, index) => `sentence-${index}`).join('   ');
    const chunks = chunkText(input, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toBe(input.replace(/\s+/g, ' '));
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
  });

  it('extracts supported plain text files and rejects binaries', async () => {
    await expect(extractFileText('notes.md', 'text/markdown', Buffer.from('# Knowledge\nUseful fact'))).resolves.toContain('Useful fact');
    await expect(extractFileText('image.png', 'image/png', Buffer.from('fake'))).rejects.toThrow('Unsupported file');
  });
});
