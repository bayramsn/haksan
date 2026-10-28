// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { deferDialog } from './DeferredCreateDialogs';
const error = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const Form = ({ defaultOpen, trigger }: any) => <>{trigger}{defaultOpen && <div role="dialog">Form açık</div>}</>;
it('does not import closed forms and opens on the first click after loading', async () => {
  const load = vi.fn().mockResolvedValue(Form); const Deferred = deferDialog(load);
  render(<Deferred trigger={<button>Yeni kayıt</button>} />);
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button')); await screen.findByRole('dialog');
  expect(load).toHaveBeenCalledTimes(1);
});
it('prevents duplicate loads and allows retry after import failure', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Form); const Deferred = deferDialog(load);
  render(<Deferred trigger={<button>Yeni kayıt</button>} />);
  fireEvent.click(screen.getByRole('button')); fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
  expect(load).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button')); await screen.findByRole('dialog');
  expect(load).toHaveBeenCalledTimes(2);
});
it('honors the original trigger cancellation', () => {
  const load = vi.fn(); const Deferred = deferDialog(load);
  render(<Deferred trigger={<button onClick={event => event.preventDefault()}>Vazgeç</button>} />);
  fireEvent.click(screen.getByRole('button')); expect(load).not.toHaveBeenCalled();
});
it('ignores imports that finish after the scope unmounts', async () => {
  let finish: any; const Deferred = deferDialog(() => new Promise<typeof Form>(resolve => { finish = resolve; }));
  const view = render(<Deferred trigger={<button>Aç</button>} />);
  fireEvent.click(screen.getByRole('button')); view.unmount(); finish(Form);
  await Promise.resolve(); expect(screen.queryByRole('dialog')).toBeNull();
});
