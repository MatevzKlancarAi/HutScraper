/**
 * Triglavski Dom Mountain Hut Configuration
 * Located on Kredarica, Slovenia's highest mountain hut
 */

module.exports = {
  id: 'triglavski-dom',
  name: 'Triglavski Dom',
  baseUrl: 'https://triglavskidom.si/',
  bookingSystem: 'Bentral',
  
  // Bentral booking system configuration
  bentral: {
    // Direct iframe URL for the booking system
    iframeUrl: 'https://www.bentral.com/service/embed/booking.html?id=5f4451784d415f4e&title=0&width=full&header-bg=edeff4&header-color=363c49&header2-bg=edeff4&header2-color=363c49&table-bg=edeff4&table-color=363c49&btn-bg=12509b&border-width=0&poweredby=0&lang=sl&key=21eb14db6ac1873bf9cbcf78feeddb56',
    
    // Room types and their IDs
    roomTypes: {
      'Dvoposteljna soba - zakonska postelja': '5f5441324e446b4d',
      'Enoposteljna soba': '5f5451794e7a4d4d',
      'Triposteljna soba': '5f5441324e54414d',
      'Štiriposteljna soba': '5f5441324e54454d',
      'Petposteljna soba': '5f5441354d54554d',
      'Šestposteljna soba': '5f5441324e54494d',
      'Skupna ležišča za 7 oseb (A)': '5f5451794e7a594d',
      'Skupna ležišča za 7 oseb (B)': '5f5441324e7a4d4d',
      'Skupna ležišča za 8 oseb (A)': '5f5441394e7a514d',
      'Skupna ležišča za 8 oseb (B)': '5f5441394e7a554d',
      'Skupna ležišča za 10 oseb (A)': '5f5441324e7a594d',
      'Skupna ležišča za 10 oseb (B)': '5f5441324e446f4d',
      'Skupna ležišča za 12 oseb (A)': '5f5441324e52414d',
      'Skupna ležišča za 18 oseb': '5f5441324e52454d',
      'Skupna ležišča za 30 oseb': '5f5451794e52554d'
    },

    // CSS selectors for scraping
    selectors: {
      roomSelect: 'select[name="roomType"]',
      arrivalInput: 'input[name="arrival"]',
      monthNavNext: '.ui-datepicker-next',
      monthNavPrev: '.ui-datepicker-prev',
      calendarTitle: '.ui-datepicker-title',
      calendarDays: 'table.ui-datepicker-calendar tbody td'
    },

    // CSS classes for availability detection
    availability: {
      required: ['day'],
      excluded: ['unavail', 'disabled', 'old', 'new'],
      excludedTitle: 'Zasedeno',
      partialStart: 'unavail_start',
      partialEnd: 'unavail_end'
    }
  },

  // Location and contact information
  location: {
    altitude: 2515,
    coordinates: {
      latitude: 46.3783,
      longitude: 13.8372
    },
    region: 'Julian Alps',
    country: 'Slovenia'
  },

  // Additional metadata
  metadata: {
    capacity: 150,
    season: 'year-round',
    description: 'Slovenia\'s highest mountain hut located below Triglav peak',
    features: ['restaurant', 'dormitories', 'private_rooms', 'emergency_shelter']
  }
};