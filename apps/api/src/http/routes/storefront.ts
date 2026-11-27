import { Router } from "express";
import { listStorefrontProducts } from "../../modules/products/index.js";

export function createStorefrontRouter(): Router {
  const router = Router();
  router.get("/storefront/products", async (_request, response) => {
    response.json({ items: await listStorefrontProducts() });
  });
  return router;
}
