import { z } from "zod";
import type { Role } from "./enums.js";

/** A staff member as an author, for Studio (profile editing and the byline picker). */
export interface StaffAuthor {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  avatarUrl: string | null;
  /** Null until they first save a profile; it's their /author/<slug> page. */
  slug: string | null;
  title: string | null;
  bio: string | null;
  socials: { x?: string; linkedin?: string; website?: string };
  expertise: string[];
}

const httpsOrEmpty = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use a full https:// address");

export const AuthorProfileInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a display name").max(80),
    avatarUrl: z
      .string()
      .trim()
      .max(1000)
      .refine((v) => v === "" || /^(https:\/\/|\/[^/])/.test(v), "Use an https:// image address")
      .default(""),
    title: z.string().trim().max(80).default(""),
    bio: z.string().trim().max(1000).default(""),
    socials: z.object({ x: httpsOrEmpty, linkedin: httpsOrEmpty, website: httpsOrEmpty }).partial().strict().default({}),
    expertise: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  })
  .strict();
export type AuthorProfileInput = z.infer<typeof AuthorProfileInputSchema>;
