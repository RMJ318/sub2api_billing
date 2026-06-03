import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppShell } from './AppShell.js';

describe('AppShell', () => {
  beforeEach(() => {
    // Reset localStorage and document class before each test
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('dark'); // default state from index.html
  });

  it('renders the navigation links for all five pages', () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByText('Keys')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
  });

  it('renders the Bell icon', () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('shows unread badge when unreadCount > 0', () => {
    render(
      <AppShell unreadCount={5}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByLabelText('5 unread notifications')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not show badge when unreadCount is 0', () => {
    render(
      <AppShell unreadCount={0}>
        <div>content</div>
      </AppShell>,
    );
    expect(
      screen.queryByLabelText(/unread notifications/),
    ).not.toBeInTheDocument();
  });

  it('caps badge display at 99+', () => {
    render(
      <AppShell unreadCount={150}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('calls onBellClick when Bell is activated', () => {
    const onBellClick = vi.fn();
    render(
      <AppShell onBellClick={onBellClick}>
        <div>content</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(onBellClick).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigate when a nav link is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <AppShell onNavigate={onNavigate}>
        <div>content</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByText('Users'));
    expect(onNavigate).toHaveBeenCalledWith('/users');
  });

  describe('dark theme', () => {
    it('defaults to dark mode when no stored preference', () => {
      localStorage.removeItem('theme-preference');
      render(
        <AppShell>
          <div>content</div>
        </AppShell>,
      );
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('persists theme preference to localStorage on toggle', () => {
      render(
        <AppShell>
          <div>content</div>
        </AppShell>,
      );
      // Default is dark, toggle to light
      fireEvent.click(screen.getByLabelText('Switch to light mode'));
      expect(localStorage.getItem('theme-preference')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('restores persisted light preference', () => {
      localStorage.setItem('theme-preference', 'light');
      document.documentElement.classList.remove('dark');
      render(
        <AppShell>
          <div>content</div>
        </AppShell>,
      );
      // Should stay in light mode
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('toggles back to dark mode', () => {
      localStorage.setItem('theme-preference', 'light');
      document.documentElement.classList.remove('dark');
      render(
        <AppShell>
          <div>content</div>
        </AppShell>,
      );
      fireEvent.click(screen.getByLabelText('Switch to dark mode'));
      expect(localStorage.getItem('theme-preference')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('renders children in the main content area', () => {
    render(
      <AppShell>
        <div data-testid="page-content">Hello</div>
      </AppShell>,
    );
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('highlights the active navigation path', () => {
    render(
      <AppShell activePath="/models">
        <div>content</div>
      </AppShell>,
    );
    const modelsButton = screen.getByText('Models');
    expect(modelsButton.className).toContain('bg-neutral-200');
  });
});
