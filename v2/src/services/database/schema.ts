import {
  bigint,
  boolean,
  date,
  index,
  integer,
  json,
  pgSchema,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Availability schema (matches existing database structure)
 */
export const availabilitySchema = pgSchema('availability');

/**
 * Properties table (mountain huts)
 * NOTE: Uses manual ID generation (MAX(id) + 1) to avoid sequence permission issues
 */
export const properties = availabilitySchema.table(
  'properties',
  {
    id: integer('id').primaryKey().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    location: json('location').$type<{
      country?: string;
      region?: string;
      latitude?: number;
      longitude?: number;
      elevation?: number;
    }>(),
    bookingSystem: varchar('booking_system', { length: 50 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => ({
    nameIdx: index('properties_name_idx').on(table.name),
    bookingSystemIdx: index('properties_booking_system_idx').on(table.bookingSystem),
  })
);

/**
 * Room types table
 * NOTE: Uses manual ID generation (MAX(id) + 1) to avoid sequence permission issues
 */
export const roomTypes = availabilitySchema.table(
  'room_types',
  {
    id: integer('id').primaryKey().notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id, { onDelete: 'cascade' })
      .notNull(),
    externalId: varchar('external_id', { length: 100 }),
    name: varchar('name', { length: 255 }).notNull(),
    capacity: integer('capacity'),
    quantity: integer('quantity'),
    bedType: varchar('bed_type', { length: 100 }),
    roomCategory: varchar('room_category', { length: 50 }),
    features: json('features').$type<string[]>(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    propertyIdx: index('room_types_property_idx').on(table.propertyId),
    externalIdIdx: index('room_types_external_id_idx').on(table.externalId),
    propertyExternalIdIdx: uniqueIndex('room_types_property_external_id_idx').on(
      table.propertyId,
      table.externalId
    ),
  })
);

/**
 * Available dates table
 * NOTE: Only stores AVAILABLE dates. When a date becomes unavailable, it's deleted.
 * NOTE: Uses manual ID generation (MAX(id) + 1) to avoid sequence permission issues
 */
export const availableDates = availabilitySchema.table(
  'available_dates',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id, { onDelete: 'cascade' })
      .notNull(),
    roomTypeId: integer('room_type_id')
      .references(() => roomTypes.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date', { mode: 'date' }).notNull(),
    canCheckin: boolean('can_checkin').default(false).notNull(),
    canCheckout: boolean('can_checkout').default(false).notNull(),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    dateIdx: index('available_dates_date_idx').on(table.date),
    propertyDateIdx: index('available_dates_property_date_idx').on(table.propertyId, table.date),
    roomTypeDateIdx: index('available_dates_room_type_date_idx').on(table.roomTypeId, table.date),
    uniqueConstraint: uniqueIndex('available_dates_unique_idx').on(
      table.propertyId,
      table.roomTypeId,
      table.date
    ),
  })
);

/**
 * Type exports for use throughout the application
 */
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

export type RoomType = typeof roomTypes.$inferSelect;
export type NewRoomType = typeof roomTypes.$inferInsert;

export type AvailableDate = typeof availableDates.$inferSelect;
export type NewAvailableDate = typeof availableDates.$inferInsert;

/**
 * Relations (for Drizzle queries)
 */
import { relations } from 'drizzle-orm';

export const propertiesRelations = relations(properties, ({ many }) => ({
  roomTypes: many(roomTypes),
  availableDates: many(availableDates),
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
  property: one(properties, {
    fields: [roomTypes.propertyId],
    references: [properties.id],
  }),
  availableDates: many(availableDates),
}));

export const availableDatesRelations = relations(availableDates, ({ one }) => ({
  property: one(properties, {
    fields: [availableDates.propertyId],
    references: [properties.id],
  }),
  roomType: one(roomTypes, {
    fields: [availableDates.roomTypeId],
    references: [roomTypes.id],
  }),
}));
