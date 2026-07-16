import { describe, expect, it } from 'vitest';
import { resolveMediaUrlAgainstBase } from './apiClient';

describe('resolveMediaUrlAgainstBase', () => {
  it('adds the API base to canonical product media paths', () => {
    expect(resolveMediaUrlAgainstBase('/products/media/file-id', '/api/v1')).toBe('/api/v1/products/media/file-id');
  });

  it('does not duplicate an already-versioned API path', () => {
    expect(resolveMediaUrlAgainstBase('/api/v1/products/media/file-id', '/api/v1')).toBe('/api/v1/products/media/file-id');
  });

  it('resolves both path formats when the API base is absolute', () => {
    const base = 'https://crm.example.com/api/v1/';
    expect(resolveMediaUrlAgainstBase('/products/media/file-id', base)).toBe(
      'https://crm.example.com/api/v1/products/media/file-id'
    );
    expect(resolveMediaUrlAgainstBase('/api/v1/products/media/file-id', base)).toBe(
      'https://crm.example.com/api/v1/products/media/file-id'
    );
  });

  it('leaves browser-native and absolute media references unchanged', () => {
    expect(resolveMediaUrlAgainstBase('https://storage.example.com/image.jpg', '/api/v1')).toBe(
      'https://storage.example.com/image.jpg'
    );
    expect(resolveMediaUrlAgainstBase('data:image/png;base64,abc', '/api/v1')).toBe('data:image/png;base64,abc');
    expect(resolveMediaUrlAgainstBase('blob:https://crm.example.com/id', '/api/v1')).toBe(
      'blob:https://crm.example.com/id'
    );
  });
});
