import { db } from '@services/database/client';
import { AvailabilityRepository } from '@services/database/repositories/AvailabilityRepository';
import { PropertyRepository } from '@services/database/repositories/PropertyRepository';
import { RoomTypeRepository } from '@services/database/repositories/RoomTypeRepository';
import { logger } from '@services/logger';
import { Hono } from 'hono';

const app = new Hono();

const propertyRepository = new PropertyRepository(db);
const roomTypeRepository = new RoomTypeRepository(db);
const availabilityRepository = new AvailabilityRepository(db);

// Get all properties
app.get('/', async (c) => {
  try {
    const bookingSystem = c.req.query('bookingSystem');
    const limit = Number.parseInt(c.req.query('limit') || '100');
    const offset = Number.parseInt(c.req.query('offset') || '0');

    let allProperties;

    if (bookingSystem) {
      allProperties = await propertyRepository.findByBookingSystem(bookingSystem);
    } else {
      allProperties = await propertyRepository.findAllActive();
    }

    // Apply pagination manually
    const paginated = allProperties.slice(offset, offset + limit);

    return c.json({
      properties: paginated,
      total: allProperties.length,
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch properties');
    throw error;
  }
});

// Get property by ID
app.get('/:id', async (c) => {
  try {
    const id = Number.parseInt(c.req.param('id'));
    const property = await propertyRepository.findById(id);

    if (!property) {
      return c.json({ error: 'Property not found' }, 404);
    }

    return c.json(property);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch property');
    throw error;
  }
});

// Get room types for a property
app.get('/:id/room-types', async (c) => {
  try {
    const propertyId = Number.parseInt(c.req.param('id'));
    const roomTypes = await roomTypeRepository.findByPropertyId(propertyId);

    return c.json({
      roomTypes,
      total: roomTypes.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch room types');
    throw error;
  }
});

// Get availability for a property or room type
app.get('/:id/availability', async (c) => {
  try {
    const propertyId = Number.parseInt(c.req.param('id'));
    const roomTypeIdStr = c.req.query('roomTypeId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    if (!startDate || !endDate) {
      return c.json({ error: 'startDate and endDate are required' }, 400);
    }

    let availableDates;

    if (roomTypeIdStr) {
      // Get availability for specific room type
      const roomTypeId = Number.parseInt(roomTypeIdStr);
      availableDates = await availabilityRepository.findByRoomTypeAndDateRange(
        roomTypeId,
        new Date(startDate),
        new Date(endDate)
      );
    } else {
      // Get availability for all room types in the property
      const roomTypes = await roomTypeRepository.findByPropertyId(propertyId);
      const allDates = await Promise.all(
        roomTypes.map((rt) =>
          availabilityRepository.findByRoomTypeAndDateRange(
            rt.id,
            new Date(startDate),
            new Date(endDate)
          )
        )
      );
      availableDates = allDates.flat();
    }

    return c.json({
      propertyId,
      roomTypeId: roomTypeIdStr,
      startDate,
      endDate,
      availableDates,
      total: availableDates.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch availability');
    throw error;
  }
});

// Search properties by name
app.get('/search/:query', async (c) => {
  try {
    const query = c.req.param('query');
    const allProperties = await propertyRepository.findAllActive();

    const results = allProperties.filter((p: { name: string }) =>
      p.name.toLowerCase().includes(query.toLowerCase())
    );

    return c.json({
      query,
      results,
      total: results.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to search properties');
    throw error;
  }
});

export { app as propertiesRoutes };
