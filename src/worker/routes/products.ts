import { Hono } from 'hono'
import { eq, like } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, products } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// GET /api/products?search=  — repository list / autocomplete source
app.get('/', async (c) => {
  const search = c.req.query('search')?.trim()
  const db = getDb(c.env.DB)
  let q = db.select().from(products).$dynamic()
  if (search) q = q.where(like(products.name, `%${search}%`))
  const rows = await q.orderBy(products.name).limit(50)
  return c.json({ items: rows, total: rows.length })
})

const ProductSchema = z.object({
  name: z.string().min(1),
  kcal: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  portion: z.string().nullable().optional(),
  serving_g: z.number().nullable().optional(),
  package_g: z.number().nullable().optional(),
  frisco_product_id: z.string().nullable().optional(),
})

// POST /api/products  — add or update a product (upsert by name)
app.post('/', async (c) => {
  const parsed = ProductSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const d = parsed.data
  const db = getDb(c.env.DB)
  const [row] = await db.insert(products).values({
    name: d.name,
    kcal: d.kcal ?? null,
    protein_g: d.protein_g ?? null,
    carbs_g: d.carbs_g ?? null,
    fat_g: d.fat_g ?? null,
    portion: d.portion ?? null,
    serving_g: d.serving_g ?? null,
    package_g: d.package_g ?? null,
    frisco_product_id: d.frisco_product_id ?? null,
  }).onConflictDoUpdate({
    target: products.name,
    set: {
      kcal: d.kcal ?? null,
      protein_g: d.protein_g ?? null,
      carbs_g: d.carbs_g ?? null,
      fat_g: d.fat_g ?? null,
      portion: d.portion ?? null,
      serving_g: d.serving_g ?? null,
      package_g: d.package_g ?? null,
      frisco_product_id: d.frisco_product_id ?? null,
    },
  }).returning()
  return c.json(row, 201)
})

// PATCH /api/products/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = ProductSchema.partial().safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.update(products).set(parsed.data).where(eq(products.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// DELETE /api/products/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  await db.delete(products).where(eq(products.id, id))
  return c.json({ ok: true })
})

export { app as productsRouter }
