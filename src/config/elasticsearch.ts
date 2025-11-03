import { Client, ClientOptions } from '@elastic/elasticsearch';

const config: ClientOptions = {
    node: process.env['ELASTICSEARCH_URL'] || 'http://localhost:9200',
    tls: {
        rejectUnauthorized: process.env['NODE_ENV'] === 'production',
    },
};

// Add auth only if both username and password are provided
if (process.env['ELASTICSEARCH_USERNAME'] && process.env['ELASTICSEARCH_PASSWORD']) {
    config.auth = {
        username: process.env['ELASTICSEARCH_USERNAME'],
        password: process.env['ELASTICSEARCH_PASSWORD'],
    };
}

export const elasticsearchClient = new Client(config);

export const TICKET_LISTINGS_INDEX = 'ticket_listings';

// Index mapping for ticket listings
export const TICKET_LISTINGS_MAPPING = {
    properties: {
        id: { type: 'keyword' as const },
        sellerId: { type: 'keyword' as const },
        title: {
            type: 'text' as const,
            analyzer: 'standard',
            fields: {
                keyword: { type: 'keyword' as const },
                suggest: {
                    type: 'completion' as const,
                    analyzer: 'simple',
                    preserve_separators: true,
                    preserve_position_increments: true,
                    max_input_length: 50
                }
            }
        },
        description: {
            type: 'text' as const,
            analyzer: 'standard'
        },
        category: { type: 'keyword' as const },
        eventName: {
            type: 'text' as const,
            analyzer: 'standard',
            fields: {
                keyword: { type: 'keyword' as const },
                suggest: {
                    type: 'completion' as const,
                    analyzer: 'simple',
                    preserve_separators: true,
                    preserve_position_increments: true,
                    max_input_length: 50
                }
            }
        },
        eventDate: { type: 'date' as const },
        eventTime: { type: 'keyword' as const },
        venue: {
            type: 'text' as const,
            analyzer: 'standard',
            fields: {
                keyword: { type: 'keyword' as const },
                suggest: {
                    type: 'completion' as const,
                    analyzer: 'simple',
                    preserve_separators: true,
                    preserve_position_increments: true,
                    max_input_length: 50
                }
            }
        },
        seatSection: { type: 'keyword' as const },
        seatRow: { type: 'keyword' as const },
        seatNumber: { type: 'keyword' as const },
        quantity: { type: 'integer' as const },
        originalPrice: { type: 'float' as const },
        askingPrice: { type: 'float' as const },
        images: { type: 'keyword' as const },
        status: { type: 'keyword' as const },
        verificationStatus: { type: 'keyword' as const },
        location: {
            properties: {
                city: {
                    type: 'text' as const,
                    analyzer: 'standard',
                    fields: {
                        keyword: { type: 'keyword' as const },
                        suggest: {
                            type: 'completion' as const,
                            analyzer: 'simple',
                            preserve_separators: true,
                            preserve_position_increments: true,
                            max_input_length: 50
                        }
                    }
                },
                state: {
                    type: 'text' as const,
                    analyzer: 'standard',
                    fields: {
                        keyword: { type: 'keyword' as const }
                    }
                },
                country: {
                    type: 'text' as const,
                    analyzer: 'standard',
                    fields: {
                        keyword: { type: 'keyword' as const }
                    }
                },
                coordinates: { type: 'geo_point' as const }
            }
        },
        createdAt: { type: 'date' as const },
        updatedAt: { type: 'date' as const },
        // Computed fields for search ranking
        popularity: { type: 'float' as const }, // Based on views, favorites, etc.
        sellerRating: { type: 'float' as const },
        priceScore: { type: 'float' as const }, // Normalized price score for ranking
    }
};

export default config;