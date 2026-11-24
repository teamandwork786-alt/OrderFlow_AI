#!/usr/bin/env bash
# Verifies database-enforced rules against a migrated database (architecture 8.3 and 8.5).
# Usage: PGHOST=... PGPORT=... apps/api/test/sql/constraints.sh   (database "orderflow", demo roles)
set -u
pass=0; fail=0
q() { psql -X -q -At -U "$1" -d orderflow -c "$2" 2>&1; }
expect_error() { # name role sql expected-substring
  out=$(q "$2" "$3"); if echo "$out" | grep -qi "$4"; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 -> $out"; fail=$((fail+1)); fi; }
expect_ok() { # name role sql
  out=$(q "$2" "$3"); if echo "$out" | grep -qi "error"; then echo "FAIL  $1 -> $out"; fail=$((fail+1)); else echo "PASS  $1"; pass=$((pass+1)); fi; }

O=orderflow_owner; A=orderflow_app; R=orderflow_ro
q $O "TRUNCATE order_notes, audit_events, dispatches, orders, users CASCADE" >/dev/null
q $O "INSERT INTO users(id,oidc_subject) VALUES ('00000000-0000-0000-0000-000000000001','u1')" >/dev/null
INS="INSERT INTO orders(id,shopify_order_id,shopify_order_number,currency,subtotal_amount,shipping_amount,total_amount,shopify_financial_status,shopify_updated_at,last_synced_at) VALUES"
q $A "$INS ('10000000-0000-0000-0000-000000000001','s1','#1001','PKR',100,0,100,'PAID',now(),now())" >/dev/null
expect_error "duplicate shopify_order_id rejected" $A "$INS ('10000000-0000-0000-0000-000000000002','s1','#1002','PKR',1,0,1,'PAID',now(),now())" "unique"
expect_error "negative amount rejected" $A "$INS ('10000000-0000-0000-0000-000000000003','s3','#1003','PKR',-1,0,1,'PAID',now(),now())" "check"
expect_error "bad lifecycle value rejected" $A "UPDATE orders SET lifecycle_status='REFUNDED' WHERE shopify_order_id='s1'" "check"
q $A "UPDATE orders SET payment_verified_at=now() WHERE shopify_order_id='s1'" >/dev/null
expect_error "set-once payment_verified_at cannot change" $A "UPDATE orders SET payment_verified_at=now()+interval '1 day' WHERE shopify_order_id='s1'" "set once"
q $A "UPDATE orders SET lifecycle_status='PAID' WHERE shopify_order_id='s1'" >/dev/null
q $A "UPDATE orders SET lifecycle_status='CANCELLED' WHERE shopify_order_id='s1'" >/dev/null
expect_error "CANCELLED is terminal" $A "UPDATE orders SET lifecycle_status='PAID' WHERE shopify_order_id='s1'" "cannot leave"
q $A "$INS ('10000000-0000-0000-0000-000000000004','s4','#1004','PKR',1,0,1,'PAID',now(),now())" >/dev/null
q $A "UPDATE orders SET lifecycle_status='DISPATCHED', dispatched_at=now() WHERE shopify_order_id='s4'" >/dev/null
expect_error "dispatched order cannot be cancelled" $A "UPDATE orders SET lifecycle_status='CANCELLED' WHERE shopify_order_id='s4'" "cannot be cancelled"
q $A "UPDATE orders SET lifecycle_status='DELIVERED', delivered_at=now(), delivered_by='00000000-0000-0000-0000-000000000001' WHERE shopify_order_id='s4'" >/dev/null
expect_error "delivered_at set once" $A "UPDATE orders SET delivered_at=now()+interval '1 day' WHERE shopify_order_id='s4'" "set once"
expect_error "DELIVERED cannot move back" $A "UPDATE orders SET lifecycle_status='DISPATCHED' WHERE shopify_order_id='s4'" "cannot leave"

D="INSERT INTO dispatches(order_id,request_id,request_hash,status,tracking_number,requested_by) VALUES ('10000000-0000-0000-0000-000000000001'"
U="'00000000-0000-0000-0000-000000000001'"
expect_ok "first active dispatch attempt allowed" $A "$D,'20000000-0000-0000-0000-000000000001','h','PENDING','TRK-12345',$U)"
expect_error "second active attempt rejected" $A "$D,'20000000-0000-0000-0000-000000000002','h','PENDING_CONFIRMATION','TRK-12346',$U)" "unique"
expect_error "tracking length 5 rejected" $A "$D,'20000000-0000-0000-0000-000000000003','h','FAILED','ABC12',$U)" "check"
expect_ok "tracking length 6 accepted" $A "$D,'20000000-0000-0000-0000-000000000004','h','FAILED','ABC123',$U)"
expect_ok "tracking length 30 accepted" $A "$D,'20000000-0000-0000-0000-000000000005','h','FAILED','$(printf 'A%.0s' {1..30})',$U)"
expect_error "tracking length 31 rejected" $A "$D,'20000000-0000-0000-0000-000000000006','h','FAILED','$(printf 'A%.0s' {1..31})',$U)" "check"
expect_error "tracking with punctuation rejected" $A "$D,'20000000-0000-0000-0000-000000000007','h','FAILED','AB_123!',$U)" "check"
q $A "UPDATE dispatches SET status='SUCCEEDED' WHERE request_id='20000000-0000-0000-0000-000000000001'" >/dev/null
expect_error "second SUCCEEDED dispatch rejected" $A "UPDATE dispatches SET status='SUCCEEDED' WHERE request_id='20000000-0000-0000-0000-000000000004'" "unique"

q $A "INSERT INTO audit_events(event_type,actor_type) VALUES ('T','SYSTEM')" >/dev/null
expect_error "app cannot UPDATE audit_events" $A "UPDATE audit_events SET event_type='X'" "permission denied"
expect_error "app cannot DELETE audit_events" $A "DELETE FROM audit_events" "permission denied"
expect_error "owner UPDATE audit_events blocked by trigger" $O "UPDATE audit_events SET event_type='X'" "append-only"
expect_error "owner DELETE audit_events blocked by trigger" $O "DELETE FROM audit_events" "append-only"
expect_error "app cannot DELETE orders" $A "DELETE FROM orders" "permission denied"
expect_error "app cannot TRUNCATE orders" $A "TRUNCATE orders CASCADE" "permission denied"
expect_ok "owner can TRUNCATE for reset" $O "TRUNCATE order_notes, audit_events, dispatches, orders CASCADE"

expect_ok "ro can read allowed order columns" $R "SELECT id, lifecycle_status, dispatched_at FROM orders"
expect_error "ro cannot read shipping address" $R "SELECT shopify_shipping_address FROM orders" "permission denied"
expect_error "ro cannot read customer phone" $R "SELECT customer_phone FROM orders" "permission denied"
expect_error "ro cannot read address override" $R "SELECT address_override FROM orders" "permission denied"
expect_error "ro cannot read delivery note" $R "SELECT delivery_note FROM dispatches" "permission denied"
expect_error "ro cannot read webhook_inbox" $R "SELECT * FROM webhook_inbox" "permission denied"
expect_error "ro cannot read audit_events" $R "SELECT * FROM audit_events" "permission denied"
expect_error "ro cannot read users" $R "SELECT * FROM users" "permission denied"
expect_error "ro cannot INSERT" $R "INSERT INTO integration_state(key,value) VALUES ('k','{}')" "permission denied"
expect_error "ro cannot UPDATE orders" $R "UPDATE orders SET currency='USD'" "permission denied"
echo "---- passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
