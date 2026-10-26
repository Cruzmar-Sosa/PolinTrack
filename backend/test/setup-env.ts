import * as dotenv from 'dotenv';
import * as path from 'path';

// Force load .env.test before any test file runs
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });
