import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { formatPkr, parseMoney } from "../model/money.js";
import {
  submitOrder,
  type ApiFailure,
  type OrderSubmission
} from "../model/storefront-api.js";
import { usePricedCart } from "./storefront.js";

export interface CheckoutForm {
  recipient_name: string;
  phone: string;
  email: string;
  delivery_address: string;
  note: string;
}

export const EMPTY_FORM: CheckoutForm = {
  recipient_name: "",
  phone: "",
  email: "",
  delivery_address: "",
  note: ""
};

export function useCheckout() {
  const priced = usePricedCart();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Synchronous guard: a double click can fire before React re-renders.
  const inFlight = useRef(false);
  const requestId = useRef(crypto.randomUUID());

  async function place(form: CheckoutForm): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setProblem(null);
    const body: OrderSubmission = {
      request_id: requestId.current,
      expected_total: priced.expectedTotal,
      recipient_name: form.recipient_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      delivery_address: form.delivery_address.trim(),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      items: priced.cart.lines.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity
      }))
    };
    try {
      const order = await submitOrder(body);
      requestId.current = crypto.randomUUID();
      priced.cart.clear();
      await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      navigate(`/my-orders/${order.order_number}`, { replace: true });
    } catch (error) {
      setProblem(describeFailure(error as ApiFailure));
      if (isStale(error as ApiFailure)) {
        requestId.current = crypto.randomUUID();
        await queryClient.invalidateQueries({ queryKey: ["products"] });
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { priced, pending, problem, place };
}

function isStale(error: ApiFailure): boolean {
  return error.code === "PRICE_CHANGED" || error.code === "PRODUCT_UNAVAILABLE";
}

function describeFailure(error: ApiFailure): string {
  switch (error.code) {
    case "PRICE_CHANGED": {
      const total = safeTotal(error.currentTotal);
      return total
        ? `The price has changed. The total is now ${total}. Review your bag and place the order again.`
        : "The price has changed. Review your bag and place the order again.";
    }
    case "PRODUCT_UNAVAILABLE":
      return "One or more items in your bag are no longer available. Remove them and try again.";
    case "RATE_LIMITED":
      return "You have placed several orders recently. Please try again later.";
    case "VALIDATION_FAILED":
      return "Some details look invalid. Check your phone, email and address.";
    default:
      return "The order could not be placed. Nothing was charged. Please try again.";
  }
}

function safeTotal(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return formatPkr(parseMoney(value));
  } catch {
    return null;
  }
}
