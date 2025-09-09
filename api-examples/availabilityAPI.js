/**
 * Mountain Hut Availability API Examples
 * RESTful API structure for displaying availability data like booking.com
 */

// Example using Express.js - adapt for your framework of choice

const express = require('express');
const router = express.Router();

// Mock database connection - replace with your actual DB library (pg, prisma, etc.)
const db = {
  query: async (sql, params) => {
    // Your database query implementation
    console.log('Executing:', sql, params);
    return { rows: [] };
  }
};

/**
 * GET /api/properties
 * List all properties (mountain huts)
 */
router.get('/properties', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, slug, location, booking_system
      FROM properties 
      WHERE is_active = true
      ORDER BY name
    `);

    res.json({
      success: true,
      data: result.rows.map(property => ({
        id: property.id,
        name: property.name,
        slug: property.slug,
        location: property.location,
        bookingSystem: property.booking_system
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/:slug/rooms
 * Get all room types for a property (like booking.com room list)
 * Example: /api/properties/triglavski-dom/rooms
 */
router.get('/properties/:slug/rooms', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const result = await db.query(`
      SELECT 
        rt.id,
        rt.name,
        rt.capacity,
        rt.bed_type,
        rt.room_category,
        rt.features,
        rt.display_order
      FROM room_types rt
      JOIN properties p ON rt.property_id = p.id
      WHERE p.slug = $1 AND rt.is_active = true
      ORDER BY rt.display_order
    `, [slug]);

    res.json({
      success: true,
      data: result.rows.map(room => ({
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        bedType: room.bed_type,
        category: room.room_category,
        features: room.features,
        displayOrder: room.display_order
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/:slug/availability
 * Get availability for all rooms on a specific date (main booking.com view)
 * Example: /api/properties/triglavski-dom/availability?date=2025-12-25
 */
router.get('/properties/:slug/availability', async (req, res) => {
  try {
    const { slug } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        success: false, 
        error: 'Date parameter is required (YYYY-MM-DD format)' 
      });
    }

    const result = await db.query(`
      SELECT 
        rt.id,
        rt.name,
        rt.capacity,
        rt.bed_type,
        rt.room_category,
        rt.features,
        COALESCE(da.is_available, false) as is_available,
        COALESCE(da.can_checkin, false) as can_checkin,
        COALESCE(da.can_checkout, false) as can_checkout,
        da.scraped_at
      FROM room_types rt
      JOIN properties p ON rt.property_id = p.id
      LEFT JOIN daily_availability da ON rt.id = da.room_type_id 
        AND da.date = $2
      WHERE p.slug = $1 AND rt.is_active = true
      ORDER BY rt.display_order
    `, [slug, date]);

    res.json({
      success: true,
      date: date,
      property: slug,
      rooms: result.rows.map(room => ({
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        bedType: room.bed_type,
        category: room.room_category,
        features: room.features,
        availability: {
          isAvailable: room.is_available,
          canCheckin: room.can_checkin,
          canCheckout: room.can_checkout,
          lastUpdated: room.scraped_at
        }
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/:slug/rooms/:roomId/calendar
 * Get calendar availability for a specific room (date range)
 * Example: /api/properties/triglavski-dom/rooms/123/calendar?start=2025-12-01&end=2025-12-31
 */
router.get('/properties/:slug/rooms/:roomId/calendar', async (req, res) => {
  try {
    const { slug, roomId } = req.params;
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ 
        success: false, 
        error: 'Both start and end date parameters are required (YYYY-MM-DD format)' 
      });
    }

    const result = await db.query(`
      SELECT 
        da.date,
        da.is_available,
        da.can_checkin,
        da.can_checkout,
        EXTRACT(DOW FROM da.date) as day_of_week,
        CASE 
          WHEN EXTRACT(DOW FROM da.date) IN (5,6) THEN 'weekend'
          ELSE 'weekday'
        END as day_type
      FROM daily_availability da
      JOIN room_types rt ON da.room_type_id = rt.id
      JOIN properties p ON da.property_id = p.id
      WHERE p.slug = $1
        AND rt.id = $2
        AND da.date BETWEEN $3 AND $4
      ORDER BY da.date
    `, [slug, roomId, start, end]);

    res.json({
      success: true,
      roomId: roomId,
      dateRange: { start, end },
      calendar: result.rows.map(day => ({
        date: day.date,
        isAvailable: day.is_available,
        canCheckin: day.can_checkin,
        canCheckout: day.can_checkout,
        dayOfWeek: day.day_of_week,
        dayType: day.day_type
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/:slug/search
 * Search for available rooms in a date range (booking search functionality)
 * Example: /api/properties/triglavski-dom/search?checkin=2025-12-20&checkout=2025-12-27&guests=2
 */
router.get('/properties/:slug/search', async (req, res) => {
  try {
    const { slug } = req.params;
    const { checkin, checkout, guests = 1 } = req.query;
    
    if (!checkin || !checkout) {
      return res.status(400).json({ 
        success: false, 
        error: 'Both checkin and checkout dates are required' 
      });
    }

    const result = await db.query(`
      SELECT 
        rt.id,
        rt.name,
        rt.capacity,
        rt.bed_type,
        rt.room_category,
        rt.features,
        COUNT(da.date) as total_days,
        COUNT(da.date) FILTER (WHERE da.is_available = true) as available_days,
        COUNT(da.date) FILTER (WHERE da.can_checkin = true) as checkin_days,
        COUNT(da.date) FILTER (WHERE da.can_checkout = true) as checkout_days,
        ROUND(COUNT(da.date) FILTER (WHERE da.is_available = true) * 100.0 / COUNT(da.date), 1) as availability_percentage
      FROM room_types rt
      JOIN properties p ON rt.property_id = p.id
      LEFT JOIN daily_availability da ON rt.id = da.room_type_id 
        AND da.date BETWEEN $2 AND $3
      WHERE p.slug = $1 
        AND rt.is_active = true
        AND rt.capacity >= $4
      GROUP BY rt.id, rt.name, rt.capacity, rt.bed_type, rt.room_category, rt.features, rt.display_order
      HAVING COUNT(da.date) FILTER (WHERE da.is_available = true) = COUNT(da.date)  -- All days must be available
      ORDER BY rt.display_order
    `, [slug, checkin, checkout, guests]);

    res.json({
      success: true,
      searchCriteria: {
        property: slug,
        checkin,
        checkout,
        guests: parseInt(guests)
      },
      availableRooms: result.rows.map(room => ({
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        bedType: room.bed_type,
        category: room.room_category,
        features: room.features,
        stayInfo: {
          totalDays: room.total_days,
          availableDays: room.available_days,
          availabilityPercentage: room.availability_percentage,
          fullyAvailable: room.available_days === room.total_days
        }
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/:slug/analytics
 * Get availability analytics (monthly summaries, trends, etc.)
 * Example: /api/properties/triglavski-dom/analytics?year=2025
 */
router.get('/properties/:slug/analytics', async (req, res) => {
  try {
    const { slug } = req.params;
    const { year = new Date().getFullYear() } = req.query;

    const monthlyData = await db.query(`
      SELECT 
        rt.name as room_type,
        rt.id as room_type_id,
        EXTRACT(MONTH FROM da.date) as month,
        TO_CHAR(da.date, 'Month YYYY') as month_label,
        COUNT(*) as total_days,
        COUNT(*) FILTER (WHERE da.is_available = true) as available_days,
        ROUND(COUNT(*) FILTER (WHERE da.is_available = true) * 100.0 / COUNT(*), 1) as availability_rate
      FROM daily_availability da
      JOIN room_types rt ON da.room_type_id = rt.id
      JOIN properties p ON da.property_id = p.id
      WHERE p.slug = $1
        AND EXTRACT(YEAR FROM da.date) = $2
      GROUP BY rt.id, rt.name, EXTRACT(MONTH FROM da.date), TO_CHAR(da.date, 'Month YYYY')
      ORDER BY rt.display_order, month
    `, [slug, year]);

    // Group by room type
    const roomAnalytics = monthlyData.rows.reduce((acc, row) => {
      if (!acc[row.room_type_id]) {
        acc[row.room_type_id] = {
          roomType: row.room_type,
          months: []
        };
      }
      
      acc[row.room_type_id].months.push({
        month: row.month,
        monthLabel: row.month_label.trim(),
        totalDays: row.total_days,
        availableDays: row.available_days,
        availabilityRate: parseFloat(row.availability_rate)
      });
      
      return acc;
    }, {});

    res.json({
      success: true,
      year: parseInt(year),
      property: slug,
      analytics: Object.values(roomAnalytics)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/:slug/best-windows
 * Find best consecutive availability windows
 * Example: /api/properties/triglavski-dom/best-windows?min_days=3
 */
router.get('/properties/:slug/best-windows', async (req, res) => {
  try {
    const { slug } = req.params;
    const { min_days = 3 } = req.query;

    const result = await db.query(`
      WITH availability_groups AS (
        SELECT 
          rt.id as room_type_id,
          rt.name as room_type,
          da.date,
          da.is_available,
          da.date - INTERVAL '1 day' * ROW_NUMBER() OVER (
            PARTITION BY rt.id, da.is_available 
            ORDER BY da.date
          ) as group_date
        FROM daily_availability da
        JOIN room_types rt ON da.room_type_id = rt.id
        JOIN properties p ON da.property_id = p.id
        WHERE p.slug = $1
          AND da.is_available = true
          AND da.date >= CURRENT_DATE
      )
      SELECT 
        room_type_id,
        room_type,
        MIN(date) as period_start,
        MAX(date) as period_end,
        COUNT(*) as consecutive_days
      FROM availability_groups
      GROUP BY room_type_id, room_type, group_date
      HAVING COUNT(*) >= $2
      ORDER BY consecutive_days DESC, period_start
    `, [slug, min_days]);

    res.json({
      success: true,
      property: slug,
      minDays: parseInt(min_days),
      bestWindows: result.rows.map(window => ({
        roomTypeId: window.room_type_id,
        roomType: window.room_type,
        startDate: window.period_start,
        endDate: window.period_end,
        consecutiveDays: window.consecutive_days
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

/**
 * Usage Examples for Frontend Development:
 * 
 * 1. Show all rooms with today's availability:
 *    GET /api/properties/triglavski-dom/availability?date=2025-08-30
 * 
 * 2. Search for 2-person room for Christmas week:
 *    GET /api/properties/triglavski-dom/search?checkin=2025-12-20&checkout=2025-12-27&guests=2
 * 
 * 3. Get room calendar for December:
 *    GET /api/properties/triglavski-dom/rooms/123/calendar?start=2025-12-01&end=2025-12-31
 * 
 * 4. Get monthly analytics for the year:
 *    GET /api/properties/triglavski-dom/analytics?year=2025
 * 
 * 5. Find best availability windows (3+ consecutive days):
 *    GET /api/properties/triglavski-dom/best-windows?min_days=3
 */

/**
 * Frontend Implementation Notes:
 * 
 * For a booking.com-style interface, you would:
 * 
 * 1. Use /availability endpoint to show the main room list with today's status
 * 2. Use /search endpoint when user selects dates and guest count
 * 3. Use /calendar endpoint to show detailed availability calendar for each room
 * 4. Use /analytics for charts and insights pages
 * 5. Use /best-windows to highlight great booking opportunities
 * 
 * The API responses are designed to be consumed directly by React, Vue, or vanilla JavaScript.
 */