-- =====================================================
-- Simplified Mountain Hut Availability Display Schema
-- =====================================================
-- Focused on showing availability like booking.com
-- No booking functionality - just availability display

-- Mountain huts/properties
CREATE TABLE properties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    location JSONB,
    booking_system VARCHAR(50), -- 'bentral', 'custom', etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room types with essential display info
CREATE TABLE room_types (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    external_id VARCHAR(100), -- Bentral room ID for scraping
    name VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL, -- Maximum occupancy
    quantity INTEGER NOT NULL DEFAULT 1, -- Number of rooms of this type
    bed_type VARCHAR(100), -- "1 king bed", "2 twin beds", etc.
    room_category VARCHAR(50), -- "private", "shared", "suite"
    features TEXT[], -- ["balcony", "private_bathroom", "mountain_view"]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Available dates - only stores available dates
CREATE TABLE available_dates (
    id BIGSERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    can_checkin BOOLEAN NOT NULL DEFAULT false,
    can_checkout BOOLEAN NOT NULL DEFAULT false,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_available_room_date UNIQUE(property_id, room_type_id, date)
);

-- Indexes for fast queries
CREATE INDEX idx_available_dates_date ON available_dates(date);
CREATE INDEX idx_available_dates_property_date ON available_dates(property_id, date);
CREATE INDEX idx_room_types_property ON room_types(property_id) WHERE is_active = true;

-- Insert room types for Triglavski Dom
INSERT INTO room_types (property_id, external_id, name, capacity, quantity, bed_type, room_category, features) VALUES
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e446b4d', 'Dvoposteljna soba - zakonska postelja', 2, 1, '1 double bed', 'private', '["private_bathroom"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5451794e7a4d4d', 'Enoposteljna soba', 1, 1, '1 single bed', 'private', '["private_bathroom"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e54414d', 'Triposteljna soba', 3, 1, '3 single beds', 'private', '["private_bathroom"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e54454d', 'Štiriposteljna soba', 4, 1, '4 single beds', 'private', '["private_bathroom"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441354d54554d', 'Petposteljna soba', 5, 1, '5 single beds', 'private', '["private_bathroom"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e54494d', 'Šestposteljna soba', 6, 1, '6 single beds', 'private', '["private_bathroom"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5451794e7a594d', 'Skupna ležišča za 7 oseb (A)', 7, 1, '7 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e7a4d4d', 'Skupna ležišča za 7 oseb (B)', 7, 1, '7 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e7a634d', 'Skupna ležišča za 11 oseb', 11, 1, '11 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441314e7a674d', 'Skupna ležišča za 12 oseb', 12, 1, '12 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e7a514d', 'Skupna ležišča za 13 oseb', 13, 1, '13 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e7a594d', 'Skupna ležišča za 14 oseb', 14, 1, '14 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324f44414d', 'Skupna ležišča za 16 oseb', 16, 1, '16 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324e7a674d', 'Skupna ležišča za 20 oseb', 20, 1, '20 beds', 'shared', '["shared_dormitory"]'),
((SELECT id FROM properties WHERE slug = 'triglavski-dom'), '5f5441324f444d4d', 'Skupna ležišča za 30 oseb', 30, 1, '30 beds', 'shared', '["shared_dormitory"]');

-- Example queries for frontend development:

-- Get all room types for a property (for displaying room list)
-- SELECT * FROM room_types WHERE property_id = ? AND is_active = true ORDER BY name;

-- Get availability for a specific date (for showing which rooms are available on a date)
-- SELECT rt.name, rt.capacity, rt.quantity, rt.bed_type, rt.features, ad.can_checkin
-- FROM room_types rt
-- LEFT JOIN available_dates ad ON rt.id = ad.room_type_id AND ad.date = ?
-- WHERE rt.property_id = ? AND rt.is_active = true
-- ORDER BY rt.name;

-- Get date range availability for a room type (for calendar view)
-- SELECT date, can_checkin, can_checkout 
-- FROM available_dates 
-- WHERE room_type_id = ? AND date BETWEEN ? AND ?
-- ORDER BY date;