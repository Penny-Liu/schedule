import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Sidebar from './Sidebar';
import { PERMISSIONS, User, UserRole } from '../types';

function buttons(role: UserRole, permissions: string[], isRadiographer = false) {
  const currentUser = { id: 'test', name: '測試', role, permissions, isRadiographer } as User;
  const html = renderToStaticMarkup(<Sidebar currentUser={currentUser} currentPage="dashboard" onNavigate={() => {}} onLogout={() => {}} />);
  return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<[^>]*>/g, ''));
}

describe('radiographer navigation for administrators', () => {
  it('shows statistics, leave, and skills for a non-radiographer sandbox administrator', () => {
    const labels = buttons(UserRole.SYSTEM_ADMIN, [PERMISSIONS.VIEW_STATS, 'developer_sandbox']);
    expect(labels).toContain('統計');
    expect(labels).toContain('請假');
    expect(labels).toContain('技能矩陣');
  });
  it('still requires the statistics permission for administrators', () => {
    expect(buttons(UserRole.SYSTEM_ADMIN, [])).not.toContain('統計');
  });
  it('keeps radiographer-only items hidden for other non-radiographer accounts', () => {
    const labels = buttons(UserRole.PHYSICIAN_ADMIN, [PERMISSIONS.VIEW_STATS]);
    expect(labels).not.toContain('統計');
    expect(labels).not.toContain('請假');
    expect(labels).not.toContain('技能矩陣');
  });
  it('preserves radiographer and public-viewer behavior', () => {
    expect(buttons(UserRole.RADIOGRAPHER_STAFF, [PERMISSIONS.VIEW_STATS], true)).toContain('請假');
    expect(buttons(UserRole.VIEWER, [PERMISSIONS.VIEW_STATS], true)).not.toContain('統計');
  });
});
