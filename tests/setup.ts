// Setup environment variables for test suite before modules load
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'mysql://test:test@localhost:3306/test_db';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-must-be-at-least-32-characters-long!';
process.env['CSRF_SECRET'] = 'test-csrf-secret-must-be-at-least-32-characters-long!';
process.env['AWS_REGION'] = 'us-east-1';
process.env['REPORTS_OUTPUT_DIR'] = './storage/test-reports';
