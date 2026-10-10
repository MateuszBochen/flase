-- Sample data shared by MySQL and MariaDB containers.

CREATE DATABASE IF NOT EXISTS `shop` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `blog` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `shop`.* TO 'flase'@'%';
GRANT ALL PRIVILEGES ON `blog`.* TO 'flase'@'%';
FLUSH PRIVILEGES;

-- ---------------------------------------------------------------- shop

USE `shop`;

CREATE TABLE `digits` (`d` TINYINT UNSIGNED NOT NULL PRIMARY KEY);
INSERT INTO `digits` VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9);

CREATE TABLE `customers` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `email` VARCHAR(191) NOT NULL UNIQUE,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `city` VARCHAR(100) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `categories` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE `products` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `category_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `price` DECIMAL(10,2) NOT NULL,
    `stock` INT NOT NULL DEFAULT 0,
    CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
);

CREATE TABLE `orders` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `customer_id` INT UNSIGNED NOT NULL,
    `status` ENUM('new','paid','shipped','cancelled') NOT NULL DEFAULT 'new',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
);

CREATE TABLE `order_items` (
    `order_id` INT UNSIGNED NOT NULL,
    `product_id` INT UNSIGNED NOT NULL,
    `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (`order_id`, `product_id`),
    CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
    CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
);

INSERT INTO `categories` (`name`) VALUES
    ('Books'), ('Electronics'), ('Garden'), ('Toys'), ('Kitchen');

-- 200 customers
INSERT INTO `customers` (`email`, `first_name`, `last_name`, `city`, `created_at`)
SELECT
    CONCAT('user', n, '@example.com'),
    ELT(1 + n % 8, 'Anna', 'Jan', 'Piotr', 'Kasia', 'Marek', 'Ola', 'Tomek', 'Ewa'),
    ELT(1 + n % 6, 'Nowak', 'Kowalski', 'Wisniewski', 'Wojcik', 'Kaminski', 'Lewandowski'),
    IF(n % 7 = 0, NULL, ELT(1 + n % 5, 'Warszawa', 'Krakow', 'Gdansk', 'Wroclaw', 'Poznan')),
    DATE_SUB('2026-01-01', INTERVAL n DAY)
FROM (SELECT a.d * 100 + b.d * 10 + c.d + 1 AS n FROM `digits` a, `digits` b, `digits` c) s
WHERE n <= 200;

-- 120 products
INSERT INTO `products` (`category_id`, `name`, `price`, `stock`)
SELECT
    1 + n % 5,
    CONCAT('Product #', n),
    ROUND(5 + (n * 37 % 500) + (n % 100) / 100, 2),
    n * 13 % 250
FROM (SELECT a.d * 100 + b.d * 10 + c.d + 1 AS n FROM `digits` a, `digits` b, `digits` c) s
WHERE n <= 120;

-- 500 orders
INSERT INTO `orders` (`customer_id`, `status`, `created_at`)
SELECT
    1 + n * 7 % 200,
    ELT(1 + n % 4, 'new', 'paid', 'shipped', 'cancelled'),
    DATE_SUB('2026-10-01', INTERVAL n * 11 HOUR)
FROM (SELECT a.d * 100 + b.d * 10 + c.d + 1 AS n FROM `digits` a, `digits` b, `digits` c) s
WHERE n <= 500;

-- 1-3 items per order
INSERT INTO `order_items` (`order_id`, `product_id`, `quantity`, `unit_price`)
SELECT o.`id`, p.`id`, 1 + (o.`id` + k.d) % 4, p.`price`
FROM `orders` o
JOIN `digits` k ON k.d < 1 + o.`id` % 3
JOIN `products` p ON p.`id` = 1 + (o.`id` * 17 + k.d * 31) % 120;

-- ---------------------------------------------------------------- blog

USE `blog`;

CREATE TABLE `authors` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `bio` TEXT NULL
);

CREATE TABLE `posts` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `author_id` INT UNSIGNED NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `published` TINYINT(1) NOT NULL DEFAULT 0,
    `published_at` DATETIME NULL,
    CONSTRAINT `fk_posts_author` FOREIGN KEY (`author_id`) REFERENCES `authors` (`id`)
);

CREATE TABLE `comments` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `post_id` INT UNSIGNED NOT NULL,
    `author_name` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_comments_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`)
);

INSERT INTO `authors` (`name`, `bio`) VALUES
    ('Alice', 'Writes about databases.'),
    ('Bob', NULL),
    ('Carol', 'Frontend enthusiast. Likes "quotes" and \'apostrophes\'.');

INSERT INTO `posts` (`author_id`, `title`, `body`, `published`, `published_at`)
SELECT
    1 + n % 3,
    CONCAT('Post number ', n),
    CONCAT('Lorem ipsum dolor sit amet, post ', n, '.'),
    n % 4 <> 0,
    IF(n % 4 = 0, NULL, DATE_SUB('2026-09-01', INTERVAL n DAY))
FROM (SELECT a.d * 10 + b.d + 1 AS n FROM `shop`.`digits` a, `shop`.`digits` b) s
WHERE n <= 75;

INSERT INTO `comments` (`post_id`, `author_name`, `content`)
SELECT p.`id`, CONCAT('Reader ', k.d), CONCAT('Comment ', k.d, ' on post ', p.`id`)
FROM `posts` p
JOIN `shop`.`digits` k ON k.d < p.`id` % 4;
