import { z } from "zod";

const EnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url(),
    OIDC_ISSUER_URL: z.url(),
    OIDC_INTERNAL_URL: z.url(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_REDIRECT_URI: z.url(),
    OIDC_SCOPES: z.string().default("openid profile email"),
    SESSION_SECRET: z.string().min(32),
    SESSION_COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true")
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === "production" &&
      (!config.SESSION_COOKIE_SECURE ||
        new URL(config.WEB_ORIGIN).protocol !== "https:" ||
        new URL(config.OIDC_ISSUER_URL).protocol !== "https:" ||
        new URL(config.OIDC_REDIRECT_URI).protocol !== "https:")
    ) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_COOKIE_SECURE"],
        message: "Production authentication requires HTTPS and secure cookies."
      });
    }
  });

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(
      `Invalid API configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`
    );
  }
  return parsed.data;
}

export const config = loadConfig();
