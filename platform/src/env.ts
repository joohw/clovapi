interface SecretBindings {
  AUTH_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
}

export type Env = CloudflareBindings & SecretBindings;
