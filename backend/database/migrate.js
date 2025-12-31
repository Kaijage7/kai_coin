/**
 * Database Migration Script
 * Run this to set up the database schema
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigrations() {
    console.log('🗄️  KAI Database Migration\n');
    console.log('═══════════════════════════════════════\n');

    // Database connection
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        // Connect to database
        console.log('📡 Connecting to database...');
        await client.connect();
        console.log('✅ Connected to database\n');

        // Read schema file
        console.log('📖 Reading schema file...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        console.log('✅ Schema loaded\n');

        // Execute schema
        console.log('⚙️  Creating tables and indexes...');
        await client.query(schema);
        console.log('✅ Schema created successfully!\n');

        // Verify tables
        console.log('🔍 Verifying tables...');
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);

        console.log(`\n📋 Created ${result.rows.length} tables:\n`);
        result.rows.forEach((row, i) => {
            console.log(`   ${(i + 1).toString().padStart(2)}. ${row.table_name}`);
        });

        // Get table row counts
        console.log('\n📊 Table Statistics:\n');
        for (const row of result.rows) {
            const countResult = await client.query(`SELECT COUNT(*) FROM ${row.table_name}`);
            const count = parseInt(countResult.rows[0].count);
            console.log(`   ${row.table_name.padEnd(30)} ${count} rows`);
        }

        console.log('\n═══════════════════════════════════════');
        console.log('✅ MIGRATION COMPLETE!\n');
        console.log('Next steps:');
        console.log('1. Start backend server: npm start');
        console.log('2. Test payment endpoint');
        console.log('3. Check database for revenue records\n');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);

    } finally {
        await client.end();
        console.log('Disconnected from database');
    }
}

// Run migrations
if (require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

module.exports = { runMigrations };
