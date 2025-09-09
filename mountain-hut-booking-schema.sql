-- =====================================================
-- Mountain Hut Booking System - Core Tables Only
-- =====================================================

-- Properties (mountain huts, hotels, etc.)
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    location JSONB,
    booking_system VARCHAR(50),
    booking_config JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room types within each property
CREATE TABLE room_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    external_id VARCHAR(100), -- Bentral room ID
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    capacity INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'private_room', 'shared_dormitory'
    bed_configuration JSONB,
    base_price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily availability - the heart of the booking system
CREATE TABLE daily_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    availability_status VARCHAR(20) NOT NULL, -- 'available', 'partial_no_start', 'partial_no_end', 'unavailable'
    can_checkin BOOLEAN NOT NULL DEFAULT false,
    can_checkout BOOLEAN NOT NULL DEFAULT false,
    price DECIMAL(10,2),
    minimum_stay INTEGER DEFAULT 1,
    raw_scraper_data JSONB,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_property_room_date UNIQUE(property_id, room_type_id, date)
);

-- Pre-aggregated monthly availability for fast queries
CREATE TABLE monthly_availability_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    total_days INTEGER NOT NULL,
    available_days INTEGER NOT NULL DEFAULT 0,
    fully_available_days INTEGER NOT NULL DEFAULT 0,
    partially_available_days INTEGER NOT NULL DEFAULT 0,
    availability_rate DECIMAL(5,2),
    best_booking_windows TEXT[],
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_room_year_month UNIQUE(property_id, room_type_id, year, month)
);

-- Consecutive booking windows for quick search
CREATE TABLE booking_windows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration INTEGER,
    window_type VARCHAR(20) NOT NULL, -- 'fully_available', 'mixed_availability'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track scraping sessions
CREATE TABLE scraping_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(id),
    session_type VARCHAR(50) NOT NULL,
    date_range_start DATE,
    date_range_end DATE,
    room_types_scraped UUID[],
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    stats JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Track availability changes
CREATE TABLE availability_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    old_price DECIMAL(10,2),
    new_price DECIMAL(10,2),
    change_type VARCHAR(30) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);