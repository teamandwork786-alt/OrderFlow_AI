import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canChangeRole, effectivePermissions, hasPermission, PERMISSIONS } from '../src/permissions.js';

describe('RBAC map (S0 foundation, PRD scenario 17 groundwork)', () => {
  it('a user with no roles has no permissions', () => assert.equal(effectivePermissions([]).size, 0));
  it('an unknown role grants nothing', () => assert.equal(effectivePermissions(['hacker']).size, 0));
  it('owner and admin hold every key', () => {
    assert.equal(effectivePermissions(['owner']).size, PERMISSIONS.length);
    assert.equal(effectivePermissions(['admin']).size, PERMISSIONS.length);
  });
  it('plain staff cannot dispatch, record delivery, review refunds or see reports', () => {
    for (const p of ['dispatch.create', 'delivery.confirm', 'refund.review', 'report.view', 'users.manage'] as const) {
      assert.equal(hasPermission(['staff'], p), false, p);
    }
    assert.equal(hasPermission(['staff'], 'checklist.update'), true);
  });
  it('capability roles add exactly one key to staff', () => {
    assert.equal(hasPermission(['staff', 'cap_dispatch'], 'dispatch.create'), true);
    assert.equal(hasPermission(['staff', 'cap_dispatch'], 'delivery.confirm'), false);
    assert.equal(hasPermission(['staff', 'cap_address_update'], 'order.address.update'), true);
  });
  it('only an owner can grant or revoke the owner role', () => {
    assert.equal(canChangeRole(['owner'], 'owner'), true);
    assert.equal(canChangeRole(['admin'], 'owner'), false);
    assert.equal(canChangeRole(['admin'], 'staff'), true);
    assert.equal(canChangeRole(['staff'], 'staff'), false);
  });
});
