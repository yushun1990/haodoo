import { z } from 'zod'

const ResourceSchema = z.object({
  url: z.string().url(),
  mediaType: z.string().optional(),
})

const BookSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  category: z.string().optional(),
  series: z
    .object({
      name: z.string().min(1),
      order: z.number().optional(),
    })
    .optional(),
  volume: z
    .object({
      track: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
  cover: ResourceSchema.optional(),
  description: ResourceSchema.optional(),
  epub: ResourceSchema.optional(),
  verticalEpub: ResourceSchema.optional(),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  modifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.object({
    kind: z.enum(['haodoo-classic', 'haodoo-modern']),
    id: z.string().min(1),
  }),
})

export const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal('haodoo-classic'),
  sourceUrl: z.string().url(),
  generatedAt: z.string().datetime(),
  books: z.array(BookSchema),
})
