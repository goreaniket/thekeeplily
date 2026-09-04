CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`occasion` text,
	`product_type` text,
	`budget` real,
	`required_by` text,
	`details` text NOT NULL,
	`colours_theme` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`gift_message` text,
	`reference_image_key` text,
	`notes` text,
	`status` text DEFAULT 'RECEIVED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`address_json` text NOT NULL,
	`items_json` text NOT NULL,
	`variants_json` text NOT NULL,
	`personalisation_json` text NOT NULL,
	`subtotal` real NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`shipping_charge` real,
	`total` real NOT NULL,
	`payment_method` text NOT NULL,
	`payment_status` text NOT NULL,
	`order_status` text NOT NULL,
	`tracking_number` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`other_category` text,
	`short_description` text NOT NULL,
	`full_description` text NOT NULL,
	`regular_price` real NOT NULL,
	`sale_price` real,
	`main_image` text NOT NULL,
	`additional_images_json` text DEFAULT '[]' NOT NULL,
	`material` text NOT NULL,
	`dimensions` text NOT NULL,
	`colours_json` text DEFAULT '[]' NOT NULL,
	`sizes_json` text DEFAULT '[]' NOT NULL,
	`variants_json` text DEFAULT '[]' NOT NULL,
	`variant_pricing_json` text DEFAULT '{}' NOT NULL,
	`customisable` integer DEFAULT false NOT NULL,
	`customisation_options_json` text DEFAULT '[]' NOT NULL,
	`customisation_charge` real DEFAULT 0 NOT NULL,
	`customisation_notes` text DEFAULT '' NOT NULL,
	`stock_quantity` integer,
	`availability` text NOT NULL,
	`made_to_order` integer DEFAULT false NOT NULL,
	`preparation_time` text NOT NULL,
	`care_instructions` text NOT NULL,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`visibility` integer DEFAULT true NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`bestseller` integer DEFAULT false NOT NULL,
	`new_arrival` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);