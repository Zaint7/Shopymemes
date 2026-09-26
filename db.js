const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'shopymemes.db'));

// ---------- Tabla de productos ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    old_price INTEGER,
    image TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    offer INTEGER NOT NULL DEFAULT 0
  )
`);

// Migración: agrega stock si la tabla ya existía sin esa columna
const productCols = db.prepare("PRAGMA table_info(products)").all();
if (!productCols.some(c => c.name === 'stock')) {
  db.exec('ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0');
}

// ---------- Tabla de categorías ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT 'https://placehold.co/400x400'
  )
`);

// Semilla inicial de categorías, solo si la tabla está vacía
const categoryCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
if (categoryCount === 0) {
  const insertCategory = db.prepare('INSERT INTO categories (slug, name, image) VALUES (?, ?, ?)');
  const seedCategories = [
    { slug: 'mugs', name: 'Mugs', image: 'https://placehold.co/400x400' },
    { slug: 'almohadas', name: 'Almohadas', image: 'https://placehold.co/400x400' },
    { slug: 'llaveros', name: 'Llaveros', image: 'https://placehold.co/400x400' }
  ];
  db.exec('BEGIN');
  try {
    for (const c of seedCategories) insertCategory.run(c.slug, c.name, c.image);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Semilla inicial de productos (solo si la tabla está vacía), usando products-seed.js si existe
const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
if (productCount === 0) {
  let seedProducts = [];
  try {
    seedProducts = require('./products-seed');
  } catch {
    seedProducts = [];
  }

  if (seedProducts.length > 0) {
    const insertProduct = db.prepare(`
      INSERT INTO products (name, price, old_price, image, description, category, offer, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN');
    try {
      for (const p of seedProducts) {
        insertProduct.run(
          p.name,
          p.price,
          p.oldPrice ?? null,
          p.image,
          p.description ?? '',
          p.category,
          p.offer ? 1 : 0,
          p.stock ?? 0
        );
      }
      db.exec('COMMIT');
      console.log(`Se cargaron ${seedProducts.length} productos iniciales`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

// ---------- Helpers de forma ----------
function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    oldPrice: row.old_price,
    image: row.image,
    description: row.description,
    category: row.category,
    offer: Boolean(row.offer),
    stock: row.stock
  };
}

function toCategory(row) {
  return { slug: row.slug, name: row.name, image: row.image };
}

// ---------- Productos ----------
function getProducts() {
  return db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(toProduct);
}

function getProduct(id) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  return row ? toProduct(row) : null;
}

function createProduct(p) {
  const result = db.prepare(`
    INSERT INTO products (name, price, old_price, image, description, category, offer, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(p.name, p.price, p.oldPrice, p.image, p.description, p.category, p.offer ? 1 : 0, p.stock);
  return getProduct(Number(result.lastInsertRowid));
}

function updateProduct(id, p) {
  const result = db.prepare(`
    UPDATE products
    SET name = ?, price = ?, old_price = ?, image = ?, description = ?, category = ?, offer = ?, stock = ?
    WHERE id = ?
  `).run(p.name, p.price, p.oldPrice, p.image, p.description, p.category, p.offer ? 1 : 0, p.stock, id);
  return result.changes > 0 ? getProduct(id) : null;
}

function deleteProduct(id) {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return result.changes > 0;
}

// ---------- Categorías ----------
function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY name ASC').all().map(toCategory);
}

function getCategory(slug) {
  const row = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  return row ? toCategory(row) : null;
}

// Crea la categoría automáticamente si un producto la usa y todavía no existe
// (con nombre e imagen por defecto, editables luego desde el admin)
function ensureCategory(slug) {
  if (!slug) return;
  const exists = db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug);
  if (!exists) {
    const name = slug.charAt(0).toUpperCase() + slug.slice(1);
    db.prepare('INSERT INTO categories (slug, name, image) VALUES (?, ?, ?)')
      .run(slug, name, 'https://placehold.co/400x400');
  }
}

function createCategory(c) {
  db.prepare('INSERT INTO categories (slug, name, image) VALUES (?, ?, ?)').run(c.slug, c.name, c.image);
  return getCategory(c.slug);
}

function updateCategory(slug, c) {
  const result = db.prepare('UPDATE categories SET name = ?, image = ? WHERE slug = ?').run(c.name, c.image, slug);
  return result.changes > 0 ? getCategory(slug) : null;
}

function deleteCategory(slug) {
  const result = db.prepare('DELETE FROM categories WHERE slug = ?').run(slug);
  return result.changes > 0;
}

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  getCategory,
  ensureCategory,
  createCategory,
  updateCategory,
  deleteCategory
};