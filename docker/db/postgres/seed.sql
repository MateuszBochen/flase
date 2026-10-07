-- Sample data for the PostgreSQL container (database `shop`, created by POSTGRES_DB).

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories (id),
    name VARCHAR(150) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    stock INT NOT NULL DEFAULT 0
);

CREATE TYPE order_status AS ENUM ('new', 'paid', 'shipped', 'cancelled');

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers (id),
    status order_status NOT NULL DEFAULT 'new',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    order_id INT NOT NULL REFERENCES orders (id),
    product_id INT NOT NULL REFERENCES products (id),
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (order_id, product_id)
);

INSERT INTO categories (name) VALUES
    ('Books'), ('Electronics'), ('Garden'), ('Toys'), ('Kitchen');

INSERT INTO customers (email, first_name, last_name, city, created_at)
SELECT
    'user' || n || '@example.com',
    (ARRAY['Anna', 'Jan', 'Piotr', 'Kasia', 'Marek', 'Ola', 'Tomek', 'Ewa'])[1 + n % 8],
    (ARRAY['Nowak', 'Kowalski', 'Wisniewski', 'Wojcik', 'Kaminski', 'Lewandowski'])[1 + n % 6],
    CASE WHEN n % 7 = 0 THEN NULL
         ELSE (ARRAY['Warszawa', 'Krakow', 'Gdansk', 'Wroclaw', 'Poznan'])[1 + n % 5] END,
    TIMESTAMP '2026-01-01' - n * INTERVAL '1 day'
FROM generate_series(1, 200) AS n;

INSERT INTO products (category_id, name, price, stock)
SELECT 1 + n % 5, 'Product #' || n, ROUND(5 + (n * 37 % 500) + (n % 100) / 100.0, 2), n * 13 % 250
FROM generate_series(1, 120) AS n;

INSERT INTO orders (customer_id, status, created_at)
SELECT
    1 + n * 7 % 200,
    (ARRAY['new', 'paid', 'shipped', 'cancelled'])[1 + n % 4]::order_status,
    TIMESTAMP '2026-10-01' - n * 11 * INTERVAL '1 hour'
FROM generate_series(1, 500) AS n;

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT o.id, p.id, 1 + (o.id + k) % 4, p.price
FROM orders o
CROSS JOIN LATERAL generate_series(0, o.id % 3) AS k
JOIN products p ON p.id = 1 + (o.id * 17 + k * 31) % 120;

-- Second schema, so the client has something besides `public` to browse.
CREATE SCHEMA blog;

CREATE TABLE blog.authors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    bio TEXT NULL
);

CREATE TABLE blog.posts (
    id SERIAL PRIMARY KEY,
    author_id INT NOT NULL REFERENCES blog.authors (id),
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMP NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    meta JSONB NULL
);

INSERT INTO blog.authors (name, bio) VALUES
    ('Alice', 'Writes about databases.'),
    ('Bob', NULL),
    ('Carol', 'Frontend enthusiast. Likes "quotes" and ''apostrophes''.');

INSERT INTO blog.posts (author_id, title, body, published, published_at, tags, meta)
SELECT
    1 + n % 3,
    'Post number ' || n,
    'Lorem ipsum dolor sit amet, post ' || n || '.',
    n % 4 <> 0,
    CASE WHEN n % 4 = 0 THEN NULL ELSE TIMESTAMP '2026-09-01' - n * INTERVAL '1 day' END,
    ARRAY['tag' || n % 5, 'tag' || n % 7],
    jsonb_build_object('views', n * 42, 'featured', n % 10 = 0)
FROM generate_series(1, 75) AS n;
