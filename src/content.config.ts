import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    audience: z.string().min(1),
    product: z.string().min(1),
    version: z.string().min(1),
    // Publication must be an explicit editorial change.
    draft: z.boolean().default(true),
  }),
});

export const collections = { docs };
