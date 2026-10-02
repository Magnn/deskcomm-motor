import { z } from "zod";

/**
 * Corpo de `POST /api/v1/tenants/subscription`.
 *
 * `integration` + `external_id` são o MESMO par de `tenant-provisioning.ts`: o
 * id externo é o da assinatura (ou do cliente) na plataforma de pagamento.
 * Os dados do dono só são necessários no primeiro pagamento, quando a empresa
 * ainda não existe — por isso são opcionais aqui, e a regra é quem cobra.
 */
export const tenantSubscriptionSchema = z
  .object({
    integration: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{1,30}$/),
    external_id: z.string().trim().min(1).max(200),
    /** `active`: pagou / assinatura em dia. `suspended`: cancelou, venceu, estornou. */
    status: z.enum(["active", "suspended"]),
    organization_name: z.string().trim().min(1).max(200).optional(),
    owner_email: z.string().trim().email().optional(),
    owner_name: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type TenantSubscriptionInput = z.infer<typeof tenantSubscriptionSchema>;
