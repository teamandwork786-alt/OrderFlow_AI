-- 0002_reference_data: permission keys, seeded roles and their permissions (architecture section 12).
-- Idempotent so it can be re-applied safely.

INSERT INTO permissions (key) VALUES
  ('orders.read'), ('order.address.read'), ('order.address.update'), ('checklist.update'),
  ('dispatch.create'), ('delivery.confirm'), ('refund.apply'), ('refund.read'), ('refund.review'),
  ('order.exception.record'), ('report.view'), ('audit.read'), ('users.manage'), ('system.manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (key, name) VALUES
  ('owner', 'Owner'), ('admin', 'Admin'), ('staff', 'Staff'),
  ('cap_dispatch', 'Capability: dispatch'), ('cap_delivery', 'Capability: delivery'),
  ('cap_report', 'Capability: reports'), ('cap_address_update', 'Capability: address update')
ON CONFLICT (key) DO NOTHING;

-- owner and admin: every permission key
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key IN ('owner', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM (VALUES
  ('staff', 'orders.read'), ('staff', 'order.address.read'), ('staff', 'checklist.update'),
  ('staff', 'refund.apply'), ('staff', 'refund.read'),
  ('cap_dispatch', 'dispatch.create'), ('cap_delivery', 'delivery.confirm'),
  ('cap_report', 'report.view'), ('cap_address_update', 'order.address.update')
) AS m(role_key, perm_key)
JOIN roles r ON r.key = m.role_key
JOIN permissions p ON p.key = m.perm_key
ON CONFLICT DO NOTHING;
