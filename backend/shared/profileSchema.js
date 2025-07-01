// backend/shared/profileSchema.js
// Zod schema describing the "profiles" table shape. Front-end can import the same file (via build alias) to keep types in sync.

const { z } = require('zod');

// Base schema (all columns) – we’ll use .partial() for PATCH/PUT validation
const ProfileSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string().min(1).max(64),
  age: z.number().int().min(1).max(120),
  state: z.string().min(1).max(64),
  codeforces_handle: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_]+$/)
    .optional()
    .nullable(),
  cf_verify_problem_contest_id: z.number().int().optional().nullable(),
  cf_verify_problem_index: z.string().optional().nullable(),
  cf_verify_problem_name: z.string().optional().nullable(),
  cf_verify_start_time: z.number().int().optional().nullable(),
  cf_verified: z.boolean().optional().nullable(),
  created_at: z.any().optional(),
  updated_at: z.any().optional()
});

module.exports = { ProfileSchema };
