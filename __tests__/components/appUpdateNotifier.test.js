/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AppUpdateNotifier } from '@/components/AppUpdateNotifier';
import { fetchLatestBuildId, reloadPage } from '@/lib/appVersion';

let mockOwnBuildId;
const mockOutdatedListeners = new Set();

jest.mock('@/lib/appVersion', () => ({
  VERSION_CHECK_MS: 60_000,
  currentBuildId: () => mockOwnBuildId,
  fetchLatestBuildId: jest.fn(),
  reloadPage: jest.fn(),
}));
jest.mock('@/lib/apiClient', () => ({
  onAppOutdated: (listener) => {
    mockOutdatedListeners.add(listener);
    return () => mockOutdatedListeners.delete(listener);
  },
}));
jest.mock('@/lib/clientMonitoring', () => ({ captureClientException: jest.fn() }));

const settle = () => act(async () => {});
const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const noticeVisible = () => screen.queryByRole('dialog') !== null;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockOwnBuildId = 'deploy-1';
  mockOutdatedListeners.clear();
  fetchLatestBuildId.mockResolvedValue('deploy-1');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AppUpdateNotifier', () => {
  it('shows nothing while the tab runs the latest deploy', async () => {
    render(<AppUpdateNotifier />);
    await settle();

    expect(fetchLatestBuildId).toHaveBeenCalledTimes(1);
    expect(noticeVisible()).toBe(false);
  });

  it('puts a notice over the app as soon as it opens with old code (a tab restored from a cache)', async () => {
    fetchLatestBuildId.mockResolvedValue('deploy-2');

    render(<AppUpdateNotifier />);
    await settle();

    expect(screen.getByRole('dialog').textContent).toContain('Hay una versión nueva');
    expect(screen.getByRole('dialog').textContent).toContain('Actualice la página para seguir trabajando');
  });

  it('notices a deploy made while the tab was open, within a minute', async () => {
    render(<AppUpdateNotifier />);
    await settle();
    expect(noticeVisible()).toBe(false);

    fetchLatestBuildId.mockResolvedValue('deploy-2');
    await advance(60_000);

    expect(noticeVisible()).toBe(true);
  });

  it('only way out is to reload: Escape and the backdrop do not close it, and the button reloads', async () => {
    fetchLatestBuildId.mockResolvedValue('deploy-2');
    render(<AppUpdateNotifier />);
    await settle();

    fireEvent.keyDown(screen.getByRole('dialog').parentElement, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
    expect(noticeVisible()).toBe(true);
    expect(reloadPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('shows the notice the moment the server refuses a change because the page is old, without waiting for the next check', async () => {
    render(<AppUpdateNotifier />);
    await settle();
    expect(noticeVisible()).toBe(false);

    act(() => mockOutdatedListeners.forEach((listener) => listener()));

    expect(noticeVisible()).toBe(true);
  });

  it('stops asking once the notice is up', async () => {
    fetchLatestBuildId.mockResolvedValue('deploy-2');
    render(<AppUpdateNotifier />);
    await settle();
    const calls = fetchLatestBuildId.mock.calls.length;

    await advance(5 * 60_000);

    expect(fetchLatestBuildId).toHaveBeenCalledTimes(calls);
  });

  it('does not bother anybody when the check fails (offline, a deploy in progress): it tries again later', async () => {
    fetchLatestBuildId.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('deploy-2');
    render(<AppUpdateNotifier />);
    await settle();
    expect(noticeVisible()).toBe(false);

    await advance(60_000);

    expect(noticeVisible()).toBe(true);
  });

  it('does nothing on a local build, which has no id to compare', async () => {
    mockOwnBuildId = undefined;

    render(<AppUpdateNotifier />);
    await advance(5 * 60_000);

    expect(fetchLatestBuildId).not.toHaveBeenCalled();
    expect(noticeVisible()).toBe(false);
  });
});
