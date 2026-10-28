// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ auth: { authed: false, loading: false, login: vi.fn() }, workspace: vi.fn(), mark: vi.fn() }));
vi.mock('../lib/auth', () => ({ useAuth: () => mocks.auth, AuthProvider: ({ children }: any) => children }));
vi.mock('./components/pages/Login', () => ({ LoginPage: ({ onReplayIntro }: any) => <button onClick={onReplayIntro}>Giriş</button> }));
vi.mock('./components/pages/Onboarding', () => ({ shouldShowOnboarding: () => false, markOnboardingSeen: mocks.mark, OnboardingPage: ({ onFinish }: any) => <button onClick={onFinish}>Tanıtımı bitir</button> }));
vi.mock('./components/shared/PageLoadingSkeleton', () => ({ PageLoadingSkeleton: () => <div>Yükleniyor</div> }));
vi.mock('./WorkspaceApp', () => { mocks.workspace(); return { default: () => <div>CRM çalışma alanı</div> }; });
import { SessionGate } from './App';
afterEach(() => { cleanup(); mocks.auth.authed = false; mocks.auth.loading = false; });
it('keeps the workspace unloaded until authenticated and unmounts it on logout', async () => {
  const view = render(<SessionGate />);
  expect(screen.getByText('Giriş')).toBeTruthy(); expect(mocks.workspace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Giriş')); fireEvent.click(screen.getByText('Tanıtımı bitir'));
  expect(mocks.mark).toHaveBeenCalledOnce();
  mocks.auth.authed = true; view.rerender(<SessionGate />);
  await screen.findByText('CRM çalışma alanı'); expect(mocks.workspace).toHaveBeenCalledOnce();
  mocks.auth.authed = false; view.rerender(<SessionGate />);
  expect(screen.queryByText('CRM çalışma alanı')).toBeNull(); expect(screen.getByText('Giriş')).toBeTruthy();
});
it('does not flash login before session restoration completes', () => {
  mocks.auth.loading = true; render(<SessionGate />);
  expect(screen.getByText('Yükleniyor')).toBeTruthy(); expect(screen.queryByText('Giriş')).toBeNull();
});
